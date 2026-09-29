import { Color, Vector3, type Object3D } from 'three';
import type { DamageType } from '../combat/Damage';
import { ParticleEmitter, ParticlePresets } from './ParticleEmitter';
import type { VfxSystem } from './VfxSystem';

const COLORS: Record<DamageType | 'block' | 'heal', Color> = {
  physical: new Color(1, 0.78, 0.45),
  ice: new Color(0.6, 0.85, 1.0),
  fire: new Color(1, 0.5, 0.2),
  wind: new Color(0.7, 1, 0.85),
  yin: new Color(0.75, 0.45, 1.0),
  yang: new Color(1, 0.95, 0.7),
  light: new Color(1, 1, 1),
  miasma: new Color(0.55, 0.25, 0.7),
  block: new Color(0.8, 0.9, 1),
  heal: new Color(0.55, 1, 0.6),
};

/**
 * Pooled one-shot impact bursts, one emitter per colour, living in the
 * persistent scope (combat happens in every area).
 */
export class Impacts {
  private readonly emitters = new Map<string, ParticleEmitter>();

  constructor(
    private readonly vfx: VfxSystem,
    private readonly parent: Object3D,
  ) {}

  burst(kind: DamageType | 'block' | 'heal', at: Vector3, count = 18): void {
    let e = this.emitters.get(kind);
    if (!e) {
      const color = COLORS[kind];
      const cfg = { ...ParticlePresets.sparks(color), maxParticles: 160 };
      if (kind === 'heal') Object.assign(cfg, { gravity: new Vector3(0, 1.5, 0), velocityMin: new Vector3(-0.6, 0.4, -0.6), velocityMax: new Vector3(0.6, 1.6, 0.6), streak: 0 });
      if (kind === 'ice' || kind === 'yin') Object.assign(cfg, { streak: 0.2, size: [0.03, 0.07] as [number, number] });
      e = new ParticleEmitter(cfg);
      this.parent.add(e);
      this.vfx.addEmitter(e, 'persistent');
      this.emitters.set(kind, e);
    }
    e.anchor.copy(at);
    e.burst(count);
  }
}
