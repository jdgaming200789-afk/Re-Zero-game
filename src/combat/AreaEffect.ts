import { AdditiveBlending, Color, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Object3D } from 'three';
import { ParticleEmitter, type ParticleConfig } from '../vfx/ParticleEmitter';
import type { VfxSystem } from '../vfx/VfxSystem';
import type { Health } from './Health';

export interface AreaEffectOptions {
  id: string;
  center: Vector3;
  radius: number;
  duration: number;
  /** Seconds between ticks on bodies inside (0 = only on enter). */
  interval?: number;
  /** Which bodies are affected. */
  filter: (h: Health) => boolean;
  onTick: (h: Health) => void;
  particles?: Partial<ParticleConfig>;
  ringColor?: Color;
}

/**
 * A lingering zone (Shamak's darkness, an ice field): a telegraph ring on
 * the ground, optional particles, and periodic effects on bodies inside.
 */
export class AreaEffect {
  private t = 0;
  private tickTimer = 0;
  private readonly ring: Mesh | null;
  private readonly emitter: ParticleEmitter | null;
  private readonly inside = new Set<Health>();

  constructor(
    readonly opts: AreaEffectOptions,
    parent: Object3D,
    private readonly vfx: VfxSystem,
  ) {
    if (opts.ringColor) {
      const mat = new MeshBasicMaterial({ color: opts.ringColor, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      this.ring = new Mesh(new RingGeometry(opts.radius * 0.92, opts.radius, 48), mat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.copy(opts.center).setY(opts.center.y + 0.04);
      parent.add(this.ring);
    } else this.ring = null;
    if (opts.particles) {
      this.emitter = new ParticleEmitter({ ...opts.particles, shape: { type: 'disc', radius: opts.radius * 0.85 } });
      this.emitter.anchor.copy(opts.center);
      parent.add(this.emitter);
      vfx.addEmitter(this.emitter, 'persistent');
    } else this.emitter = null;
  }

  /** Returns false once finished (then dispose). */
  update(dt: number, bodies: Iterable<Health>): boolean {
    this.t += dt;
    const o = this.opts;
    const life = this.t / o.duration;
    if (this.ring) {
      const m = this.ring.material as MeshBasicMaterial;
      m.opacity = Math.min(1, this.t * 4) * Math.min(1, (1 - life) * 3) * 0.6;
    }
    if (this.emitter) this.emitter.config.rate = life < 0.8 ? (o.particles?.rate ?? 30) : 0;
    this.tickTimer -= dt;
    const tickNow = this.tickTimer <= 0;
    if (tickNow) this.tickTimer = o.interval ?? 1e9;
    for (const h of bodies) {
      if (!h.alive || !o.filter(h)) continue;
      const p = h.entity.object3D.position;
      const inside = Math.hypot(p.x - o.center.x, p.z - o.center.z) <= o.radius + h.radius && Math.abs(p.y - o.center.y) < 3;
      if (inside && (!this.inside.has(h) || tickNow)) o.onTick(h);
      if (inside) this.inside.add(h);
      else this.inside.delete(h);
    }
    return this.t < o.duration + 1.5; // let particles fade out
  }

  dispose(): void {
    if (this.ring) {
      this.ring.removeFromParent();
      this.ring.geometry.dispose();
      (this.ring.material as MeshBasicMaterial).dispose();
    }
    if (this.emitter) this.vfx.removeEmitter(this.emitter);
  }
}
