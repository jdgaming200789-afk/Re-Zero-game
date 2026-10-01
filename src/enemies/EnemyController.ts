import { Vector3 } from 'three';
import type { ActorController } from '../actors/ActorController';
import { hostile } from '../combat/Damage';
import type { Health } from '../combat/Health';
import type { Telegraph, TelegraphShape } from '../combat/Telegraphs';
import { Component } from '../core/ecs/Component';
import { clamp, DEG } from '../core/math/MathUtil';
import type { EnemyAttackDef, EnemyDefinition } from '../data/enemies';
import type { GameContext } from '../game/GameContext';
import { Masks } from '../physics/Physics';
import type { EnemyGroup } from './EnemyManager';
import { creatureClip } from '../creatures/CreatureClips';

export type EnemyState = 'idle' | 'suspicious' | 'engaged' | 'windup' | 'strike' | 'recover' | 'retreat' | 'flee' | 'stagger' | 'dead';

/**
 * A witchbeast's mind. Out of combat it idles near home, noticing what it
 * sees (a sight cone with line of sight) and hears (movement noise);
 * awareness builds until it commits and calls its pack. In combat it keeps
 * a threat table, circles at range, and attacks only when the pack grants
 * it a token — every attack telegraphed on the ground before it lands.
 */
export class EnemyController extends Component {
  state: EnemyState = 'idle';
  awareness = 0;
  target: Health | null = null;
  readonly threat = new Map<Health, number>();
  private stateTime = 0;
  private thinkTimer = Math.random() * 0.15;
  private readonly cooldowns = new Map<string, number>();
  private attack: EnemyAttackDef | null = null;
  private telegraphRef: Telegraph | null = null;
  private strikeDir = new Vector3();
  private hasToken = false;
  private readonly interest = new Vector3();
  private orbitSign = Math.random() < 0.5 ? 1 : -1;
  private wanderTimer = 1 + Math.random() * 3;
  private readonly wanderGoal = new Vector3();
  private feintTimer = 2 + Math.random() * 3;
  private deathTimer = 0;
  private releaseTimer = -1;
  group: EnemyGroup | null = null;

  constructor(
    readonly game: GameContext,
    readonly def: EnemyDefinition,
    readonly actor: ActorController,
    readonly health: Health,
    readonly home: Vector3,
  ) {
    super();
  }

  override onAttach(): void {
    this.health.onHit = (r, info) => {
      const src = this.game.combat.get(info.sourceId);
      if (src) this.addThreat(src, r.applied * 2 + 5);
      if (this.state === 'idle' || this.state === 'suspicious') this.alert(src ?? null);
      this.actor.visual.hitFlash?.(r.staggered || info.critical ? 1 : 0.65);
      // Knocked back along the blow (not out of a lunge already committed).
      if (!r.killed && info.direction && this.state !== 'strike') {
        const push = 0.2 + (info.stagger ?? 0) * 0.022 + (r.staggered ? 0.6 : 0);
        this.actor.dash(_a.copy(info.direction).setY(0).normalize(), push, r.staggered ? 0.22 : 0.14, false);
      }
      if (r.staggered) this.enterStagger();
      else if (this.state !== 'windup' && this.state !== 'strike' && !r.killed) void this.actor.visual.play('flinch', { fadeIn: 0.03 });
    };
    this.health.onDeath = () => this.die();
    this.health.onStatus = (id, active) => {
      if (id === 'charmed' && active) {
        this.dropToken();
        this.target = null;
        this.threat.clear();
      }
    };
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  // ------------------------------------------------------------------ awareness
  private addThreat(h: Health, amount: number): void {
    this.threat.set(h, (this.threat.get(h) ?? 0) + amount);
  }

  /** Commit to a fight (and bring the pack). */
  alert(by: Health | null): void {
    if (this.state === 'dead') return;
    this.awareness = 1;
    if (by) this.addThreat(by, 10);
    if (this.state === 'idle' || this.state === 'suspicious') {
      this.setState('engaged');
      this.group?.alert(by, this);
    }
  }

  /** A sound reached it (movement, fighting, the carriage bell). */
  hear(at: Vector3, loudness: number): void {
    if (this.state !== 'idle' && this.state !== 'suspicious') return;
    const d = at.distanceTo(this.actor.position);
    const heard = loudness * this.def.perception.hearing - d;
    if (heard <= 0) return;
    this.awareness = Math.min(1, this.awareness + clamp(heard / loudness, 0.05, 0.5));
    this.interest.copy(at);
    if (this.state === 'idle') this.setState('suspicious');
  }

  private canSee(h: Health): boolean {
    const p = this.actor.position;
    const t = h.entity.object3D.position;
    const d = t.distanceTo(p);
    if (d > this.def.perception.sight) return false;
    if (d > 3.5) {
      const fwd = _a.set(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
      const to = _b.subVectors(t, p).setY(0).normalize();
      if (fwd.dot(to) < Math.cos((this.def.perception.fov / 2) * DEG)) return false;
    }
    const eye = _c.copy(p).setY(p.y + this.actor.def.height * 0.8);
    return this.game.physics.lineOfSight(eye, h.center(_d), Masks.lineOfSight);
  }

  private perceive(dt: number): void {
    if (this.health.hasStatus('blinded')) return;
    const combat = this.game.combat;
    let best: Health | null = null;
    let bestVis = 0;
    for (const h of combat.all()) {
      if (!h.alive || h === this.health || !hostile(this.health.effectiveFaction, h.effectiveFaction)) continue;
      if (h.entity.object3D.position.distanceTo(this.actor.position) > this.def.perception.sight) continue;
      if (!this.canSee(h)) continue;
      const d = h.entity.object3D.position.distanceTo(this.actor.position);
      const vis = 1 - d / this.def.perception.sight;
      if (vis > bestVis) {
        bestVis = vis;
        best = h;
      }
    }
    if (best) {
      this.awareness = Math.min(1, this.awareness + dt * this.def.perception.awareness * (0.35 + bestVis));
      this.interest.copy(best.entity.object3D.position);
      if (this.state === 'idle') this.setState('suspicious');
      if (this.awareness >= 1) this.alert(best);
    } else {
      this.awareness = Math.max(0, this.awareness - dt * 0.12);
      if (this.state === 'suspicious' && this.awareness <= 0.02) this.setState('idle');
    }
  }

  private chooseTarget(dt: number): void {
    const pos = this.actor.position;
    const mine = this.health.effectiveFaction;
    for (const [h, v] of this.threat) {
      if (!h.alive || h.entity.destroyed || !hostile(mine, h.effectiveFaction)) this.threat.delete(h);
      else this.threat.set(h, v * Math.pow(0.95, dt));
    }
    // Proximity adds threat: whatever is near and visible matters.
    for (const h of this.game.combat.all()) {
      if (!h.alive || h === this.health || !hostile(mine, h.effectiveFaction)) continue;
      const d = h.entity.object3D.position.distanceTo(pos);
      if (d < 12) this.addThreat(h, (dt * 6) / (d + 1));
    }
    let best: Health | null = null;
    let bestV = 0;
    for (const [h, v] of this.threat) {
      if (v > bestV) {
        bestV = v;
        best = h;
      }
    }
    // Stick with the current target unless something is clearly worse.
    if (this.target && this.target.alive && best !== this.target && bestV < (this.threat.get(this.target) ?? 0) * 1.3) return;
    if (best !== this.target) this.dropToken();
    this.target = best;
  }

  // ------------------------------------------------------------------ states
  private setState(s: EnemyState, seconds = 0): void {
    this.state = s;
    this.stateTime = seconds;
  }

  private dropToken(): void {
    if (this.hasToken) this.group?.director.release(this);
    this.hasToken = false;
  }

  private enterStagger(): void {
    this.cancelAttack();
    this.dropToken();
    this.setState('stagger', 0.9);
    void this.actor.visual.play('shake', { fadeIn: 0.03 });
  }

  private cancelAttack(): void {
    if (this.telegraphRef) this.game.combat.telegraphs.cancel(this.telegraphRef.id);
    this.telegraphRef = null;
    this.attack = null;
    if (this.state === 'windup' || this.state === 'strike') this.setState('engaged');
  }

  private die(): void {
    this.cancelAttack();
    this.dropToken();
    this.setState('dead');
    this.actor.stop();
    this.actor.hold();
    void this.actor.visual.play('death', { fadeIn: 0.05, holdEnd: true });
    this.actor.motor?.body.setEnabled(false);
    this.deathTimer = 0;
  }

  private cooldownReady(a: EnemyAttackDef): boolean {
    return (this.cooldowns.get(a.id) ?? 0) <= this.game.combat.now;
  }

  private pickAttack(dist: number): EnemyAttackDef | null {
    const ready = this.def.attacks.filter((a) => this.cooldownReady(a) && dist >= a.range[0] && dist <= a.range[1]);
    if (!ready.length) return null;
    let total = ready.reduce((s, a) => s + a.weight, 0) * Math.random();
    for (const a of ready) {
      total -= a.weight;
      if (total <= 0) return a;
    }
    return ready[0]!;
  }

  private beginAttack(a: EnemyAttackDef): void {
    const t = this.target!;
    const pos = this.actor.position;
    const dir = this.strikeDir.subVectors(t.entity.object3D.position, pos).setY(0).normalize();
    this.actor.yaw = Math.atan2(dir.x, dir.z);
    this.actor.stop();
    this.attack = a;
    this.cooldowns.set(a.id, this.game.combat.now + a.cooldown);
    this.setState('windup', a.windup);
    const s = a.shape;
    const base = pos.clone();
    let shape: TelegraphShape;
    if (s.kind === 'arc') shape = { kind: 'cone', origin: base, dir: dir.clone(), reach: s.reach, arc: s.arc };
    else if (s.kind === 'lunge') shape = { kind: 'line', origin: base, dir: dir.clone(), length: s.distance + 0.8, width: s.width };
    else shape = { kind: 'circle', center: base, radius: s.radius };
    this.telegraphRef = this.game.combat.telegraph(shape, this.health, a.windup);
    // Time the clip so its contact beat lands exactly when the windup ends.
    const clip = creatureClip(a.clip);
    const speed = (clip.duration * (clip.contact ?? 0.5)) / a.windup;
    void this.actor.visual.play(a.clip, { fadeIn: 0.05, speed });
    if (Math.random() < 0.4) this.game.combat.impacts.burst('miasma', _c.copy(pos).setY(pos.y + this.actor.def.height * 0.8), 6);
  }

  private strike(): void {
    const a = this.attack;
    if (!a) {
      this.setState('engaged');
      return;
    }
    const s = a.shape;
    const pos = this.actor.position;
    const blind = this.health.hasStatus('blinded');
    const faction = this.health.effectiveFaction;
    const victims = (h: Health) => h !== this.health && h.alive && (blind || hostile(faction, h.effectiveFaction));
    const origin = _c.copy(pos).setY(pos.y + this.actor.def.height * 0.5);
    let hits: Health[] = [];
    if (s.kind === 'lunge') {
      this.actor.dash(this.strikeDir, s.distance, 0.28);
      const shape: TelegraphShape = { kind: 'line', origin: pos.clone(), dir: this.strikeDir.clone(), length: s.distance + 0.8, width: s.width };
      hits = this.game.combat.all().filter((h) => victims(h) && this.game.combat.telegraphs.contains(shape, h.entity.object3D.position, h.radius));
    } else if (s.kind === 'arc') {
      hits = this.game.combat.arc(origin, this.strikeDir, s.reach, s.arc, {}).filter(victims);
    } else {
      hits = this.game.combat.sphere(pos, s.radius, {}).filter(victims);
    }
    for (const h of hits.slice(0, 3)) {
      this.game.combat.damage(h, {
        amount: a.damage,
        type: a.type,
        sourceId: blind ? null : this.entity.id,
        point: h.center(new Vector3()),
        direction: this.strikeDir.clone(),
        stagger: a.stagger,
        tags: ['melee', a.id],
      });
    }
    this.telegraphRef = null;
    this.setState('recover', a.recovery);
  }

  // ------------------------------------------------------------------ frame
  override update(dt: number): void {
    const actor = this.actor;
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 4) this.entity.destroy();
      return;
    }
    const h = this.health;
    // A charmed beast left over after the fight is sent home by Meili.
    if (h.hasStatus('charmed') && !this.game.combat.inCombat && this.releaseTimer < 0) this.releaseTimer = 3;
    if (this.releaseTimer >= 0) {
      this.releaseTimer -= dt;
      const away = _a.subVectors(actor.position, this.game.party.leaderPosition).setY(0);
      if (away.lengthSq() > 1e-4) actor.steer.copy(away.normalize().multiplyScalar(actor.movement.runSpeed));
      actor.visual.setOccluding?.(this.releaseTimer < 1);
      if (this.releaseTimer <= 0) {
        this.state = 'dead';
        this.entity.destroy();
      }
      return;
    }
    if (!h.canAct && this.state !== 'stagger') {
      // Frozen / stopped: no action at all.
      this.cancelAttack();
      actor.steer.set(0, 0, 0);
      actor.stop();
      return;
    }
    this.stateTime -= dt;
    this.thinkTimer -= dt;
    const think = this.thinkTimer <= 0;
    if (think) this.thinkTimer = 0.15;
    const engaged = this.state !== 'idle' && this.state !== 'suspicious';
    if (!engaged && think) this.perceive(0.15);
    if (engaged && think) this.chooseTarget(0.15);
    if (h.hasStatus('charmed') && think) this.chooseTarget(0.15);
    actor.steer.set(0, 0, 0);

    switch (this.state) {
      case 'idle':
        this.idle(dt);
        break;
      case 'suspicious': {
        // Turn towards what caught its attention and creep closer.
        actor.faceTarget = this.interest;
        const to = _a.subVectors(this.interest, actor.position).setY(0);
        if (to.length() > 4) actor.steer.copy(to.normalize().multiplyScalar(actor.movement.walkSpeed * 0.7));
        break;
      }
      case 'engaged':
        this.fight(dt);
        break;
      case 'windup':
        if (this.target) actor.faceTarget = null;
        if (this.stateTime <= 0) this.strike();
        break;
      case 'strike':
      case 'recover':
        if (this.stateTime <= 0) {
          this.attack = null;
          this.dropToken();
          // Jackals hop back after a bite.
          if (this.target) {
            const away = _a.subVectors(actor.position, this.target.entity.object3D.position).setY(0);
            if (away.lengthSq() > 1e-4) actor.dash(away, 1.8, 0.3, false);
          }
          this.setState(h.fraction < this.def.fleeAt ? 'flee' : 'engaged', h.fraction < this.def.fleeAt ? 3.5 : 0);
        }
        break;
      case 'stagger':
        if (this.stateTime <= 0) this.setState('engaged');
        break;
      case 'flee': {
        const t = this.target;
        if (t) {
          const away = _a.subVectors(actor.position, t.entity.object3D.position).setY(0).normalize();
          actor.steer.copy(away.multiplyScalar(actor.movement.runSpeed));
        }
        if (this.stateTime <= 0) this.setState('engaged');
        break;
      }
    }
    this.group?.director.addSpacing(this, actor.steer);
  }

  private idle(dt: number): void {
    const actor = this.actor;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 3 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 4;
      this.wanderGoal.set(this.home.x + Math.cos(a) * r, this.home.y, this.home.z + Math.sin(a) * r);
      if (Math.random() < 0.3) void actor.visual.play('snort');
    }
    const to = _a.subVectors(this.wanderGoal, actor.position).setY(0);
    if (to.length() > 0.5) actor.steer.copy(to.normalize().multiplyScalar(actor.movement.walkSpeed * 0.6));
  }

  private fight(dt: number): void {
    const actor = this.actor;
    const blind = this.health.hasStatus('blinded');
    if (blind) {
      // Shamak: it can't find anyone — it lashes out at whatever bumps into it.
      this.dropToken();
      this.idle(dt);
      const near = this.game.combat.sphere(actor.position, 1.4, {}).filter((x) => x !== this.health);
      const a = this.def.attacks.find((x) => x.shape.kind === 'arc');
      if (near.length && a && this.cooldownReady(a)) {
        this.target = near[0]!;
        this.beginAttack(a);
      }
      return;
    }
    const t = this.target;
    if (!t || !t.alive) {
      actor.faceTarget = null;
      if (!this.game.combat.inCombat) this.setState('idle');
      return;
    }
    const tp = t.entity.object3D.position;
    const d = tp.distanceTo(actor.position) - t.radius - (actor.def.radius ?? 0.3);
    actor.faceTarget = tp;
    actor.lookAt(t.center(_d), 0.9);
    // Attack if the pack lets us.
    if (!this.hasToken) this.hasToken = this.group ? this.group.director.request(this) : true;
    if (this.hasToken) {
      const a = this.pickAttack(d);
      if (a) {
        this.beginAttack(a);
        return;
      }
      // Close in for a bite.
      const to = _a.subVectors(tp, actor.position).setY(0);
      if (to.lengthSq() > 1e-4) actor.steer.copy(to.normalize().multiplyScalar(actor.movement.runSpeed));
      return;
    }
    // Waiting: circle at range, with the occasional feint.
    const [minR, maxR] = this.def.circleRange;
    const slot = this.group?.director.slotAngle(this) ?? 0;
    const want = (minR + maxR) / 2;
    const orbit = slot + this.game.combat.now * 0.25 * this.orbitSign;
    const goal = _b.set(tp.x + Math.sin(orbit) * want, tp.y, tp.z + Math.cos(orbit) * want);
    const to = _a.subVectors(goal, actor.position).setY(0);
    const dist = to.length();
    if (dist > 0.3) actor.steer.copy(to.multiplyScalar(Math.min(actor.movement.runSpeed, dist * 2.2) / dist));
    this.feintTimer -= dt;
    if (this.feintTimer <= 0 && d < maxR + 1) {
      this.feintTimer = 2.5 + Math.random() * 3.5;
      const toward = _c.subVectors(tp, actor.position).setY(0);
      actor.dash(toward, 1.2, 0.22);
      void actor.visual.play('snarl', { fadeIn: 0.05 });
    }
  }
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
