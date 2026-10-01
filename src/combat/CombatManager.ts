import { Vector3 } from 'three';
import { createLogger } from '../core/Log';
import type { GameContext, GameSystem } from '../game/GameContext';
import { Masks } from '../physics/Physics';
import { Impacts } from '../vfx/Impacts';
import { hostile, type DamageInfo, type DamageResult, type Faction } from './Damage';
import type { Health } from './Health';
import { AreaEffect, type AreaEffectOptions } from './AreaEffect';
import { Projectile, type ProjectileOptions } from './Projectile';
import type { TransientVfx } from './effects/CombatVfx';
import { Telegraphs, type Telegraph, type TelegraphShape } from './Telegraphs';

const log = createLogger('Combat');

export interface EncounterOptions {
  /** Enemies that must fall for a victory. */
  enemies: Health[];
  /** Leaving this circle (far from every enemy) ends the encounter as an escape. */
  arena?: { center: Vector3; radius: number };
}

interface Encounter {
  id: string;
  enemies: Health[];
  arena?: { center: Vector3; radius: number };
  startedAt: number;
}

export interface TargetFilter {
  /** Only return bodies hostile to this faction. */
  hostileTo?: Faction;
  /** Only this faction. */
  faction?: Faction;
  exclude?: number;
  /** Require a clear line from the query origin. */
  lineOfSightFrom?: Vector3;
}

/**
 * Owns combat state: every damageable body, the damage pipeline (friendly
 * fire rules, hit reactions, hit-stop, shake, impact effects, events),
 * spatial target queries and encounter lifecycle (combat mode on/off).
 */
export class CombatManager implements GameSystem {
  readonly name = 'combat';
  private readonly bodies = new Set<Health>();
  private readonly byEntity = new Map<number, Health>();
  private encounter: Encounter | null = null;
  private holds = 0;
  /** Scale on companions' damage to enemies (tuning: they support, Subaru directs). */
  companionDamageScale = 0.55;
  private readonly areas: AreaEffect[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly transients: TransientVfx[] = [];
  readonly impacts: Impacts;
  readonly telegraphs: Telegraphs;
  /** Game-time clock for statuses and cooldowns. */
  now = 0;

  constructor(private readonly game: GameContext) {
    this.impacts = new Impacts(game.vfx, game.render.scene);
    this.telegraphs = new Telegraphs(game.render.scene);
    game.events.on('area:unloaded', () => this.prune());
  }

  // ------------------------------------------------------------------ registry
  register(h: Health): Health {
    this.bodies.add(h);
    this.byEntity.set(h.entity.id, h);
    h.now = this.now;
    return h;
  }

  unregister(h: Health): void {
    this.bodies.delete(h);
    if (this.byEntity.get(h.entity.id) === h) this.byEntity.delete(h.entity.id);
  }

  get(entityId: number | null | undefined): Health | undefined {
    return entityId == null ? undefined : this.byEntity.get(entityId);
  }

  all(): Health[] {
    return Array.from(this.bodies);
  }

  private prune(): void {
    for (const h of this.bodies) if (h.entity.destroyed) this.unregister(h);
  }

  // ------------------------------------------------------------------ damage
  damage(target: Health, info: DamageInfo): DamageResult {
    const source = this.get(info.sourceId);
    if (source && !hostile(source.effectiveFaction, target.effectiveFaction)) {
      return { applied: 0, absorbed: 0, killed: false, staggered: false, ignored: true };
    }
    if (target.alive && target.guard?.(info)) {
      const at = info.point ?? target.center(_p);
      this.impacts.burst('block', at, 14);
      this.game.events.emit('combat:parried', { targetId: target.entity.id, attackerId: info.sourceId ?? -1, position: at.clone() });
      return { applied: 0, absorbed: 0, killed: false, staggered: false, ignored: true };
    }
    // Companions support; they don't end fights before Subaru has acted.
    if (source && source.faction === 'party' && info.sourceId !== this.game.player?.entity.id && this.companionDamageScale !== 1) {
      info = { ...info, amount: info.amount * this.companionDamageScale };
    }
    const result = target.receive(info);
    const point = info.point ?? target.center(_p);
    if (result.ignored) {
      if (target.alive && target.invulnerable) {
        this.impacts.burst('block', point, 8);
        target.onEvade?.(info);
      }
      return result;
    }
    const g = this.game;
    g.events.emit('combat:hit', {
      attackerId: info.sourceId ?? -1,
      targetId: target.entity.id,
      position: point.clone(),
      amount: result.applied,
      critical: info.critical ?? false,
      damageType: info.type,
    });
    g.events.emit('character:damaged', { entityId: target.entity.id, amount: result.applied, sourceId: info.sourceId, stagger: result.staggered });
    // Feel: hit-stop for meaningful blows, shake when Subaru is involved.
    const heavy = (info.stagger ?? 0) >= 20 || result.staggered || result.killed;
    const stop = info.hitStop ?? (heavy ? 0.07 : 0.035);
    if (stop > 0) g.time.hitStop(stop, 0.06);
    const playerId = g.player?.entity.id;
    if (target.entity.id === playerId) {
      g.camera.shake.add(heavy ? 0.45 : 0.25);
      g.camera.follow.kick(heavy ? 0.22 : 0.1);
    } else if (info.sourceId === playerId) {
      g.camera.shake.add(heavy ? 0.18 : 0.08);
      if (heavy || info.critical) g.camera.follow.kick(-0.12);
      if (info.critical) g.camera.follow.punchFov(-5);
    }
    this.impacts.burst(result.absorbed > 0 && result.applied === 0 ? 'block' : info.type, point, heavy ? 28 : 16);
    target.onHit?.(result, info);
    if (result.killed) {
      g.events.emit('character:died', { entityId: target.entity.id, characterId: target.characterId ?? target.name });
      target.onDeath?.(info);
      log.info(`${target.name} defeated`);
      if (this.encounterId && hostile('party', target.effectiveFaction) && !this.hostilesNear(target)) this.finalBlow(target, point);
    }
    return result;
  }

  private hostilesNear(except: Health): boolean {
    const at = except.entity.object3D.position;
    for (const h of this.bodies) {
      if (h === except || !h.alive || h.entity.destroyed || !hostile('party', h.effectiveFaction)) continue;
      if (h.entity.object3D.position.distanceTo(at) < 45) return true;
    }
    return false;
  }

  /** The last enemy falls: a beat of slow motion to let the fight land. */
  private finalBlow(target: Health, point: Vector3): void {
    const g = this.game;
    g.time.slowMotion(0.25, 0.8);
    g.camera.shake.add(0.3);
    g.render.chromaticPulse = Math.max(g.render.chromaticPulse, 1.2);
    target.entity.object3D.visible && this.impacts.burst('physical', point, 40);
    g.events.emit('combat:finalBlow', { position: point.clone() });
  }

  heal(target: Health, amount: number): number {
    const healed = target.heal(amount);
    if (healed > 0) this.impacts.burst('heal', target.center(_p), 14);
    return healed;
  }

  // ------------------------------------------------------------------ queries
  private passes(h: Health, f: TargetFilter): boolean {
    if (!h.alive || h.entity.destroyed || !h.entity.active) return false;
    if (f.exclude !== undefined && h.entity.id === f.exclude) return false;
    if (f.faction && h.effectiveFaction !== f.faction) return false;
    if (f.hostileTo && !hostile(f.hostileTo, h.effectiveFaction)) return false;
    return true;
  }

  private visible(from: Vector3 | undefined, h: Health): boolean {
    if (!from) return true;
    // Stop at the target's surface: its own collider must not block the ray.
    const to = h.center(_q);
    const d = to.distanceTo(from);
    const stop = Math.max(0, d - h.radius - 0.2);
    if (stop < 0.05) return true;
    to.sub(from).multiplyScalar(stop / d).add(from);
    return this.game.physics.lineOfSight(from, to, Masks.lineOfSight);
  }

  /** Bodies whose capsule intersects a sphere. */
  sphere(center: Vector3, radius: number, f: TargetFilter = {}): Health[] {
    const out: Health[] = [];
    for (const h of this.bodies) {
      if (!this.passes(h, f)) continue;
      const base = h.entity.object3D.position;
      const y = Math.min(Math.max(center.y, base.y), base.y + h.height);
      let d = Math.hypot(center.x - base.x, center.y - y, center.z - base.z) - h.radius;
      if (h.extraPoints) for (const p of h.extraPoints) d = Math.min(d, p.distanceTo(center) - h.extraRadius);
      if (d <= radius && this.visible(f.lineOfSightFrom, h)) out.push(h);
    }
    return out;
  }

  /** Bodies inside a horizontal arc in front of `origin` (melee swings). */
  arc(origin: Vector3, forward: Vector3, range: number, arcDeg: number, f: TargetFilter = {}): Health[] {
    const out: Health[] = [];
    const cosHalf = Math.cos((arcDeg * Math.PI) / 360);
    const fx = forward.x;
    const fz = forward.z;
    const fl = Math.hypot(fx, fz) || 1;
    for (const h of this.bodies) {
      if (!this.passes(h, f)) continue;
      const pts = h.extraPoints ? [h.entity.object3D.position, ...h.extraPoints] : [h.entity.object3D.position];
      const r = h.extraPoints ? Math.max(h.radius, h.extraRadius) : h.radius;
      let inside = false;
      for (const p of pts) {
        if (Math.abs(p.y + (p === h.entity.object3D.position ? h.height * 0.5 : 0) - origin.y) > h.height * 0.5 + 1.2 + (p === h.entity.object3D.position ? 0 : r)) continue;
        const dx = p.x - origin.x;
        const dz = p.z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d - r > range) continue;
        // Anything overlapping the attacker counts; otherwise it must be in the arc.
        if (d > r + 0.2 && (dx * fx + dz * fz) / (d * fl) < cosHalf) continue;
        inside = true;
        break;
      }
      if (inside && this.visible(f.lineOfSightFrom, h)) out.push(h);
    }
    return out;
  }

  nearest(from: Vector3, maxDist: number, f: TargetFilter = {}): Health | null {
    let best: Health | null = null;
    let bestD = maxDist;
    for (const h of this.bodies) {
      if (!this.passes(h, f)) continue;
      const d = h.entity.object3D.position.distanceTo(from);
      if (d < bestD && this.visible(f.lineOfSightFrom, h)) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ encounters
  get inCombat(): boolean {
    return this.encounter !== null;
  }

  /**
   * Keep the current fight open while reinforcements are on their way
   * (otherwise it could be won in the gap). Call the returned function once
   * they've joined — or failed to.
   */
  holdOpen(): () => void {
    this.holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
    };
  }

  get encounterId(): string | null {
    return this.encounter?.id ?? null;
  }

  get enemies(): Health[] {
    // Charmed witchbeasts fight for the party: they don't hold the encounter open.
    return this.encounter ? this.encounter.enemies.filter((e) => e.alive && !e.entity.destroyed && e.effectiveFaction === 'enemy') : [];
  }

  startEncounter(id: string, opts: EncounterOptions): void {
    if (this.encounter) {
      // Reinforcements join the running fight.
      for (const e of opts.enemies) if (!this.encounter.enemies.includes(e)) this.encounter.enemies.push(e);
      return;
    }
    this.encounter = { id, enemies: [...opts.enemies], arena: opts.arena, startedAt: this.now };
    const g = this.game;
    if (g.mode === 'exploration') g.setMode('combat');
    g.camera.follow.setProfile('combat');
    if (g.player) g.player.combatMode = true;
    g.events.emit('combat:started', { encounterId: id });
    // An elite (the Sand Earthworm) gets the boss arrangement.
    g.events.emit('audio:musicState', { state: opts.enemies.some((e) => e.elite) ? 'boss' : 'combat' });
    log.info(`Encounter ${id} started (${opts.enemies.length} enemies)`);
  }

  /** Drop every fight, projectile, lingering effect and warning (Return by Death, loads). */
  reset(): void {
    this.holds = 0;
    if (this.encounter) this.endEncounter(false);
    for (const p of this.projectiles.splice(0)) p.dispose();
    for (const t of this.transients.splice(0)) t.dispose();
    for (const a of this.areas.splice(0)) a.dispose();
    for (const t of this.telegraphs.list.slice()) this.telegraphs.cancel(t.id);
  }

  endEncounter(victory: boolean): void {
    const e = this.encounter;
    if (!e) return;
    this.encounter = null;
    const g = this.game;
    if (g.mode === 'combat') g.setMode('exploration');
    g.camera.follow.setProfile('exploration');
    if (g.player) {
      g.player.combatMode = false;
      g.player.strafeTarget = null;
    }
    g.events.emit('combat:ended', { encounterId: e.id, victory });
    g.events.emit('audio:musicState', { state: g.scenes.areaMusic() });
    log.info(`Encounter ${e.id} ended (${victory ? 'victory' : 'escape'})`);
  }

  /** A lingering zone that affects bodies inside (Shamak, ice fields). */
  addArea(opts: AreaEffectOptions): AreaEffect {
    const a = new AreaEffect(opts, this.game.render.scene, this.game.vfx);
    this.areas.push(a);
    return a;
  }

  /** Launch a projectile; hits the first hostile body or wall on its path. */
  fire(opts: ProjectileOptions): Projectile {
    const p = new Projectile(opts, this.game.render.scene);
    this.projectiles.push(p);
    return p;
  }

  /** Register a short-lived effect (slash arcs, ice eruptions). */
  addVfx<T extends TransientVfx>(v: T): T {
    this.transients.push(v);
    return v;
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const from = _p.copy(p.position);
      p.step(dt);
      const o = p.opts;
      let hit: Health | null = null;
      // Bodies first (small, fast projectiles: test at the new position).
      const bodies = this.sphere(p.position, o.radius, { hostileTo: o.faction });
      if (bodies.length) hit = bodies[0]!;
      // Walls
      let wall = false;
      if (!hit) {
        const seg = _q.subVectors(p.position, from);
        const len = seg.length();
        if (len > 1e-4) {
          const r = this.game.physics.raycast(from, seg.divideScalar(len), len, Masks.lineOfSight);
          if (r) {
            wall = true;
            p.position.copy(r.point);
          }
        }
      }
      if (hit || wall || p.travelled >= o.maxDistance) {
        if (hit) this.damage(hit, { ...o.damage, point: p.position.clone(), direction: p.velocity.clone().normalize() });
        else if (wall) this.impacts.burst(o.damage.type, p.position, 10);
        o.onImpact?.(p.position.clone(), hit);
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Warn of an attack landing in `seconds` over `shape`. */
  telegraph(shape: TelegraphShape, source: Health, seconds: number): Telegraph {
    return this.telegraphs.add(shape, source.entity.id, source.effectiveFaction, this.now, seconds);
  }

  /** Incoming telegraphed attacks that would catch `h` where it stands. */
  threatsTo(h: Health): Telegraph[] {
    return this.telegraphs.threatening(h.entity.object3D.position, h.radius, h.effectiveFaction, hostile);
  }

  update(dt: number): void {
    this.now += dt;
    this.telegraphs.update(this.now);
    this.stepProjectiles(dt);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      if (!this.transients[i]!.update(dt)) {
        this.transients[i]!.dispose();
        this.transients.splice(i, 1);
      }
    }
    for (const h of this.bodies) {
      if (h.entity.destroyed) {
        this.unregister(h);
        continue;
      }
      h.tick(dt, this.now);
    }
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i]!;
      if (!a.update(dt, this.bodies)) {
        a.dispose();
        this.areas.splice(i, 1);
      }
    }
    const e = this.encounter;
    if (!e) return;
    if (this.enemies.length === 0) {
      if (this.holds > 0) return;
      this.endEncounter(true);
      return;
    }
    if (e.arena && this.game.player) {
      const p = this.game.player.entity.object3D.position;
      const out = p.distanceTo(e.arena.center) > e.arena.radius;
      const farFromAll = this.enemies.every((x) => x.entity.object3D.position.distanceTo(p) > 18);
      if (out && farFromAll) this.endEncounter(false);
    }
  }
}

const _p = new Vector3();
const _q = new Vector3();
