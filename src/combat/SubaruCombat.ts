import { Color, Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import { clamp } from '../core/math/MathUtil';
import type { GameContext } from '../game/GameContext';
import type { PlayerController } from '../player/PlayerController';
import { ParticlePresets } from '../vfx/ParticleEmitter';
import { hostile, type DamageInfo } from './Damage';
import { BarrierVfx } from './effects/BarrierVfx';
import { Health } from './Health';
import { WhipProp } from './props/WhipProp';

type State = 'free' | 'attack' | 'dodge' | 'cast' | 'barrier' | 'item' | 'stagger' | 'down';

interface WhipStep {
  clip: string;
  /** The keyframed clip's own length (it is sped up to fit `duration`). */
  clipLength: number;
  duration: number;
  contact: number;
  damage: number;
  stagger: number;
  side: number;
  arc: number;
}

// Snappy: a crack lands ~0.23 s after the press, and the next swing can be
// chained the moment it does.
const COMBO: WhipStep[] = [
  { clip: 'whip1', clipLength: 0.62, duration: 0.52, contact: 0.44, damage: 6, stagger: 8, side: 1, arc: 75 },
  { clip: 'whip2', clipLength: 0.6, duration: 0.5, contact: 0.44, damage: 6, stagger: 8, side: -1, arc: 90 },
  { clip: 'whip3', clipLength: 0.85, duration: 0.74, contact: 0.5, damage: 12, stagger: 22, side: 1, arc: 65 },
];
const SNARE: WhipStep = { clip: 'whipSnare', clipLength: 0.75, duration: 0.68, contact: 0.42, damage: 4, stagger: 30, side: 1, arc: 25 };
/** How long a press is remembered while Subaru is busy. */
const BUFFER = 0.4;
/** A dodge this fresh when a blow passes through it is a perfect dodge. */
const PERFECT_WINDOW = 0.28;

export interface SubaruCooldowns {
  shamak: number;
  barrier: number;
  snare: number;
}

/**
 * Subaru in a fight. He is not a warrior: a whip for reach and interrupts,
 * a clumsy dive to get out of the way, and everything else through others —
 * Beatrice's Yin magic channelled through his damaged gate (Shamak, the
 * E·M·M barrier), orders to the party, and tonics.
 */
export class SubaruCombat extends Component {
  readonly health: Health;
  state: State = 'free';
  private stateTime = 0;
  private comboIndex = 0;
  private comboWindow = 0;
  private queued: 'attack' | 'snare' | 'dodge' | null = null;
  private queuedAge = 0;
  private dodgeAge = 99;
  private perfectThisDodge = false;
  private step: WhipStep | null = null;
  private hitDone = false;
  private whip!: WhipProp;
  private barrierVfx!: BarrierVfx;
  /** Beatrice's mana, lent through the contract. */
  mana = 100;
  readonly maxMana = 100;
  readonly cooldowns: SubaruCooldowns = { shamak: 0, barrier: 0, snare: 0 };
  private nextCritical = false;
  private absorbedDuringBarrier = false;
  lockTarget: Health | null = null;
  private readonly lockPoint = new Vector3();
  private deathTimer = 0;

  constructor(
    private readonly game: GameContext,
    private readonly player: PlayerController,
  ) {
    super();
    this.health = new Health({ max: 100, faction: 'party', name: 'Subaru', characterId: 'subaru', poise: 16, poiseRegen: 10, radius: 0.3, height: 1.73 });
  }

  override onAttach(): void {
    this.entity.add(this.health);
    this.game.combat.register(this.health);
    this.whip = new WhipProp(this.player.visual, this.game.render.scene);
    this.game.events.on('player:visualChanged', () => this.whip.setVisual(this.player.visual));
    this.barrierVfx = new BarrierVfx(this.game.render.scene, new Color(0.62, 0.36, 1.0), 1.05);
    this.player.onDodgeRequested = () => this.tryDodge();
    // Blows that pass through invulnerability: the barrier soaks them (and
    // sets up a counter); a fresh dodge slips them (a perfect dodge).
    this.health.onEvade = () => {
      if (this.state === 'barrier') {
        this.absorbedDuringBarrier = true;
        this.barrierVfx.pulse();
      } else if (this.state === 'dodge' && this.dodgeAge < PERFECT_WINDOW && !this.perfectThisDodge) this.perfectDodge();
    };
    this.health.onHit = (r) => {
      if (r.killed) return;
      if (r.staggered) this.enter('stagger', 0.85, () => void this.player.visual.play('stagger', { fadeIn: 0.03 }));
      else void this.player.visual.play('flinch', { fadeIn: 0.03 });
    };
    this.health.onDeath = (info) => this.die(info);
    if (!this.game.state.has('inv.tonic')) this.game.state.set('inv.tonic', 3);
  }

  override onDetach(): void {
    this.game.combat.unregister(this.health);
    this.whip.dispose();
    this.barrierVfx.dispose();
  }

  // ------------------------------------------------------------------ helpers
  private get beatrice() {
    const b = this.game.party.follower('beatrice');
    return b && b.position.distanceTo(this.entity.object3D.position) < 14 ? b : null;
  }

  get beatricePresent(): boolean {
    return this.beatrice !== null;
  }

  get tonics(): number {
    return this.game.state.num('inv.tonic');
  }

  private enter(state: State, seconds: number, onEnter?: () => void): void {
    this.state = state;
    this.stateTime = seconds;
    onEnter?.();
    if (state === 'free') this.player.unlock('combat');
    else this.player.lock('combat');
  }

  private forward(out = new Vector3()): Vector3 {
    return out.set(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
  }

  /** Where Subaru is aiming: lock target, else a soft target in front, else straight ahead. */
  private aimTarget(range: number): { point: Vector3; target: Health | null } {
    const pos = this.entity.object3D.position;
    let target = this.lockTarget && this.lockTarget.alive ? this.lockTarget : null;
    if (!target) {
      const fwd = this.forward(_f);
      const candidates = this.game.combat.arc(_o.copy(pos).setY(pos.y + 1), fwd, range + 1.5, 150, { hostileTo: 'party' });
      candidates.sort((a, b) => a.entity.object3D.position.distanceTo(pos) - b.entity.object3D.position.distanceTo(pos));
      target = candidates[0] ?? null;
    }
    if (target) return { point: target.center(new Vector3()), target };
    return { point: this.forward(new Vector3()).multiplyScalar(range).add(pos).setY(pos.y + 1.1), target: null };
  }

  private faceTowards(p: Vector3): void {
    const pos = this.entity.object3D.position;
    this.player.yaw = Math.atan2(p.x - pos.x, p.z - pos.z);
  }

  // ------------------------------------------------------------------ actions
  private attack(step: WhipStep): void {
    const { point, target } = this.aimTarget(step === SNARE ? 5.5 : 4.6);
    if (target) {
      this.faceTowards(point);
      if (!this.lockTarget) this.game.camera.follow.assist(point);
      // Close the gap: a quick step in so the crack connects at the whip's
      // sweet spot instead of whiffing at the edge of its reach.
      const pos = this.entity.object3D.position;
      const d = Math.hypot(point.x - pos.x, point.z - pos.z) - target.radius;
      const want = step === SNARE ? 3.4 : 2.1;
      if (d > want + 0.15) this.player.dash(_d.set(point.x - pos.x, 0, point.z - pos.z).normalize(), Math.min(1.6, d - want), 0.16, true);
    }
    this.step = step;
    this.hitDone = false;
    this.enter('attack', step.duration);
    void this.player.visual.play(step.clip, { fadeIn: 0.04, speed: step.clipLength / step.duration });
    this.whip.strike(point, step.duration * step.contact, step.duration, step.side);
    this.player.stamina = Math.max(0, this.player.stamina - 5);
    this.game.events.emit('combat:playerAction', { kind: 'whip' });
  }

  private resolveWhipHit(): void {
    const step = this.step!;
    const pos = this.entity.object3D.position;
    const origin = _o.copy(pos).setY(pos.y + 1.1);
    const reach = step === SNARE ? 4.6 : 3.3;
    const hits = this.game.combat.arc(origin, this.forward(_f), reach, step.arc, { hostileTo: 'party', lineOfSightFrom: origin });
    const critical = this.nextCritical;
    if (hits.length) this.nextCritical = false;
    for (const h of step === SNARE ? hits.slice(0, 1) : hits.slice(0, 3)) {
      const dir = h.entity.object3D.position.clone().sub(pos).setY(0).normalize();
      this.game.combat.damage(h, {
        amount: step.damage,
        type: 'physical',
        sourceId: this.entity.id,
        point: h.center(new Vector3()),
        direction: dir,
        stagger: step.stagger,
        critical,
        tags: step === SNARE ? ['melee', 'whip', 'snare'] : ['melee', 'whip'],
      });
    }
    // The crack itself: a spark at the tip even on a miss.
    this.game.combat.impacts.burst('physical', this.whip.tip, hits.length ? 6 : 10);
  }

  tryDodge(): void {
    if (this.state === 'down' || this.state === 'stagger' || this.state === 'barrier') return;
    // Busy (mid-dodge, the crack itself): remember the press for a moment.
    if (this.state === 'dodge' || (this.state === 'attack' && this.inActiveFrames())) {
      this.buffer('dodge');
      return;
    }
    if (this.player.stamina < 18) return;
    this.queued = null;
    this.player.stamina -= 18;
    this.whip.cancel();
    const input = this.game.input.move;
    const f = this.game.camera.follow.groundForward(_f);
    const r = this.game.camera.follow.groundRight(_r);
    const dir = _d.copy(f).multiplyScalar(input.y).addScaledVector(r, input.x);
    if (dir.lengthSq() < 0.04) dir.copy(this.forward(_d)).negate(); // no input: hop back
    const strafing = this.lockTarget !== null;
    this.player.dash(dir, 3.1, 0.38, !strafing);
    this.health.grantInvulnerability(0.32);
    this.dodgeAge = 0;
    this.perfectThisDodge = false;
    this.enter('dodge', 0.5, () => void this.player.visual.play('dodge', { fadeIn: 0.03 }));
  }

  /** Swing windup → cancellable; the 70 ms around the crack are committed. */
  private inActiveFrames(): boolean {
    if (!this.step) return false;
    const t = this.step.duration - this.stateTime;
    const contact = this.step.duration * this.step.contact;
    return t > contact - 0.07 && !this.hitDone;
  }

  private buffer(kind: 'attack' | 'snare' | 'dodge'): void {
    this.queued = kind;
    this.queuedAge = 0;
  }

  /** Slipped a blow at the last instant: time slows, the counter is critical. */
  private perfectDodge(): void {
    this.perfectThisDodge = true;
    this.nextCritical = true;
    this.health.grantInvulnerability(0.35);
    this.player.stamina = Math.min(this.player.movement.maxStamina, this.player.stamina + 20);
    this.game.time.slowMotion(0.3, 0.55);
    this.game.render.chromaticPulse = Math.max(this.game.render.chromaticPulse, 1.4);
    this.game.camera.shake.add(0.12);
    this.game.events.emit('combat:perfectDodge', { position: this.health.center(new Vector3()) });
  }

  private castShamak(): void {
    if (this.cooldowns.shamak > 0 || this.mana < 30 || !this.beatrice) return;
    this.mana -= 30;
    this.cooldowns.shamak = 12;
    const { point, target } = this.aimTarget(7);
    this.faceTowards(point);
    this.enter('cast', 0.9, () => void this.player.visual.play('castShamak', { fadeIn: 0.05 }));
    this.game.events.emit('bark:play', { speakerId: 'subaru', text: 'Shamak!', duration: 1.4 });
    this.game.events.emit('combat:playerAction', { kind: 'shamak' });
    // On the ground under the target (or where Subaru points).
    const center = target ? target.entity.object3D.position.clone() : point.clone().setY(this.entity.object3D.position.y);
    void this.game.scheduler.wait(0.38).then(() => {
      this.game.combat.addArea({
        id: 'shamak',
        center,
        radius: 3.6,
        duration: 6,
        interval: 0.5,
        filter: (h) => hostile('party', h.effectiveFaction),
        onTick: (h) => h.applyStatus({ id: 'blinded', seconds: 2.5 }),
        ringColor: new Color(0.45, 0.2, 0.7),
        particles: {
          ...ParticlePresets.motes(new Color(0.1, 0.03, 0.16), 3.2, 220),
          additive: false,
          size: [0.9, 1.7],
          alpha: 0.85,
          lifetime: [1.4, 2.4],
          rate: 110,
          velocityMin: new Vector3(-0.3, 0.1, -0.3),
          velocityMax: new Vector3(0.3, 0.6, 0.3),
          intensity: 1,
        },
      });
    });
  }

  private castBarrier(): void {
    if (this.cooldowns.barrier > 0 || this.mana < 25 || !this.beatrice) return;
    this.mana -= 25;
    this.cooldowns.barrier = 8;
    this.absorbedDuringBarrier = false;
    this.whip.cancel();
    this.health.lockInvulnerable(true);
    this.barrierVfx.show(true);
    this.enter('barrier', 1.25, () => void this.player.visual.play('barrier', { fadeIn: 0.03 }));
    this.game.events.emit('bark:play', { speakerId: 'subaru', text: 'E·M·M!', duration: 1.2 });
    this.game.events.emit('combat:playerAction', { kind: 'barrier' });
  }

  private endBarrier(): void {
    this.health.lockInvulnerable(false);
    this.barrierVfx.show(false);
    // Weathering a blow inside the barrier sets up a critical counter.
    if (this.absorbedDuringBarrier) this.nextCritical = true;
  }

  /** Drink a tonic (quick item or the inventory). False if there's none or no need. */
  drinkTonic(): boolean {
    if (this.tonics <= 0 || this.health.hp >= this.health.max || this.state !== 'free') return false;
    this.game.state.add('inv.tonic', -1);
    this.enter('item', 1.1, () =>
      void this.player.visual.play('drink', {
        onContact: () => {
          this.game.combat.heal(this.health, 35);
          this.player.stamina = Math.min(this.player.movement.maxStamina, this.player.stamina + 30);
        },
      }),
    );
    this.game.ui.notify(`Tonic ×${this.tonics}`, 'item');
    return true;
  }

  private orderParty(kind: 'focus' | 'regroup'): void {
    const target = kind === 'focus' ? (this.lockTarget?.alive ? this.lockTarget : this.aimTarget(12).target) : null;
    if (kind === 'focus' && !target) return;
    this.game.party.command(kind, target?.entity.id ?? null);
    void this.player.visual.play('command', { fadeIn: 0.05 });
    const line = kind === 'focus' ? 'Everyone — that one!' : 'Fall back to me!';
    this.game.events.emit('bark:play', { speakerId: 'subaru', text: line, duration: 1.6 });
  }

  // ------------------------------------------------------------------ lock-on
  private toggleLock(): void {
    if (this.lockTarget) {
      this.setLock(null);
      return;
    }
    const cam = this.game.render.camera;
    const camFwd = cam.getWorldDirection(_f);
    let best: Health | null = null;
    let bestScore = Infinity;
    const pos = this.entity.object3D.position;
    for (const h of this.game.combat.all()) {
      if (!h.alive || !hostile('party', h.effectiveFaction)) continue;
      const d = h.entity.object3D.position.distanceTo(pos);
      if (d > 20) continue;
      const to = _d.copy(h.center(_o)).sub(cam.position).normalize();
      const angle = Math.acos(clamp(to.dot(camFwd), -1, 1));
      if (angle > 0.9) continue;
      const score = angle * 8 + d * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    this.setLock(best);
  }

  private switchLock(dir: 1 | -1): void {
    if (!this.lockTarget) return;
    const pos = this.entity.object3D.position;
    const cam = this.game.render.camera;
    const right = _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const cur = this.lockTarget.entity.object3D.position.clone().sub(pos).dot(right);
    let best: Health | null = null;
    let bestDelta = Infinity;
    for (const h of this.game.combat.all()) {
      if (h === this.lockTarget || !h.alive || !hostile('party', h.effectiveFaction)) continue;
      if (h.entity.object3D.position.distanceTo(pos) > 20) continue;
      const side = h.entity.object3D.position.clone().sub(pos).dot(right) - cur;
      if (side * dir <= 0) continue;
      if (Math.abs(side) < bestDelta) {
        bestDelta = Math.abs(side);
        best = h;
      }
    }
    if (best) this.setLock(best);
  }

  private setLock(h: Health | null): void {
    this.lockTarget = h;
    this.game.events.emit('combat:lockOnChanged', { targetId: h?.entity.id ?? null });
    if (!h) {
      this.game.camera.follow.lockTarget = null;
      this.player.strafeTarget = null;
    }
  }

  // ------------------------------------------------------------------ frame
  override update(dt: number): void {
    const input = this.game.input;
    const c = this.cooldowns;
    c.shamak = Math.max(0, c.shamak - dt);
    c.barrier = Math.max(0, c.barrier - dt);
    c.snare = Math.max(0, c.snare - dt);
    this.mana = Math.min(this.maxMana, this.mana + dt * (this.beatrice ? 6 : 0));
    this.whip.update(dt);
    this.barrierVfx.update(dt, this.health.center(_o));

    if (this.state === 'down') {
      this.updateDeath(dt);
      return;
    }

    // Lock-on upkeep
    if (this.lockTarget) {
      const t = this.lockTarget;
      if (!t.alive || t.entity.destroyed || t.entity.object3D.position.distanceTo(this.entity.object3D.position) > 24) this.setLock(null);
      else {
        t.center(this.lockPoint);
        this.game.camera.follow.lockTarget = this.lockPoint;
        this.player.strafeTarget = this.lockPoint;
      }
    }

    const canInput = this.game.mode === 'exploration' || this.game.mode === 'combat';
    if (canInput) {
      if (input.pressed('lockOn')) this.toggleLock();
      if (input.pressed('lockSwitchLeft')) this.switchLock(-1);
      if (input.pressed('lockSwitchRight')) this.switchLock(1);
      if (input.pressed('attackLight')) this.buffer('attack');
      if (input.pressed('attackHeavy') && c.snare <= 0) this.buffer('snare');
      if (input.pressed('dodge') && !this.player.hasControl) this.tryDodge();
      if (this.game.mode === 'combat' && input.pressed('jump') && !this.player.hasControl) this.tryDodge();
    }
    this.dodgeAge += dt;
    if (this.queued) {
      this.queuedAge += dt;
      if (this.queuedAge > BUFFER) this.queued = null;
    }

    // State machine
    if (this.state !== 'free') {
      this.stateTime -= dt;
      if (this.state === 'attack' && this.step && !this.hitDone && this.step.duration - this.stateTime >= this.step.duration * this.step.contact) {
        this.hitDone = true;
        this.resolveWhipHit();
      }
      // Cancels: once the crack has landed, a buffered swing chains, a
      // snare or a dodge cuts the recovery short.
      if (this.state === 'attack' && this.hitDone && this.queued && this.step!.duration - this.stateTime > this.step!.duration * this.step!.contact + 0.05) {
        const q = this.queued;
        this.queued = null;
        if (q === 'dodge') {
          this.tryDodge();
          return;
        }
        if (q === 'snare' && c.snare <= 0) {
          c.snare = 3;
          this.attack(SNARE);
          return;
        }
        if (q === 'attack' && this.step !== SNARE) {
          this.comboIndex = (this.comboIndex + 1) % COMBO.length;
          this.attack(COMBO[this.comboIndex]!);
          return;
        }
      }
      // A dodge's tail can be cut by the next action.
      if (this.state === 'dodge' && this.stateTime < 0.16 && (this.queued === 'attack' || this.queued === 'snare')) this.stateTime = 0;
      if (this.stateTime <= 0) {
        if (this.state === 'barrier') this.endBarrier();
        if (this.state === 'attack') this.comboWindow = 0.45;
        this.enter('free', 0);
      }
      return;
    }

    this.comboWindow = Math.max(0, this.comboWindow - dt);
    if (!canInput || !this.player.hasControl) return;
    if (this.queued === 'attack') {
      this.queued = null;
      this.comboIndex = this.comboWindow > 0 ? (this.comboIndex + 1) % COMBO.length : 0;
      this.attack(COMBO[this.comboIndex]!);
      return;
    }
    if (this.queued === 'snare' && c.snare <= 0) {
      this.queued = null;
      c.snare = 3;
      this.attack(SNARE);
      return;
    }
    if (this.queued === 'dodge') {
      this.queued = null;
      this.tryDodge();
      return;
    }
    if (input.pressed('ability1')) this.castShamak();
    else if (input.pressed('ability2')) this.castBarrier();
    else if (input.pressed('useQuickItem')) this.drinkTonic();
    else if (input.pressed('partyCommand')) this.orderParty('focus');
    else if (input.pressed('callParty')) this.orderParty('regroup');
  }

  // ------------------------------------------------------------------ death
  /** Whole again (Return by Death, loading a save). */
  restore(): void {
    this.whip.cancel();
    this.setLock(null);
    this.health.revive(1);
    this.mana = this.maxMana;
    this.cooldowns.shamak = 0;
    this.cooldowns.barrier = 0;
    this.cooldowns.snare = 0;
    this.nextCritical = false;
    this.deathTimer = 0;
    this.player.visual.stopAction();
    this.player.stamina = this.player.movement.maxStamina;
    this.enter('free', 0);
  }

  private die(info?: DamageInfo): void {
    this.whip.cancel();
    this.setLock(null);
    this.enter('down', 0, () => void this.player.visual.play('collapse', { fadeIn: 0.05, holdEnd: true }));
    this.deathTimer = 0;
    const rbd = this.game.getSystem<{ name: string; die(cause: string): void }>('rbd');
    // The cause decides what Subaru takes back with him.
    // Environmental harm names its cause with a `cause:<id>` tag.
    const killer = info?.sourceId != null ? this.game.combat.all().find((h) => h.entity.id === info.sourceId) : undefined;
    const tagged = info?.tags?.find((t) => t.startsWith('cause:'))?.slice(6);
    const cause = tagged ?? (info?.tags?.includes('heliosphere') ? 'heliosphere' : killer?.characterId ? `combat.${killer.characterId}` : 'combat');
    rbd?.die(cause);
  }

  private updateDeath(dt: number): void {
    this.deathTimer += dt;
    // Return by Death owns this when present; otherwise a plain recovery.
    if (this.game.getSystem('rbd')) return;
    if (this.deathTimer > 2.5) {
      this.health.revive(1);
      this.player.visual.stopAction();
      this.game.combat.endEncounter(false);
      const area = this.game.scenes.current;
      if (area) this.game.scenes.placePlayer('default');
      this.enter('free', 0);
    }
  }
}

const _f = new Vector3();
const _r = new Vector3();
const _d = new Vector3();
const _o = new Vector3();
