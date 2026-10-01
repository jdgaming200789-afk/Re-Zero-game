import { Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import { computeDamage, type DamageInfo, type DamageResult, type Faction, type Resistances, type StatusApplication, type StatusId } from './Damage';

export interface HealthOptions {
  max: number;
  faction: Faction;
  /** Display name for HUD bars. */
  name: string;
  /** Character or enemy definition id. */
  characterId?: string;
  poise?: number;
  poiseRegen?: number;
  resist?: Resistances;
  /** Body size for hit tests (m). */
  radius?: number;
  height?: number;
  /** Bosses/elites get a big HUD bar. */
  elite?: boolean;
  /** e.g. 'witchbeast' (charmable). */
  tags?: string[];
}

interface ActiveStatus {
  id: StatusId;
  until: number;
  magnitude: number;
}

/**
 * Hit points, poise, shields, invulnerability and status effects for
 * anything that can be hurt. The CombatManager owns the damage pipeline;
 * owners react through `onHit` / `onDeath` (animations, AI, UI).
 */
export class Health extends Component {
  hp: number;
  max: number;
  readonly faction: Faction;
  readonly name: string;
  readonly characterId: string | undefined;
  readonly radius: number;
  readonly height: number;
  readonly elite: boolean;
  readonly tags: readonly string[];
  resist: Resistances;
  poise: number;
  readonly poiseMax: number;
  poiseRegen: number;
  /** Absorbs damage before HP (barriers). */
  shield = 0;
  private shieldUntil = 0;
  private invulnerableUntil = 0;
  private invulnerableLocks = 0;
  private staggeredUntil = 0;
  private readonly statusMap = new Map<StatusId, ActiveStatus>();
  private readonly statusIds = new Set<StatusId>();
  /** Game time (seconds), advanced by the CombatManager. */
  now = 0;
  /** Extra hittable points for long bodies (worm segments), world space. */
  extraPoints: Vector3[] | null = null;
  /** Radius of each extra point. */
  extraRadius = 0;

  onHit?: (result: DamageResult, info: DamageInfo) => void;
  /** A blow that would have landed passed through invulnerability (dodge i-frames, a barrier). */
  onEvade?: (info: DamageInfo) => void;
  /** Return true to parry the blow outright (a guard that no damage passes). */
  guard?: (info: DamageInfo) => boolean;
  onDeath?: (info: DamageInfo) => void;
  onStatus?: (status: StatusId, active: boolean) => void;

  constructor(opts: HealthOptions) {
    super();
    this.max = opts.max;
    this.hp = opts.max;
    this.faction = opts.faction;
    this.name = opts.name;
    this.characterId = opts.characterId;
    this.poiseMax = opts.poise ?? 30;
    this.poise = this.poiseMax;
    this.poiseRegen = opts.poiseRegen ?? 12;
    this.resist = { ...(opts.resist ?? {}) };
    this.radius = opts.radius ?? 0.35;
    this.height = opts.height ?? 1.7;
    this.elite = opts.elite ?? false;
    this.tags = opts.tags ?? [];
  }

  /** Charmed witchbeasts fight for the other side. */
  get effectiveFaction(): Faction {
    if (!this.statusIds.has('charmed')) return this.faction;
    return this.faction === 'enemy' ? 'party' : this.faction === 'party' ? 'enemy' : 'neutral';
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get fraction(): number {
    return this.max > 0 ? this.hp / this.max : 0;
  }

  get invulnerable(): boolean {
    return this.invulnerableLocks > 0 || this.now < this.invulnerableUntil;
  }

  get staggered(): boolean {
    return this.now < this.staggeredUntil;
  }

  /** Brief invulnerability (dodge i-frames, get-up grace). */
  grantInvulnerability(seconds: number): void {
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.now + seconds);
  }

  /** Held invulnerability (cinematics, E·M·M). Counted. */
  lockInvulnerable(on: boolean): void {
    this.invulnerableLocks = Math.max(0, this.invulnerableLocks + (on ? 1 : -1));
  }

  addShield(amount: number, seconds: number): void {
    this.shield = Math.max(this.shield, amount);
    this.shieldUntil = Math.max(this.shieldUntil, this.now + seconds);
  }

  // ------------------------------------------------------------------ statuses
  hasStatus(id: StatusId): boolean {
    return this.statusIds.has(id);
  }

  statusMagnitude(id: StatusId): number {
    return this.statusMap.get(id)?.magnitude ?? 0;
  }

  get statuses(): ReadonlySet<StatusId> {
    return this.statusIds;
  }

  applyStatus(s: StatusApplication): void {
    const existing = this.statusMap.get(s.id);
    const until = this.now + s.seconds;
    if (existing) {
      existing.until = Math.max(existing.until, until);
      existing.magnitude = Math.max(existing.magnitude, s.magnitude ?? 1);
      return;
    }
    this.statusMap.set(s.id, { id: s.id, until, magnitude: s.magnitude ?? 1 });
    this.statusIds.add(s.id);
    this.onStatus?.(s.id, true);
  }

  clearStatus(id: StatusId): void {
    if (!this.statusMap.delete(id)) return;
    this.statusIds.delete(id);
    this.onStatus?.(id, false);
  }

  /** Can act this frame (not stopped/frozen/staggered/dead). */
  get canAct(): boolean {
    return this.alive && !this.staggered && !this.statusIds.has('stopped') && !this.statusIds.has('frozen');
  }

  // ------------------------------------------------------------------ damage (called by CombatManager)
  receive(info: DamageInfo): DamageResult {
    if (!this.alive || this.invulnerable) return { applied: 0, absorbed: 0, killed: false, staggered: false, ignored: true };
    const { damage, absorbed } = computeDamage(info, this.resist, this.statusIds, this.shield);
    this.shield -= absorbed;
    this.hp = Math.max(0, this.hp - damage);
    let staggered = false;
    if (info.stagger && this.alive) {
      this.poise -= info.stagger;
      if (this.poise <= 0) {
        this.poise = this.poiseMax;
        this.staggeredUntil = this.now + 0.9;
        staggered = true;
      }
    }
    // A physical blow shatters ice.
    if (info.type === 'physical' && this.statusIds.has('frozen')) this.clearStatus('frozen');
    if (info.status && this.alive) this.applyStatus(info.status);
    return { applied: damage, absorbed, killed: !this.alive, staggered, ignored: false };
  }

  heal(amount: number): number {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.max, this.hp + amount);
    return this.hp - before;
  }

  revive(fraction = 1): void {
    this.hp = Math.max(1, Math.round(this.max * fraction));
    this.poise = this.poiseMax;
    this.statusMap.clear();
    this.statusIds.clear();
  }

  /** Per-frame upkeep: poise regen, shield and status expiry. */
  tick(dt: number, now: number): void {
    this.now = now;
    if (this.poise < this.poiseMax) this.poise = Math.min(this.poiseMax, this.poise + this.poiseRegen * dt);
    if (this.shield > 0 && now >= this.shieldUntil) this.shield = 0;
    for (const s of this.statusMap.values()) if (now >= s.until) this.clearStatus(s.id);
  }

  /** Torso centre in world space (targeting, hit effects). */
  center(out = new Vector3()): Vector3 {
    return out.copy(this.entity.object3D.position).setY(this.entity.object3D.position.y + this.height * 0.55);
  }
}
