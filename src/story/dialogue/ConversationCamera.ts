import { Vector3 } from 'three';
import type { CameraShot } from '../../camera/CameraDirector';
import { Masks, type Physics } from '../../physics/Physics';

export type ShotKind = 'ots' | 'single' | 'two' | 'wide';

/**
 * Composes conversation coverage the way an anime storyboard would:
 * over-the-shoulder shot / reverse shot, singles for emphasis, two-shots
 * and a wide establishing frame. Every camera stays on one side of the line
 * of action (the 180° rule) so the eyelines match across cuts, and shots are
 * pulled in front of walls rather than clipping through them.
 */
/** How far below eye level a downcast line's camera drops (m). */
const LOW_ANGLE = 0.24;

export class ConversationCamera {
  /** Unit vector pointing to the side of the line of action the camera lives on. */
  private readonly side = new Vector3(1, 0, 0);

  constructor(private readonly physics: Physics) {}

  /** Fix the line of action between two characters, on the side the camera already is. */
  begin(a: Vector3, b: Vector3, cameraPosition: Vector3): void {
    const axis = _a.subVectors(b, a).setY(0);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    axis.normalize();
    this.side.set(axis.z, 0, -axis.x);
    const toCam = _b.subVectors(cameraPosition, a).setY(0);
    if (toCam.dot(this.side) < 0) this.side.negate();
  }

  /**
   * The requested coverage, or the nearest alternative that fits the room
   * (a wall behind the listener turns an over-the-shoulder into a single,
   * a cramped single into a two-shot, and so on down to the wide).
   */
  compose(kind: ShotKind, speaker: Vector3, listener: Vector3 | null, group: Vector3[], opts: { low?: boolean } = {}): ConvShot {
    if (kind === 'wide' || !listener) return this.wide(group.length ? group : [speaker]) ?? this.wide(group.length ? group : [speaker], true)!;
    const d = _a.subVectors(speaker, listener).setY(0).length();
    if (kind === 'ots' && d > 5) kind = 'single';
    // A downcast line (head bowed, eyes on the floor) is shot from below
    // eye level, looking up into the face — from above it's a hood or a
    // fringe and no face at all.
    const low = opts.low ? LOW_ANGLE : 0;
    const order: ShotKind[] = kind === 'ots' ? ['ots', 'single', 'two'] : kind === 'single' ? ['single', 'ots', 'two'] : ['two', 'single', 'ots'];
    for (const k of order) {
      const s = k === 'ots' ? this.ots(speaker, listener, low) : k === 'single' ? this.single(speaker, listener, low) : this.two(speaker, listener);
      if (s) {
        s.kind = k;
        return s;
      }
    }
    return this.wide(group.length ? group : [speaker]) ?? this.wide(group.length ? group : [speaker], true)!;
  }

  /** Behind the listener's shoulder, looking at the speaker. */
  private ots(speaker: Vector3, listener: Vector3, low = 0): ConvShot | null {
    const axis = this.axis(listener, speaker);
    const perp = this.perp(axis);
    // Aim a little to the listener's side so the speaker sits on the far third
    // and the listener's shoulder frames the near edge.
    const at = _at.copy(speaker).addScaledVector(perp, 0.18);
    at.y -= 0.07 + low * 0.25;
    const from = _from.copy(listener).addScaledVector(axis, -1.35).addScaledVector(perp, 0.78);
    // At the speaker's eye line (nudged towards a taller listener's, so the
    // shoulder still frames): never looking down on a shorter speaker.
    from.y = speaker.y + 0.03 + Math.max(-0.1, Math.min(0.1, listener.y - speaker.y)) * 0.4 - low;
    return this.finish(from, at, 32, new Vector3(0, 0, -0.025), true, perp, 0.85);
  }

  /** Medium close-up of the speaker from the listener's side of the room. */
  private single(speaker: Vector3, listener: Vector3, low = 0): ConvShot | null {
    const axis = this.axis(speaker, listener);
    const perp = this.perp(axis);
    // A medium close-up — head and chest, the head about a quarter of the
    // frame — never a face filling the screen.
    const dist = 2.15;
    const from = _from.copy(speaker).addScaledVector(axis, dist * 0.86).addScaledVector(perp, dist * 0.5);
    from.y = speaker.y + 0.02 - low;
    const at = _at.copy(speaker);
    at.y -= 0.1 + low * 0.25;
    return this.finish(from, at, 28, new Vector3(0, 0, -0.025), true, perp, 0.75);
  }

  /** Both characters in profile, framed from the camera side. */
  private two(a: Vector3, b: Vector3): ConvShot | null {
    const axis = this.axis(a, b);
    const perp = this.perp(axis);
    const d = _a.subVectors(a, b).setY(0).length();
    const mid = _at.addVectors(a, b).multiplyScalar(0.5);
    mid.y -= 0.12;
    const fov = 38;
    const dist = (d * 0.5 + 0.7) / Math.tan(((fov / 2) * Math.PI) / 180) + 0.3;
    const from = _from.copy(mid).addScaledVector(perp, dist);
    from.y += 0.15;
    return this.finish(from, mid, fov, new Vector3(0.025, 0, 0), false, perp, 0.6);
  }

  /** Everyone, from a little above. */
  private wide(group: Vector3[], force = false): ConvShot | null {
    const c = _at.set(0, 0, 0);
    for (const p of group) c.add(p);
    c.divideScalar(group.length);
    let r = 0.8;
    for (const p of group) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
    const fov = 42;
    const dist = (r + 0.9) / Math.tan(((fov / 2) * Math.PI) / 180);
    const from = _from.copy(c).addScaledVector(this.side, dist);
    from.y += 1.1 + r * 0.2;
    c.y -= 0.35;
    return this.finish(from, c, fov, new Vector3(0.04, 0, 0), false, this.side, force ? 0 : 0.5);
  }

  private axis(from: Vector3, to: Vector3): Vector3 {
    const a = new Vector3().subVectors(to, from).setY(0);
    if (a.lengthSq() < 1e-6) a.set(0, 0, 1);
    return a.normalize();
  }

  /** Perpendicular to the axis, on the camera side of the line of action. */
  private perp(axis: Vector3): Vector3 {
    const p = new Vector3(axis.z, 0, -axis.x);
    return p.dot(this.side) < 0 ? p.negate() : p;
  }

  /**
   * Keep the camera out of walls without ever shoving it into a face.
   * Tries the composed angle, then orbits round the subject (staying on
   * this side of the line) for a clear one; if it must come closer, it
   * widens the lens to hold the same framing. Returns null when no angle
   * keeps at least `minKeep` of the intended distance (the caller picks
   * other coverage).
   */
  private finish(from: Vector3, at: Vector3, fov: number, drift: Vector3, dof: boolean, perp: Vector3, minKeep: number): ConvShot | null {
    const target = at.clone();
    const base = _b.subVectors(from, target);
    const want = base.length();
    const horiz = Math.hypot(base.x, base.z);
    const baseYaw = Math.atan2(base.x, base.z);
    const lift = base.y;
    let best: { pos: Vector3; free: number } | null = null;
    for (const deg of [0, 14, -14, 28, -28, 42, -42]) {
      const yaw = baseYaw + (deg * Math.PI) / 180;
      const dir = _a.set(Math.sin(yaw) * horiz, lift, Math.cos(yaw) * horiz).normalize();
      // Stay on the camera side of the line of action (the 180° rule).
      if (deg !== 0 && dir.x * perp.x + dir.z * perp.z < 0.05) continue;
      const hit = this.physics.sphereCast(target, dir, 0.2, want, Masks.camera);
      const free = hit === null ? want : Math.max(0, hit - 0.15);
      if (!best || free > best.free + 0.05) best = { pos: target.clone().addScaledVector(dir, free), free };
      if (free >= want * 0.97) break;
    }
    if (!best) return null;
    const minDist = minKeep > 0 ? Math.max(0.9, want * minKeep) : 0;
    if (best.free < minDist) return null;
    // Closer than composed: widen the lens so the subject keeps its size.
    let f = fov;
    if (best.free < want * 0.97) {
      const half = Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) * (want / best.free));
      f = Math.min(62, (2 * half * 180) / Math.PI);
    }
    return shot(best.pos, target, f, drift, dof);
  }
}

/** A conversation shot, with the coverage it ended up as. */
export type ConvShot = CameraShot & { kind?: ShotKind };

function shot(pos: Vector3, at: Vector3, fov: number, drift: Vector3, dof: boolean): ConvShot {
  const s: ConvShot = { position: pos, lookAt: at, fov, drift, driftTime: 3 };
  if (dof) {
    s.focusDistance = pos.distanceTo(at);
    s.focusRange = 1.1;
  }
  return s;
}

const _a = new Vector3();
const _b = new Vector3();
const _at = new Vector3();
const _from = new Vector3();
