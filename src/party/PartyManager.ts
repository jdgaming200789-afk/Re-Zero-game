import { Frustum, Matrix4, Vector3 } from 'three';
import type { ActorController } from '../actors/ActorController';
import { createLogger } from '../core/Log';
import { PARTY_MEMBERS, PARTY_ORDER } from '../data/party';
import type { GameContext, GameSystem } from '../game/GameContext';
import type { PartyOrder } from '../core/events/GameEvents';
import { Masks } from '../physics/Physics';
import { Breadcrumbs } from './Breadcrumbs';
import { FollowerBrain } from './FollowerBrain';
import { CompanionCombat } from '../combat/companions/CompanionCombat';
import { COMBAT_STYLES } from '../combat/companions/CombatStyles';

const log = createLogger('Party');

interface Follower {
  actor: ActorController;
  brain: FollowerBrain;
}

/**
 * The travelling party. Membership is story state (`party.<id>` flags, so
 * Return by Death restores it); this system turns it into companions in the
 * world: spawns and places them, records the leader's path and answers the
 * spatial questions follower brains ask (where's my slot, is the way clear,
 * where can I reappear unseen).
 */
export class PartyManager implements GameSystem {
  readonly name = 'party';
  readonly trail = new Breadcrumbs(120, 0.35);
  readonly leaderPosition = new Vector3();
  readonly leaderHead = new Vector3();
  readonly leaderForward = new Vector3(0, 0, 1);
  leaderSpeed = 0;
  /** Seconds the leader has been standing still. */
  leaderStillFor = 0;
  private readonly followers = new Map<string, Follower>();
  private attention: { point: Vector3; until: number; source: string | null } | null = null;
  private reconciling: Promise<void> | null = null;
  private reconcileAgain = false;
  private held = false;
  /** Subaru's current combat order and its target (entity id). */
  order: PartyOrder = 'free';
  orderTarget: number | null = null;

  constructor(private readonly game: GameContext) {
    const ev = game.events;
    ev.on('flag:changed', ({ key }) => {
      if (key.startsWith('party.')) this.requestReconcile();
    });
    ev.on('area:entered', () => this.requestReconcile());
    ev.on('rbd:returned', () => this.requestReconcile());
    ev.on('player:placed', ({ position, yaw }) => this.onPlayerPlaced(position, yaw));
    ev.on('game:modeChanged', ({ to }) => this.setHeld(to === 'dialogue' || to === 'cinematic'));
  }

  get time(): number {
    return this.game.time.elapsed;
  }

  // ------------------------------------------------------------------ membership
  /** Party members per story state, in formation order. */
  members(): string[] {
    return PARTY_ORDER.filter((id) => this.game.state.bool(`party.${id}`));
  }

  isMember(id: string): boolean {
    return this.game.state.bool(`party.${id}`);
  }

  join(id: string): void {
    if (!PARTY_MEMBERS[id]) throw new Error(`"${id}" is not a party member`);
    if (this.isMember(id)) return;
    this.game.state.set(`party.${id}`, true);
    this.game.events.emit('party:joined', { characterId: id });
  }

  leave(id: string): void {
    if (!this.isMember(id)) return;
    this.game.state.set(`party.${id}`, false);
    this.game.events.emit('party:left', { characterId: id });
  }

  /** Companions currently present in the world. */
  get active(): ActorController[] {
    return Array.from(this.followers.values(), (f) => f.actor);
  }

  follower(id: string): ActorController | undefined {
    return this.followers.get(id)?.actor;
  }

  /** Resolves once spawning/despawning has caught up with membership. */
  async settled(): Promise<void> {
    while (this.reconciling) await this.reconciling;
  }

  /** Issue a combat order (focus Subaru's target / regroup around him / free). */
  command(kind: PartyOrder, targetId: number | null = null): void {
    this.order = kind;
    this.orderTarget = targetId;
    this.game.events.emit('party:command', { kind, targetId });
  }

  // ------------------------------------------------------------------ attention
  /** Make the party look at something (a speaker, a discovery) for a while. */
  attend(point: Vector3, seconds: number, source: string | null = null): void {
    this.attention = { point: point.clone(), until: this.time + seconds, source };
  }

  /** What `forId` should be looking at, if anything (never its own voice). */
  attentionPoint(forId?: string): Vector3 | null {
    const a = this.attention;
    if (!a || this.time >= a.until) {
      this.attention = null;
      return null;
    }
    return a.source !== null && a.source === forId ? null : a.point;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number): void {
    const player = this.game.player;
    if (!player) return;
    this.leaderPosition.copy(player.entity.object3D.position);
    this.leaderSpeed = player.followTarget.speed;
    this.leaderStillFor = this.leaderSpeed < 0.25 ? this.leaderStillFor + dt : 0;
    this.leaderForward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    player.visual.socketPosition('head', this.leaderHead);
    this.trail.record(this.leaderPosition);
    this.updateOcclusion();
  }

  /** Companions standing between the camera and Subaru dissolve partially. */
  private updateOcclusion(): void {
    // Conversations and cutscenes frame people deliberately (over-the-shoulder shots).
    const staged = this.game.mode === 'dialogue' || this.game.mode === 'cinematic';
    if (staged) {
      for (const f of this.followers.values()) f.actor.visual.setOccluding?.(false);
      return;
    }
    const cam = this.game.render.camera.position;
    const seg = _seg.subVectors(this.leaderHead, cam);
    const segLen = seg.length();
    if (segLen < 1e-3) return;
    seg.divideScalar(segLen);
    for (const f of this.followers.values()) {
      const p = f.actor.visual.socketPosition('chest', _p);
      const t = _q.subVectors(p, cam).dot(seg);
      let occ = false;
      if (t > 0.2 && t < segLen - 0.3) {
        const closest = _q.copy(cam).addScaledVector(seg, t);
        // Horizontal distance from the sight line; bodies are tall.
        occ = Math.hypot(p.x - closest.x, p.z - closest.z) < 0.5 && Math.abs(p.y - closest.y) < 0.9;
      }
      f.actor.visual.setOccluding?.(occ);
    }
  }

  private setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    for (const f of this.followers.values()) {
      if (held) {
        f.actor.hold();
        f.actor.stop();
      } else f.actor.release();
    }
  }

  // ------------------------------------------------------------------ spawning
  private requestReconcile(): void {
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling = this.reconcile()
      .catch((err) => log.error('Party reconcile failed', err))
      .finally(() => {
        this.reconciling = null;
        if (this.reconcileAgain) {
          this.reconcileAgain = false;
          this.requestReconcile();
        }
      });
  }

  private async reconcile(): Promise<void> {
    const area = this.game.scenes.current;
    const wanted = area && area.partyPolicy === 'follow' ? this.members() : [];
    for (const [id, f] of this.followers) {
      if (wanted.includes(id)) continue;
      this.followers.delete(id);
      f.actor.brain = null;
      this.game.actors.despawn(id);
    }
    for (const id of wanted) {
      if (this.followers.has(id)) continue;
      const def = PARTY_MEMBERS[id]!;
      const brain = new FollowerBrain(this, def, 0);
      const pos = new Vector3();
      this.slotAt(def.followDistance, def.lateral, pos);
      const actor = await this.game.actors.spawn(id, {
        position: pos,
        yaw: Math.atan2(this.leaderForward.x, this.leaderForward.z),
        scope: 'persistent',
        tags: ['party'],
      });
      // Membership may have changed while the model loaded.
      if (!this.isMember(id)) {
        this.game.actors.despawn(id);
        continue;
      }
      actor.brain = brain;
      if (COMBAT_STYLES[id] && !actor.entity.get(CompanionCombat)) actor.entity.add(new CompanionCombat(this.game, actor));
      if (this.held) actor.hold();
      this.followers.set(id, { actor, brain });
    }
    // Formation index follows story order.
    let i = 0;
    for (const id of PARTY_ORDER) {
      const f = this.followers.get(id);
      if (f) f.brain.index = i++;
    }
  }

  private onPlayerPlaced(position: Vector3, yaw: number): void {
    this.leaderPosition.copy(position);
    this.leaderForward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.trail.reset(position);
    for (const f of this.followers.values()) {
      const p = new Vector3();
      this.slotFor(f.brain, p);
      if (!this.clearPath(position, p)) p.copy(position).addScaledVector(this.leaderForward, -0.9);
      f.actor.placeAt(p, yaw);
    }
  }

  // ------------------------------------------------------------------ queries for brains
  /** The follower's formation slot on the leader's path. */
  slotFor(brain: FollowerBrain, out: Vector3): Vector3 {
    const def = brain.def;
    // Later members hang back a little further so the group strings out.
    const dist = def.followDistance + brain.index * 0.35;
    this.slotAt(dist, def.lateral, out);
    // The path behind went over a ledge or up/down stairs: stand near the
    // leader on their level instead of back where the path was.
    if (Math.abs(out.y - this.leaderPosition.y) > 0.6) this.localSlot(dist, def.lateral, out);
    return out;
  }

  /** A free spot around the leader at their level, preferring behind. */
  private localSlot(dist: number, lateral: number, out: Vector3): Vector3 {
    const baseYaw = Math.atan2(-this.leaderForward.x, -this.leaderForward.z);
    const bias = lateral >= 0 ? 1 : -1;
    for (const deg of [0, 40, -40, 80, -80, 125, -125, 180]) {
      const a = baseYaw + (deg * bias * Math.PI) / 180;
      _p.set(this.leaderPosition.x + Math.sin(a) * dist, this.leaderPosition.y, this.leaderPosition.z + Math.cos(a) * dist);
      if (!this.clearPath(this.leaderPosition, _p)) continue;
      const g = this.game.physics.groundHeight(_p.x, this.leaderPosition.y + 1.2, _p.z, 3.5);
      if (g !== null && Math.abs(g - this.leaderPosition.y) < 0.35) {
        out.set(_p.x, g, _p.z);
        return out;
      }
    }
    return out.copy(this.leaderPosition);
  }

  private slotAt(dist: number, lateral: number, out: Vector3): Vector3 {
    this.trail.sampleBack(this.leaderPosition, dist, this.leaderForward, out, _dir);
    const onPath = _onPath.copy(out);
    const g0 = this.game.physics.groundHeight(onPath.x, onPath.y + 1.2, onPath.z, 3.5);
    if (g0 !== null) onPath.y = g0;
    const left = _left.set(_dir.z, 0, -_dir.x);
    // Walk beside the path only where the ground beside it is the same
    // level (not off the side of a staircase or bridge).
    for (const k of [1, 0.4]) {
      out.copy(onPath).addScaledVector(left, lateral * k);
      if (!this.clearPath(onPath, out)) continue;
      const g = this.game.physics.groundHeight(out.x, onPath.y + 1.2, out.z, 3.5);
      if (g !== null && Math.abs(g - onPath.y) < 0.35) {
        out.y = g;
        return out;
      }
    }
    return out.copy(onPath);
  }

  /** Can a character walk straight from a to b (nothing solid in between)? */
  clearPath(a: Vector3, b: Vector3): boolean {
    _a.set(a.x, a.y + 0.55, a.z);
    _b.set(b.x, b.y + 0.55, b.z);
    return this.game.physics.lineOfSight(_a, _b, Masks.characterBlockers);
  }

  /** The most advanced trail point visible from `from` (routing around corners). */
  trailWaypoint(from: Vector3, out: Vector3): boolean {
    const n = this.trail.length;
    const stride = Math.max(1, Math.floor(n / 24));
    for (let i = 0; i < n; i += stride) {
      const p = this.trail.point(i);
      if (this.clearPath(from, p)) {
        out.copy(p);
        return true;
      }
    }
    return false;
  }

  /** Push-apart steering from the player and other companions. */
  addSeparation(actor: ActorController, steer: Vector3): void {
    const pos = actor.position;
    const add = (other: Vector3, radius: number, strength: number) => {
      if (Math.abs(other.y - pos.y) > 0.7) return; // different level: no crowding
      const dx = pos.x - other.x;
      const dz = pos.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d >= radius || d < 1e-4) return;
      const k = ((radius - d) / radius) * strength;
      steer.x += (dx / d) * k;
      steer.z += (dz / d) * k;
    };
    add(this.leaderPosition, 0.95, 2.2);
    for (const f of this.followers.values()) if (f.actor !== actor) add(f.actor.position, 0.75, 1.4);
  }

  /**
   * Reappear somewhere on the trail behind the player that the camera can't
   * see (no popping into view). Returns false if no spot was found.
   */
  warpBehind(actor: ActorController, brain: FollowerBrain): boolean {
    const cam = this.game.render.camera;
    cam.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const base = brain.def.followDistance + 1.5;
    let fallback: Vector3 | null = null;
    for (let extra = 0; extra <= 8; extra += 1) {
      const p = this.slotAt(base + extra, brain.def.lateral * 0.5, _p);
      if (!this.clearPath(this.leaderPosition, p) && extra < 8) continue;
      _eye.set(p.x, p.y + 1.2, p.z);
      const visible = _frustum.containsPoint(_eye) && this.game.physics.lineOfSight(cam.position, _eye, Masks.lineOfSight);
      if (!visible) {
        actor.placeAt(p.clone(), actor.yawTo(this.leaderPosition));
        return true;
      }
      fallback ??= p.clone();
    }
    // Everything is on screen: only warp when truly lost.
    const far = actor.position.distanceTo(this.leaderPosition) > 45;
    if (fallback && far) {
      actor.placeAt(fallback, actor.yawTo(this.leaderPosition));
      return true;
    }
    return false;
  }
}

const _dir = new Vector3();
const _left = new Vector3();
const _onPath = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _eye = new Vector3();
const _seg = new Vector3();
const _q = new Vector3();
const _m = new Matrix4();
const _frustum = new Frustum();
