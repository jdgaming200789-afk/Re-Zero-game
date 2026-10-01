import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { ActorController } from '../../actors/ActorController';
import type { DamageInfo } from '../../combat/Damage';
import { Health } from '../../combat/Health';
import type { TelegraphShape } from '../../combat/Telegraphs';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';

const log = createLogger('Reid');
const DEG = Math.PI / 180;

/** Reid's reach with a flick of the chopsticks, and how wide it sweeps. */
const REACH = 2.8;
const SWEEP = 110;
/** Behind him: how far off his facing a blow must come from to get past. */
const BLIND_SIDE = 100 * DEG;
/** A parried attacker holds his attention this long (Subaru, briefly). */
const FOCUS = 4;
const FOCUS_SUBARU = 2.5;

export type DuelState = 'seated' | 'duel' | 'yielded';

/**
 * Electra's trial: the first Sword Saint, fighting with a pair of
 * chopsticks. Nothing hurts him — every blow, spell and arrow is turned
 * aside (`Health.guard`) with a clack of wood. He gives his attention to
 * one opponent at a time (whoever last came at him, else Julius, the other
 * swordsman) and flicks away anyone in front of him.
 *
 * The trial is to make him take one step off his spot — and he never moves
 * his feet. Subaru's best effort, a whip snare from where Reid isn't looking
 * (from behind while he's busy with someone else, or while Shamak has him in
 * the dark), only makes him drop a chopstick. That ends the round; it's
 * Emilia who passes (the `ele.cleared` cinematic).
 */
export class ReidDuel {
  state: DuelState = 'seated';
  actor: ActorController | null = null;
  health: Health | null = null;
  /** Parries so far (tests, barks). */
  parries = 0;
  private focus: { h: Health; until: number } | null = null;
  private flickIn = 1.4;
  private windup: { t: number; dir: Vector3 } | null = null;
  private recover = 0;
  private lastParryAnim = -1;
  private blindBarked = false;
  private sticks: Group | null = null;
  private bowl: Mesh | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly faceAt = new Vector3();

  constructor(
    private readonly game: GameContext,
    private readonly scope: string,
    private readonly center: Vector3,
  ) {
    this.offs.push(
      game.events.on('combat:parried', ({ targetId, attackerId }) => {
        if (!this.health || targetId !== this.health.entity.id) return;
        this.parries++;
        const a = game.combat.get(attackerId);
        if (!a || this.state !== 'duel') return;
        const subaru = a.entity.id === game.player?.entity.id;
        if (subaru) {
          this.focus = { h: a, until: game.combat.now + FOCUS_SUBARU };
          if (Math.random() < 0.35) this.bark('Oi, kid. That tickles.');
        } else if (!this.focus || this.focus.h.entity.id === game.player?.entity.id || game.combat.now > this.focus.until) {
          this.focus = { h: a, until: game.combat.now + FOCUS };
        }
      }),
    );
  }

  /** Put Reid on the floor: seated on his stone, eating — or already standing. */
  async spawn(at: Vector3, yaw: number, seated: boolean): Promise<void> {
    const g = this.game;
    const actor = await g.actors.spawn('reid', { position: at, yaw, scope: this.scope });
    this.actor = actor;
    const def = actor.def;
    const h = actor.entity.add(new Health({ max: 999, faction: 'enemy', name: 'Reid Astrea', characterId: 'reid', poise: 999, radius: def.radius ?? 0.32, height: def.height, elite: true }));
    h.guard = (info) => this.guard(info);
    g.combat.register(h);
    this.health = h;
    this.sticks = makeChopsticks();
    actor.visual.attach?.(this.sticks, 'handR', new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0.1, -0.2, 1).normalize()), 0.05);
    if (seated) {
      this.state = 'seated';
      this.bowl = makeBowl();
      actor.visual.attach?.(this.bowl, 'handL', new Quaternion(), 0.06);
      actor.hold();
      void actor.visual.play('reidEat', { holdEnd: true });
    } else {
      this.state = 'duel';
    }
  }

  /** Stand up, put the bowl down: the trial begins. */
  begin(): void {
    const g = this.game;
    const actor = this.actor;
    const h = this.health;
    if (!actor || !h) return;
    this.state = 'duel';
    this.bowl?.removeFromParent();
    this.bowl = null;
    actor.release();
    void actor.visual.play('reidGuard', { holdEnd: true });
    this.flickIn = 1.6;
    g.combat.startEncounter('ele.reid', { enemies: [h], arena: { center: this.center.clone(), radius: 26 } });
    log.info('The trial of the Sword Saint begins');
  }

  /** Back to his stone and his bowl (after the trial is passed). */
  sitDown(): void {
    const actor = this.actor;
    if (!actor) return;
    this.state = 'seated';
    this.windup = null;
    this.focus = null;
    actor.stop();
    actor.faceTarget = null;
    actor.hold();
    void actor.visual.play('reidEat', { holdEnd: true });
  }

  /** Who he's looking at: the last to come at him, else Julius, else whoever's nearest. */
  focusTarget(): Health | null {
    const g = this.game;
    const f = this.focus;
    if (f && f.h.alive && !f.h.entity.destroyed && g.combat.now <= f.until) return f.h;
    const julius = g.party.follower('julius');
    const jh = julius ? g.combat.get(julius.entity.id) : undefined;
    if (jh?.alive) return jh;
    const me = this.actor?.position;
    if (!me) return null;
    let best: Health | null = null;
    let bestD = Infinity;
    for (const b of g.combat.all()) {
      if (!b.alive || b.effectiveFaction !== 'party') continue;
      const d = b.entity.object3D.position.distanceTo(me);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** Every blow is turned aside — except a snare from where he isn't looking. */
  private guard(info: DamageInfo): boolean {
    const g = this.game;
    const actor = this.actor;
    if (!actor || this.state !== 'duel') return true;
    const playerId = g.player?.entity.id;
    if (info.sourceId === playerId && info.tags?.includes('snare')) {
      const from = g.player!.entity.object3D.position;
      const to = new Vector3().subVectors(from, actor.position).setY(0).normalize();
      const fwd = new Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
      const off = Math.acos(Math.max(-1, Math.min(1, fwd.dot(to))));
      const blind = this.health?.hasStatus('blinded') ?? false;
      const busy = this.focusTarget()?.entity.id !== playerId;
      if (blind || (busy && off > BLIND_SIDE)) {
        void this.yieldTrial(blind ? 'dark' : 'behind');
        return false;
      }
    }
    if (g.combat.now - this.lastParryAnim > 0.3 && !this.windup) {
      this.lastParryAnim = g.combat.now;
      void actor.visual.play('reidParry', { fadeIn: 0.02 });
    }
    return true;
  }

  /** The whip wraps his wrist; one chopstick clatters away. He laughs. */
  private async yieldTrial(how: 'behind' | 'dark'): Promise<void> {
    const g = this.game;
    if (this.state === 'yielded') return;
    this.state = 'yielded';
    this.windup = null;
    log.info(`A chopstick drops (${how})`);
    const actor = this.actor!;
    actor.stop();
    actor.faceTarget = null;
    // One stick goes flying.
    const lost = this.sticks?.children[1];
    if (lost) lost.visible = false;
    g.state.set('ele.snared_how', how);
    g.combat.endEncounter(true);
    void actor.visual.play('reidDropped', { fadeIn: 0.05 });
    g.events.emit('story:event', { id: 'ele.chopstick' });
  }

  private bark(text: string): void {
    this.game.events.emit('bark:play', { speakerId: 'reid', text, duration: 2.6 });
  }

  update(dt: number): void {
    const g = this.game;
    const actor = this.actor;
    const h = this.health;
    if (!actor || !h || this.state !== 'duel' || !g.combat.inCombat) return;
    if (g.mode !== 'combat' && g.mode !== 'exploration') return;

    // In the dark (Shamak) he can't pick anyone out; he waits it out.
    if (h.hasStatus('blinded')) {
      if (!this.blindBarked) {
        this.blindBarked = true;
        this.bark('Ha! Lights out? Cheap trick, kid — I like it.');
      }
      this.windup = null;
      actor.faceTarget = null;
      return;
    }
    this.blindBarked = false;

    // Rooted: he turns on the spot to face whoever has his attention, but
    // his feet never leave it — that's the whole trial.
    const target = this.focusTarget();
    if (target) {
      this.faceAt.copy(target.entity.object3D.position);
      actor.faceTarget = this.faceAt;
    }

    if (this.recover > 0) {
      this.recover -= dt;
      return;
    }
    if (this.windup) {
      this.windup.t -= dt;
      if (this.windup.t <= 0) this.strike(this.windup.dir);
      return;
    }
    this.flickIn -= dt;
    if (this.flickIn > 0) return;
    // Anyone within reach in front of him gets flicked away.
    const fwd = new Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
    const origin = actor.position.clone().setY(actor.position.y + 1.0);
    const victims = g.combat.arc(origin, fwd, REACH, SWEEP, { hostileTo: 'enemy' });
    if (!victims.length) {
      this.flickIn = 0.3;
      return;
    }
    const windup = 0.32;
    const shape: TelegraphShape = { kind: 'cone', origin: actor.position.clone(), dir: fwd.clone(), reach: REACH, arc: SWEEP };
    g.combat.telegraph(shape, h, windup);
    actor.stop();
    this.windup = { t: windup, dir: fwd };
    void actor.visual.play('reidFlick', { fadeIn: 0.04, speed: (0.5 * 0.55) / windup });
  }

  private strike(dir: Vector3): void {
    const g = this.game;
    const actor = this.actor!;
    this.windup = null;
    this.recover = 0.45;
    this.flickIn = 1.1 + Math.random() * 0.8;
    const origin = actor.position.clone().setY(actor.position.y + 1.0);
    const playerId = g.player?.entity.id;
    for (const v of g.combat.arc(origin, dir, REACH, SWEEP, { hostileTo: 'enemy' }).slice(0, 3)) {
      const subaru = v.entity.id === playerId;
      g.combat.damage(v, {
        amount: subaru ? 17 : 5,
        type: 'physical',
        sourceId: this.health!.entity.id,
        point: v.center(new Vector3()),
        direction: dir.clone(),
        stagger: subaru ? 30 : 18,
        knockback: subaru ? 3 : 2.2,
        tags: ['melee', 'chopsticks'],
      });
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (this.health) this.game.combat.unregister(this.health);
  }
}

/** Two plain wooden chopsticks, held together along the fingers. */
function makeChopsticks(): Group {
  const g = new Group();
  const wood = new MeshBasicMaterial({ color: 0x8a5a32 });
  for (const x of [-0.008, 0.008]) {
    const s = new Mesh(new CylinderGeometry(0.0035, 0.006, 0.23, 6), wood);
    s.position.set(x, 0.07, 0);
    g.add(s);
  }
  return g;
}

/** A rough clay bowl. */
function makeBowl(): Mesh {
  const m = new Mesh(new SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new MeshBasicMaterial({ color: 0x7a5238 }));
  m.rotation.x = Math.PI;
  m.position.y = 0.05;
  return m;
}
