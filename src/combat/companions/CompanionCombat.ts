import { Vector3 } from 'three';
import type { ActorBrain, ActorController } from '../../actors/ActorController';
import { Component } from '../../core/ecs/Component';
import { clamp } from '../../core/math/MathUtil';
import type { GameContext } from '../../game/GameContext';
import { hostile } from '../Damage';
import { Health } from '../Health';
import { COMBAT_STYLES, type AbilityContext, type CombatStyle, type CompanionAbility } from './CombatStyles';

type CombatState = 'idle' | 'acting' | 'down';

/**
 * A companion's fighting self: health, the combat brain that replaces the
 * follower brain during encounters, and the ability loop (pick the best
 * ready ability for the situation, commit to its animation, apply it on the
 * contact beat). Each character's identity lives in CombatStyles.
 */
export class CompanionCombat extends Component {
  readonly health: Health;
  readonly style: CombatStyle;
  state: CombatState = 'idle';
  private readonly cooldowns = new Map<string, number>();
  private thinkTimer = Math.random() * 0.2;
  private actTimer = 0;
  private savedBrain: ActorBrain | null = null;
  private readonly brain: CombatBrain;
  target: Health | null = null;
  inCombat = false;
  private orbitDir = Math.random() < 0.5 ? 1 : -1;
  private dodgeCooldown = 0;
  private readonly readTelegraphs = new Set<number>();
  readonly ctx: AbilityContext;

  constructor(
    readonly game: GameContext,
    readonly actor: ActorController,
  ) {
    super();
    const style = COMBAT_STYLES[actor.id];
    if (!style) throw new Error(`No combat style for ${actor.id}`);
    this.style = style;
    this.health = new Health({
      max: style.maxHp,
      faction: 'party',
      name: actor.def.shortName,
      characterId: actor.id,
      poise: style.poise,
      resist: style.resist,
      radius: actor.def.radius ?? 0.32,
      height: actor.def.height,
    });
    this.brain = new CombatBrain(this);
    this.ctx = { game, actor, self: this.health, target: null, companion: this, state: {} };
  }

  override onAttach(): void {
    this.entity.add(this.health);
    this.game.combat.register(this.health);
    this.health.onHit = (r) => {
      if (r.killed || this.state === 'down') return;
      if (r.staggered) {
        this.interrupt();
        void this.actor.visual.play('stagger', { fadeIn: 0.03 });
        this.actTimer = 0.8;
        this.state = 'acting';
        this.actor.hold();
      } else if (this.state !== 'acting') void this.actor.visual.play('flinch', { fadeIn: 0.03 });
    };
    this.health.onDeath = () => this.knockOut();
  }

  override onDetach(): void {
    this.game.combat.unregister(this.health);
    this.exitCombat();
  }

  // ------------------------------------------------------------------ lifecycle
  enterCombat(): void {
    if (this.inCombat) return;
    this.inCombat = true;
    this.savedBrain = this.actor.brain;
    this.actor.brain = this.brain;
    this.style.onEnterCombat?.(this.ctx);
  }

  exitCombat(): void {
    if (!this.inCombat) return;
    this.inCombat = false;
    this.interrupt();
    this.actor.brain = this.savedBrain;
    this.savedBrain = null;
    this.actor.faceTarget = null;
    this.target = null;
    this.style.onExitCombat?.(this.ctx);
    if (this.state === 'down') {
      // Back on their feet once the danger has passed.
      this.health.revive(0.35);
      this.actor.visual.stopAction();
      this.actor.release();
    }
    this.state = 'idle';
  }

  private interrupt(): void {
    if (this.state === 'acting') this.actor.release();
    this.state = 'idle';
    this.actTimer = 0;
  }

  private knockOut(): void {
    this.interrupt();
    this.state = 'down';
    this.actor.hold();
    this.actor.stop();
    void this.actor.visual.play('collapse', { fadeIn: 0.05, holdEnd: true });
    this.game.events.emit('bark:play', { speakerId: this.actor.id, text: this.style.downLine ?? '...!', duration: 1.8 });
  }

  cooldownLeft(id: string): number {
    return Math.max(0, (this.cooldowns.get(id) ?? 0) - this.game.combat.now);
  }

  // ------------------------------------------------------------------ targeting
  private chooseTarget(): Health | null {
    const combat = this.game.combat;
    const party = this.game.party;
    const subaru = this.game.player?.entity.object3D.position;
    // Subaru's orders come first.
    if (party.order === 'focus') {
      const t = combat.get(party.orderTarget);
      if (t?.alive) return t;
    }
    const pos = this.actor.position;
    let best: Health | null = null;
    let bestScore = Infinity;
    for (const h of combat.enemies.length ? combat.enemies : combat.all()) {
      if (!h.alive || !hostile('party', h.effectiveFaction)) continue;
      const d = h.entity.object3D.position.distanceTo(pos);
      if (d > 30) continue;
      // Guards care about whoever is closest to Subaru.
      const ds = subaru ? h.entity.object3D.position.distanceTo(subaru) : d;
      const score = (this.style.guard || party.order === 'regroup' ? ds * 1.5 + d * 0.3 : d + ds * 0.4) - (h === this.target ? 1.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  private pickAbility(): CompanionAbility | null {
    const now = this.game.combat.now;
    const t = this.target;
    const d = t ? t.entity.object3D.position.distanceTo(this.actor.position) - t.radius : Infinity;
    let best: CompanionAbility | null = null;
    let bestScore = 0;
    for (const a of this.style.abilities) {
      if ((this.cooldowns.get(a.id) ?? 0) > now) continue;
      if (a.needsTarget !== false && (!t || d < a.range[0] || d > a.range[1])) continue;
      const s = a.score(this.ctx, d);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  }

  private use(a: CompanionAbility): void {
    const t = this.target;
    this.cooldowns.set(a.id, this.game.combat.now + a.cooldown);
    this.state = 'acting';
    this.actTimer = a.commit;
    this.actor.hold();
    this.actor.stop();
    if (t) this.actor.yaw = this.actor.yawTo(t.entity.object3D.position);
    const clip = typeof a.clip === 'function' ? a.clip(this.ctx) : a.clip;
    void this.actor.visual.play(clip, {
      fadeIn: 0.06,
      onContact: () => {
        if (this.state === 'down' || !this.inCombat) return;
        this.ctx.target = this.target;
        a.execute(this.ctx);
      },
    });
    if (a.bark && Math.random() < 0.5) this.game.events.emit('bark:play', { speakerId: this.actor.id, text: a.bark, duration: 1.6 });
  }

  override update(dt: number): void {
    const combat = this.game.combat;
    if (combat.inCombat && !this.inCombat && this.actor.position.distanceTo(this.game.party.leaderPosition) < 30) this.enterCombat();
    else if (!combat.inCombat && this.inCombat) this.exitCombat();
    if (!this.inCombat) return;
    this.style.tick?.(this.ctx, dt);
    if (this.state === 'down') return;
    if (this.state === 'acting') {
      this.actTimer -= dt;
      if (this.actTimer <= 0) {
        this.state = 'idle';
        this.actor.release();
      }
      return;
    }
    if (!this.health.canAct) return;
    // A scene has the floor: nobody starts a swing (or dodges out of their
    // mark) while a cutscene or conversation is directing them.
    const mode = this.game.mode;
    if (mode === 'cinematic' || mode === 'dialogue') return;
    if (this.tryDodge(dt)) return;
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 0.18 + Math.random() * 0.1;
    this.target = this.chooseTarget();
    this.ctx.target = this.target;
    const a = this.pickAbility();
    if (a) this.use(a);
  }

  /** Step out of a telegraphed attack that's about to land. */
  private tryDodge(dt: number): boolean {
    this.dodgeCooldown -= dt;
    if (this.dodgeCooldown > 0 || this.actor.dashing) return false;
    const combat = this.game.combat;
    const threats = combat.threatsTo(this.health).filter((t) => t.hitsAt - combat.now < 0.45 && t.hitsAt > combat.now && !this.readTelegraphs.has(t.id));
    if (!threats.length) return false;
    // Each warning gets one read: skill decides whether they react in time.
    for (const t of threats) this.readTelegraphs.add(t.id);
    if (this.readTelegraphs.size > 64) this.readTelegraphs.clear();
    if (Math.random() > this.style.dodge) return false;
    const s = threats[0]!.shape;
    const from = s.kind === 'circle' ? s.center : s.origin;
    const away = _a.subVectors(this.actor.position, from).setY(0);
    if (s.kind !== 'circle') {
      // Sidestep perpendicular to a lunge/cone rather than backing down its length.
      const side = _b.set(-s.dir.z, 0, s.dir.x);
      if (side.dot(away) < 0) side.negate();
      away.copy(side);
    }
    if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    this.actor.dash(away, 2.6, 0.3, false);
    this.health.grantInvulnerability(0.15);
    this.dodgeCooldown = 1.4;
    return true;
  }

  /** Where this companion wants to stand (read by the combat brain). */
  desiredPosition(out: Vector3): Vector3 | null {
    const party = this.game.party;
    const subaru = party.leaderPosition;
    const t = this.target;
    const pos = this.actor.position;
    const [minR, maxR] = this.style.range;
    if (party.order === 'regroup' || (this.style.guard && (!t || t.entity.object3D.position.distanceTo(subaru) > 7))) {
      // Stay at Subaru's side, between him and the nearest threat.
      if (t) {
        const dir = _a.subVectors(t.entity.object3D.position, subaru).setY(0).normalize();
        return out.copy(subaru).addScaledVector(dir, 1.3).addScaledVector(_b.set(-dir.z, 0, dir.x), this.orbitDir * 0.9);
      }
      return out.copy(subaru).addScaledVector(_b.set(this.orbitDir, 0, 0), 1.4);
    }
    if (!t) return null;
    const tp = t.entity.object3D.position;
    const away = _a.subVectors(pos, tp).setY(0);
    const d = away.length() || 1;
    away.divideScalar(d);
    const want = clamp(d, minR + t.radius, maxR + t.radius);
    // Drift sideways around the target so the party spreads out.
    const tangent = _b.set(-away.z, 0, away.x).multiplyScalar(this.orbitDir * 0.8);
    return out.copy(tp).addScaledVector(away, want).add(tangent);
  }
}

/** Steering while in combat: hold position in the style's range band. */
class CombatBrain implements ActorBrain {
  private readonly goal = new Vector3();
  constructor(private readonly c: CompanionCombat) {}

  update(actor: ActorController, _dt: number): void {
    const steer = actor.steer.set(0, 0, 0);
    const t = this.c.target;
    if (this.c.state !== 'idle') return;
    const goal = this.c.desiredPosition(this.goal);
    if (goal) {
      const to = _a.subVectors(goal, actor.position).setY(0);
      const d = to.length();
      if (d > 0.35) {
        const speed = d > 3 ? actor.movement.runSpeed : actor.movement.walkSpeed * clamp(d / 1.2, 0.5, 1.3);
        steer.copy(to).multiplyScalar(speed / d);
      }
    }
    actor.faceTarget = t ? t.entity.object3D.position : null;
    actor.lookAt(t ? t.center(_c) : null, 0.8);
    this.c.game.party.addSeparation(actor, steer);
  }
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
