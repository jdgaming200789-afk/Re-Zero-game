import { Vector3, type Mesh, type Object3D } from 'three';
import type { DamageInfo, Faction } from './Damage';
import type { Health } from './Health';

export interface ProjectileOptions {
  mesh: Mesh;
  from: Vector3;
  /** Initial direction (normalised). */
  direction: Vector3;
  speed: number;
  /** Turn rate towards the target (rad/s); 0 = straight. */
  homing?: number;
  target?: Health | null;
  radius: number;
  maxDistance: number;
  faction: Faction;
  damage: Omit<DamageInfo, 'point' | 'direction'>;
  /** Spin around the travel axis (rad/s) for crescents / crystals. */
  spin?: number;
  /** Called after the hit is applied (area splash, status). */
  onImpact?: (at: Vector3, hit: Health | null) => void;
}

/** A travelling hit (ice spear, Minya crystal, wind blade). */
export class Projectile {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  travelled = 0;
  alive = true;
  private roll = 0;

  constructor(
    readonly opts: ProjectileOptions,
    parent: Object3D,
  ) {
    this.position.copy(opts.from);
    this.velocity.copy(opts.direction).normalize().multiplyScalar(opts.speed);
    opts.mesh.position.copy(this.position);
    parent.add(opts.mesh);
    this.orient();
  }

  step(dt: number): void {
    const o = this.opts;
    if (o.homing && o.target?.alive) {
      const want = o.target.center(_t).sub(this.position).normalize().multiplyScalar(o.speed);
      const k = Math.min(1, o.homing * dt);
      this.velocity.lerp(want, k).setLength(o.speed);
    }
    this.position.addScaledVector(this.velocity, dt);
    this.travelled += o.speed * dt;
    this.roll += (o.spin ?? 0) * dt;
    o.mesh.position.copy(this.position);
    this.orient();
  }

  private orient(): void {
    const m = this.opts.mesh;
    _t.copy(this.position).add(this.velocity);
    m.lookAt(_t);
    m.rotateZ(this.roll);
  }

  dispose(): void {
    const m = this.opts.mesh;
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as { dispose(): void }).dispose();
  }
}

const _t = new Vector3();
