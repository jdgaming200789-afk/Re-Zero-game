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

  compose(kind: ShotKind, speaker: Vector3, listener: Vector3 | null, group: Vector3[]): CameraShot {
    if (kind === 'wide' || !listener) return this.wide(group.length ? group : [speaker]);
    const d = _a.subVectors(speaker, listener).setY(0).length();
    if (kind === 'ots' && d > 5) kind = 'single';
    return kind === 'ots' ? this.ots(speaker, listener) : kind === 'single' ? this.single(speaker, listener) : this.two(speaker, listener);
  }

  /** Behind the listener's shoulder, looking at the speaker. */
  private ots(speaker: Vector3, listener: Vector3): CameraShot {
    const axis = this.axis(listener, speaker);
    const perp = this.perp(axis);
    // Aim a little to the listener's side so the speaker sits on the far third
    // and the listener's shoulder frames the near edge.
    const at = _at.copy(speaker).addScaledVector(perp, 0.18);
    at.y -= 0.07;
    const from = _from.copy(listener).addScaledVector(axis, -1.35).addScaledVector(perp, 0.78);
    from.y = Math.max(listener.y, speaker.y) + 0.04;
    return this.finish(from, at, 32, new Vector3(0, 0, -0.03), true, perp);
  }

  /** Medium close-up of the speaker from the listener's side of the room. */
  private single(speaker: Vector3, listener: Vector3): CameraShot {
    const axis = this.axis(speaker, listener);
    const perp = this.perp(axis);
    const dist = 1.75;
    const from = _from.copy(speaker).addScaledVector(axis, dist * 0.86).addScaledVector(perp, dist * 0.5);
    from.y = speaker.y + 0.02;
    const at = _at.copy(speaker);
    at.y -= 0.06;
    return this.finish(from, at, 27, new Vector3(0, 0, -0.035), true, perp);
  }

  /** Both characters in profile, framed from the camera side. */
  private two(a: Vector3, b: Vector3): CameraShot {
    const axis = this.axis(a, b);
    const perp = this.perp(axis);
    const d = _a.subVectors(a, b).setY(0).length();
    const mid = _at.addVectors(a, b).multiplyScalar(0.5);
    mid.y -= 0.12;
    const fov = 38;
    const dist = (d * 0.5 + 0.7) / Math.tan(((fov / 2) * Math.PI) / 180) + 0.3;
    const from = _from.copy(mid).addScaledVector(perp, dist);
    from.y += 0.15;
    return this.finish(from, mid, fov, new Vector3(0.03, 0, 0), false, perp);
  }

  /** Everyone, from a little above. */
  private wide(group: Vector3[]): CameraShot {
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
    return this.finish(from, c, fov, new Vector3(0.05, 0, 0), false, this.side);
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

  /** Keep the camera out of walls: slide it in towards the subject, or swing it round. */
  private finish(from: Vector3, at: Vector3, fov: number, drift: Vector3, dof: boolean, perp: Vector3): CameraShot {
    const pos = from.clone();
    const target = at.clone();
    const dir = _a.subVectors(pos, target);
    const want = dir.length();
    dir.divideScalar(want);
    const hit = this.physics.sphereCast(target, dir, 0.18, want, Masks.camera);
    if (hit !== null && hit < want) {
      if (hit < want * 0.5) {
        // Too cramped on this side: mirror the offset across the subject.
        const mirrored = _b.subVectors(from, at);
        const lateral = perp.dot(mirrored);
        mirrored.addScaledVector(perp, -2 * lateral);
        const mdir = mirrored.clone().normalize();
        const mhit = this.physics.sphereCast(target, mdir, 0.18, want, Masks.camera);
        if (mhit === null || mhit > hit) {
          pos.copy(target).addScaledVector(mdir, Math.max(0.35, (mhit ?? want) - 0.12));
          return shot(pos, target, fov, drift, dof);
        }
      }
      pos.copy(target).addScaledVector(dir, Math.max(0.35, hit - 0.12));
    }
    return shot(pos, target, fov, drift, dof);
  }
}

function shot(pos: Vector3, at: Vector3, fov: number, drift: Vector3, dof: boolean): CameraShot {
  const s: CameraShot = { position: pos, lookAt: at, fov, drift };
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
