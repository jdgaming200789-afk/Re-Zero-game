import type { Vector3 } from 'three';
import type { EnemyController } from './EnemyController';

/**
 * Coordinates a pack: at most `maxAttackers` press the attack at once while
 * the rest circle in spread-out slots (so a fight reads as a pack working
 * together, not a pile-up), and members keep their distance from each other.
 */
export class PackDirector {
  private readonly attackers = new Set<EnemyController>();
  private readonly slots = new Map<EnemyController, number>();
  private readonly waiting = new Map<EnemyController, number>();

  constructor(
    readonly members: EnemyController[],
    public maxAttackers = 2,
  ) {}

  request(c: EnemyController): boolean {
    if (this.attackers.has(c)) return true;
    // Free up tokens held by the dead, charmed or frozen.
    for (const a of this.attackers) if (!a.alive || !a.health.canAct || a.health.hasStatus('charmed')) this.attackers.delete(a);
    const waited = (this.waiting.get(c) ?? 0) + 1;
    this.waiting.set(c, waited);
    if (this.attackers.size >= this.maxAttackers) return false;
    // Whoever has waited longest goes first.
    for (const [other, w] of this.waiting) if (other !== c && other.alive && !this.attackers.has(other) && w > waited + 6) return false;
    this.attackers.add(c);
    this.waiting.delete(c);
    return true;
  }

  release(c: EnemyController): void {
    this.attackers.delete(c);
  }

  /** Evenly spaced angle around the target for this member. */
  slotAngle(c: EnemyController): number {
    let s = this.slots.get(c);
    if (s === undefined) {
      s = this.slots.size;
      this.slots.set(c, s);
    }
    const n = Math.max(1, this.members.filter((m) => m.alive).length);
    return (s / n) * Math.PI * 2;
  }

  /** Push-apart steering so the pack doesn't stack. */
  addSpacing(c: EnemyController, steer: Vector3): void {
    const p = c.actor.position;
    for (const o of this.members) {
      if (o === c || !o.alive) continue;
      const q = o.actor.position;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.4 || d < 1e-4) continue;
      const k = ((1.4 - d) / 1.4) * 2.5;
      steer.x += (dx / d) * k;
      steer.z += (dz / d) * k;
    }
  }
}

