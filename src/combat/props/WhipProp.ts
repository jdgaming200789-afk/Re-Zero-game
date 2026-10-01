import { BufferAttribute, BufferGeometry, Color, Mesh, TorusGeometry, Vector3, type Object3D } from 'three';
import { createAnimeMaterial } from '../../characters/render/AnimeMaterial';
import type { CharacterVisual } from '../../characters/CharacterVisual';
import { Easing } from '../../core/math/MathUtil';

const N = 26; // points along the lash
const SIDES = 6;

interface Crack {
  target: Vector3;
  t: number;
  /** Seconds from start to the snap at the target. */
  contact: number;
  duration: number;
  /** Lateral swing side (+1 over the right shoulder, -1 backhand). */
  side: number;
}

/**
 * Subaru's whip. Coiled at his hip until used; a crack unrolls the lash
 * from the hand along a travelling arc so the tip snaps onto the target
 * exactly at the clip's contact beat, then recoils with slack.
 */
export class WhipProp {
  readonly mesh: Mesh;
  readonly coil: Mesh;
  private readonly geo: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly pts = Array.from({ length: N }, () => new Vector3());
  private crack: Crack | null = null;
  readonly tip = new Vector3();
  length = 3.4;

  constructor(
    private visual: CharacterVisual,
    parent: Object3D,
  ) {
    this.geo = new BufferGeometry();
    this.positions = new Float32Array(N * SIDES * 3);
    this.geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = i * SIDES + k;
        const b = i * SIDES + ((k + 1) % SIDES);
        const c = (i + 1) * SIDES + ((k + 1) % SIDES);
        const d = (i + 1) * SIDES + k;
        idx.push(a, b, c, a, c, d);
      }
    }
    this.geo.setIndex(idx);
    const mat = createAnimeMaterial({ color: new Color(0x3b2a1e), role: 'cloth' });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.coil = new Mesh(new TorusGeometry(0.075, 0.016, 6, 16), mat);
    this.coil.castShadow = true;
    parent.add(this.coil);
  }

  /** Follow a new model (the player changed costume). */
  setVisual(v: CharacterVisual): void {
    this.visual = v;
  }

  get active(): boolean {
    return this.crack !== null;
  }

  /** Start a crack whose tip reaches `target` after `contact` seconds. */
  strike(target: Vector3, contact: number, duration: number, side = 1): void {
    this.crack = { target: target.clone(), t: 0, contact, duration, side };
    this.mesh.visible = true;
    this.coil.visible = false;
  }

  cancel(): void {
    this.crack = null;
    this.mesh.visible = false;
    this.coil.visible = true;
  }

  update(dt: number): void {
    const hand = this.visual.socketPosition('handR', _hand);
    // Coil rides on the right hip.
    const hips = this.visual.socketPosition('hips', _hips);
    const right = this.visual.root.getWorldDirection(_fwd).cross(_up).normalize().multiplyScalar(-1);
    this.coil.position.copy(hips).addScaledVector(right, 0.17).add(_down);
    this.coil.lookAt(this.coil.position.clone().add(right));
    const c = this.crack;
    if (!c) return;
    c.t += dt;
    if (c.t >= c.duration) {
      this.cancel();
      return;
    }
    const fwd = this.visual.root.getWorldDirection(_fwd);
    const toTarget = _v.subVectors(c.target, hand);
    const dist = Math.min(toTarget.length(), this.length);
    toTarget.normalize();
    // Tip path: behind/above the shoulder → out to the target → slack recoil.
    let reach: number;
    let lift: number;
    let back = 0;
    if (c.t < c.contact) {
      const u = c.t / c.contact;
      const wind = Math.min(1, u / 0.55);
      back = 1 - Easing.inCubic(Math.max(0, (u - 0.55) / 0.45));
      reach = Easing.inQuad(Math.max(0, (u - 0.45) / 0.55)) * dist;
      lift = 0.9 * wind * back;
    } else {
      const u = (c.t - c.contact) / (c.duration - c.contact);
      reach = dist * (1 - Easing.outCubic(u) * 0.85);
      lift = -0.45 * Math.sin(Math.PI * Math.min(1, u * 1.3));
    }
    const side = _side.copy(fwd).cross(_up).normalize().multiplyScalar(c.side);
    // Control points of a quadratic curve from the hand to the tip.
    const tip = _tip.copy(hand).addScaledVector(toTarget, reach);
    tip.addScaledVector(fwd, -1.4 * back).addScaledVector(side, 0.5 * back).y += lift + back * 0.6;
    const mid = _mid.copy(hand).lerp(tip, 0.5);
    mid.y += 0.35 * (1 - reach / Math.max(dist, 0.01)) + 0.15;
    mid.addScaledVector(side, 0.25 * back);
    // Unused rope hangs from the tip in a short sag.
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = this.pts[i]!;
      const a = 1 - t;
      p.set(0, 0, 0).addScaledVector(hand, a * a).addScaledVector(mid, 2 * a * t).addScaledVector(tip, t * t);
      const slack = Math.max(0, this.length - hand.distanceTo(tip) - 0.4);
      p.y -= Math.sin(Math.PI * t) * slack * 0.12;
    }
    this.tip.copy(this.pts[N - 1]!);
    this.rebuild();
  }

  private rebuild(): void {
    const pos = this.positions;
    for (let i = 0; i < N; i++) {
      const p = this.pts[i]!;
      const next = this.pts[Math.min(i + 1, N - 1)]!;
      const prev = this.pts[Math.max(i - 1, 0)]!;
      const tan = _t.subVectors(next, prev).normalize();
      const ref = Math.abs(tan.y) < 0.9 ? _up : _x;
      const a = _a.crossVectors(tan, ref).normalize();
      const b = _b.crossVectors(tan, a).normalize();
      const r = 0.013 * (1 - (i / (N - 1)) * 0.7);
      for (let k = 0; k < SIDES; k++) {
        const ang = (2 * Math.PI * k) / SIDES;
        const o = (i * SIDES + k) * 3;
        pos[o] = p.x + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * r;
        pos[o + 1] = p.y + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * r;
        pos[o + 2] = p.z + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * r;
      }
    }
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.coil.removeFromParent();
    this.geo.dispose();
    this.coil.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
  }
}

const _hand = new Vector3();
const _hips = new Vector3();
const _fwd = new Vector3();
const _up = new Vector3(0, 1, 0);
const _x = new Vector3(1, 0, 0);
const _down = new Vector3(0, -0.05, 0);
const _v = new Vector3();
const _side = new Vector3();
const _tip = new Vector3();
const _mid = new Vector3();
const _t = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
