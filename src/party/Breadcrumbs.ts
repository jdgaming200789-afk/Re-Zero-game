import { Vector3 } from 'three';

/**
 * The leader's recent path as evenly spaced points (newest first). Followers
 * walk the path the player actually took — around pillars, through doors,
 * up stairs — instead of beelining into walls, and formation slots are
 * placed along it.
 */
export class Breadcrumbs {
  private readonly pts: Vector3[];
  private head = 0;
  private count = 0;

  constructor(
    readonly capacity = 96,
    readonly spacing = 0.35,
  ) {
    this.pts = Array.from({ length: capacity }, () => new Vector3());
  }

  get length(): number {
    return this.count;
  }

  reset(p: Vector3): void {
    this.count = 0;
    this.push(p);
  }

  /** Record the leader's position; returns true if a crumb was dropped. */
  record(p: Vector3): boolean {
    if (this.count === 0) {
      this.push(p);
      return true;
    }
    const last = this.point(0);
    const d = last.distanceTo(p);
    if (d < this.spacing) return false;
    // Teleport-sized jumps restart the trail.
    if (d > 6) {
      this.reset(p);
      return true;
    }
    this.push(p);
    return true;
  }

  /** i = 0 is the newest crumb. */
  point(i: number): Vector3 {
    const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
    return this.pts[idx]!;
  }

  private push(p: Vector3): void {
    this.pts[this.head]!.copy(p);
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /**
   * The point `dist` metres back along the path from `from` (the leader's
   * current position), and the direction of travel there. If the trail is
   * shorter than that, continues straight back along `fallbackDir`.
   */
  sampleBack(from: Vector3, dist: number, fallbackDir: Vector3, outPos: Vector3, outDir: Vector3): void {
    let remaining = dist;
    let prev = from;
    outDir.copy(fallbackDir);
    for (let i = 0; i < this.count; i++) {
      const p = this.point(i);
      const seg = _seg.subVectors(prev, p);
      seg.y = 0;
      const len = seg.length();
      if (len > 1e-4) outDir.copy(seg).divideScalar(len);
      if (len >= remaining) {
        outPos.copy(prev).lerp(p, remaining / Math.max(len, 1e-6));
        return;
      }
      remaining -= len;
      prev = p;
    }
    outPos.copy(prev).addScaledVector(outDir, -remaining);
  }
}

const _seg = new Vector3();
