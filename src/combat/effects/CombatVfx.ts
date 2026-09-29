import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { Easing } from '../../core/math/MathUtil';

/** A transient effect updated by the CombatManager; returns false when done. */
export interface TransientVfx {
  update(dt: number): boolean;
  dispose(): void;
}

const disposeMesh = (m: Mesh) => {
  m.removeFromParent();
  m.geometry.dispose();
  (m.material as MeshBasicMaterial).dispose();
};

/**
 * Sword/blade arc: a flat crescent swept around the attacker at chest
 * height, bright at the leading edge, fading out (Julius's cuts, Emilia's
 * ice blade; rainbow for Al Clauzeria).
 */
export class SlashArc implements TransientVfx {
  private readonly mesh: Mesh;
  private t = 0;

  constructor(
    parent: Object3D,
    at: Vector3,
    yaw: number,
    opts: { radius: number; arc: number; color?: Color; rainbow?: boolean; tilt?: number; duration?: number; reverse?: boolean },
    private readonly duration = opts.duration ?? 0.32,
  ) {
    const geo = new RingGeometry(opts.radius * 0.55, opts.radius, 40, 1, -opts.arc / 2, opts.arc);
    const colors = new Float32Array(geo.getAttribute('position').count * 4);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let a = Math.atan2(y, x) / opts.arc + 0.5; // 0..1 across the sweep
      if (opts.reverse) a = 1 - a;
      const r = Math.hypot(x, y) / opts.radius;
      const c = opts.rainbow ? new Color().setHSL(a * 0.85, 0.9, 0.62) : (opts.color ?? new Color(1, 1, 1));
      const alpha = Math.pow(a, 1.6) * Math.pow((r - 0.55) / 0.45, 0.7);
      colors.set([c.r * 1.8, c.g * 1.8, c.b * 1.8, alpha], i * 4);
    }
    geo.setAttribute('color', new BufferAttribute(colors, 4));
    const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.mesh = new Mesh(geo, mat);
    this.mesh.position.copy(at);
    this.mesh.rotation.set(-Math.PI / 2 + (opts.tilt ?? 0), 0, 0, 'YXZ');
    this.mesh.rotation.y = yaw;
    this.mesh.renderOrder = 11;
    parent.add(this.mesh);
  }

  update(dt: number): boolean {
    this.t += dt;
    const u = this.t / this.duration;
    const m = this.mesh.material as MeshBasicMaterial;
    m.opacity = 1 - Easing.inQuad(Math.min(1, u));
    this.mesh.scale.setScalar(0.85 + 0.25 * Easing.outCubic(Math.min(1, u)));
    return u < 1;
  }

  dispose(): void {
    disposeMesh(this.mesh);
  }
}

/** Ice spikes erupting from the ground in a circle (Emilia's ice field). */
export class IceEruption implements TransientVfx {
  private readonly group = new Group();
  private readonly spikes: Array<{ mesh: Mesh; delay: number; height: number }> = [];
  private t = 0;
  // Base at y = 0 so spikes grow up out of the ground.
  private static geo = new ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0);

  constructor(parent: Object3D, center: Vector3, radius: number, count = 14) {
    const mat = new MeshBasicMaterial({ color: new Color(0.62, 0.86, 1).multiplyScalar(1.4), transparent: true, opacity: 0.92 });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = radius * (0.25 + 0.75 * Math.sqrt(Math.random()));
      const m = new Mesh(IceEruption.geo, mat);
      m.position.set(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r);
      m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
      m.scale.set(1, 0.001, 1);
      this.group.add(m);
      this.spikes.push({ mesh: m, delay: (r / radius) * 0.12, height: 0.8 + Math.random() * 1.1 });
    }
    parent.add(this.group);
  }

  update(dt: number): boolean {
    this.t += dt;
    for (const s of this.spikes) {
      const u = Math.max(0, this.t - s.delay);
      const grow = Easing.outBack(Math.min(1, u / 0.14));
      const shrink = this.t > 1.6 ? Math.max(0, 1 - (this.t - 1.6) / 0.35) : 1;
      s.mesh.scale.set(shrink, Math.max(0.001, grow * s.height * shrink), shrink);
    }
    return this.t < 2;
  }

  dispose(): void {
    this.group.removeFromParent();
    (this.spikes[0]?.mesh.material as MeshBasicMaterial | undefined)?.dispose();
  }
}

/** Julius's six quasi-spirits (Ia, Kua, In, Ho, Nes, Aro) circling him in battle. */
export class SpiritOrbit {
  private readonly group = new Group();
  private readonly motes: Mesh[] = [];
  private t = Math.random() * 10;
  private strength = 0;
  target = 0;
  static readonly COLORS = [0xff6b6b, 0x6bc5ff, 0xfff16b, 0x7dff8a, 0xc77dff, 0xffffff];

  constructor(parent: Object3D) {
    const geo = new SphereGeometry(0.06, 10, 8);
    for (const c of SpiritOrbit.COLORS) {
      const m = new Mesh(geo, new MeshBasicMaterial({ color: new Color(c).multiplyScalar(2.2), transparent: true, blending: AdditiveBlending, depthWrite: false }));
      this.motes.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
    parent.add(this.group);
  }

  update(dt: number, center: Vector3): void {
    this.t += dt;
    this.strength += (this.target - this.strength) * Math.min(1, dt * 3);
    this.group.visible = this.strength > 0.02;
    if (!this.group.visible) return;
    this.group.position.copy(center);
    this.motes.forEach((m, i) => {
      const a = this.t * 1.6 + (i / this.motes.length) * Math.PI * 2;
      const r = 0.75 + 0.1 * Math.sin(this.t * 2 + i);
      m.position.set(Math.cos(a) * r, 0.25 * Math.sin(this.t * 1.3 + i * 1.7), Math.sin(a) * r);
      (m.material as MeshBasicMaterial).opacity = this.strength * (0.7 + 0.3 * Math.sin(this.t * 5 + i));
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.motes) (m.material as MeshBasicMaterial).dispose();
    this.motes[0]?.geometry.dispose();
  }
}

/** Visual templates for projectiles. */
export function projectileMesh(kind: 'iceSpear' | 'minya' | 'windBlade'): Mesh {
  if (kind === 'iceSpear') {
    const m = new Mesh(new OctahedronGeometry(0.12, 0), new MeshBasicMaterial({ color: new Color(0.65, 0.9, 1).multiplyScalar(1.8) }));
    m.scale.set(0.6, 0.6, 3.2);
    return m;
  }
  if (kind === 'minya') {
    const m = new Mesh(new OctahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: new Color(0.8, 0.45, 1).multiplyScalar(2) }));
    m.scale.set(0.8, 1.6, 0.8);
    return m;
  }
  const g = new RingGeometry(0.35, 0.55, 20, 1, -1.1, 2.2);
  const m = new Mesh(g, new MeshBasicMaterial({ color: new Color(0.75, 1, 0.85).multiplyScalar(1.6), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  return m;
}
