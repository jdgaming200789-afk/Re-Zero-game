import type { Camera } from 'three';
import type { GameContext, GameSystem } from '../game/GameContext';
import { PARTICLE_DENSITY } from '../settings/Settings';
import { ParticleEmitter } from './ParticleEmitter';

export interface VfxUpdatable {
  scope: string;
  update(dt: number, camera: Camera): void;
  dispose(): void;
}

/**
 * Updates every live effect once per frame and owns their lifetime by
 * scope (areas clear their scope on unload). Applies the effects-quality
 * setting to particle density.
 */
export class VfxSystem implements GameSystem {
  readonly name = 'vfx';
  private readonly items = new Set<VfxUpdatable>();
  private readonly emitters = new Set<ParticleEmitter>();

  constructor(private readonly game: GameContext) {
    game.events.on('settings:changed', () => this.applyQuality());
  }

  add<T extends VfxUpdatable>(item: T, scope: string): T {
    item.scope = scope;
    this.items.add(item);
    return item;
  }

  /** Register a standalone particle emitter (not owned by a Fire etc.). */
  addEmitter(e: ParticleEmitter, scope: string): ParticleEmitter {
    e.scope = scope;
    e.densityScale = PARTICLE_DENSITY[this.game.settings.graphics.effectsQuality];
    this.emitters.add(e);
    return e;
  }

  clearScope(scope: string): void {
    for (const i of Array.from(this.items)) {
      if (i.scope !== scope) continue;
      i.dispose();
      this.items.delete(i);
    }
    for (const e of Array.from(this.emitters)) {
      if (e.scope !== scope) continue;
      e.removeFromParent();
      e.dispose();
      this.emitters.delete(e);
    }
  }

  private applyQuality(): void {
    const d = PARTICLE_DENSITY[this.game.settings.graphics.effectsQuality];
    for (const e of this.emitters) e.densityScale = d;
  }

  update(dt: number): void {
    const cam = this.game.render.camera;
    const h = this.game.render.viewport.y || window.innerHeight;
    for (const i of this.items) i.update(dt, cam);
    for (const e of this.emitters) {
      e.setViewportScale(h, cam.fov);
      e.update(dt, cam.position);
    }
  }

  get stats(): { items: number; emitters: number; particles: number } {
    let particles = 0;
    for (const e of this.emitters) particles += e.aliveCount;
    return { items: this.items.size, emitters: this.emitters.size, particles };
  }
}
