import { createLogger } from '../core/Log';
import type { GameContext, GameSystem } from '../game/GameContext';
import type { Area, AreaFactory } from './Area';
import { CharacterLighting } from '../characters/render/AnimeMaterial';

const log = createLogger('Scenes');

/** Lazily imported area modules → separate chunks, loaded on demand. */
export type AreaLoader = () => Promise<{ default: AreaFactory }>;

export interface TransitionOptions {
  /** Show the full loading screen (vs. a simple fade). */
  loadingScreen?: boolean;
  fadeSeconds?: number;
  fadeColor?: string;
  /** Called after the area is built and the player placed, before fade-in. */
  beforeReveal?: () => Promise<void> | void;
}

/**
 * Loads and unloads areas asynchronously with fade/loading transitions,
 * places the player at spawn points and applies the area atmosphere.
 */
export class SceneManager implements GameSystem {
  readonly name = 'scenes';
  private readonly registry = new Map<string, AreaLoader>();
  current: Area | null = null;
  private transitioning = false;

  constructor(private readonly game: GameContext) {}

  register(id: string, loader: AreaLoader): void {
    this.registry.set(id, loader);
  }

  get isTransitioning(): boolean {
    return this.transitioning;
  }

  knownAreas(): string[] {
    return Array.from(this.registry.keys());
  }

  async goto(areaId: string, spawnId = 'default', opts: TransitionOptions = {}): Promise<void> {
    if (this.transitioning) {
      log.warn(`Ignoring transition to ${areaId}: already transitioning`);
      return;
    }
    const loader = this.registry.get(areaId);
    if (!loader) throw new Error(`Unknown area "${areaId}"`);
    const g = this.game;
    this.transitioning = true;
    const prevMode = g.mode === 'loading' ? 'exploration' : g.mode;
    const fadeSeconds = opts.fadeSeconds ?? 0.6;
    try {
      g.player?.lock('transition');
      await g.ui.fade(1, fadeSeconds, opts.fadeColor);
      g.setMode('loading');

      // Same-area respawn: just move the player.
      if (this.current?.id === areaId) {
        this.placePlayer(spawnId);
      } else {
        g.events.emit('area:loadStarted', { areaId });
        const mod = await loader();
        const area = mod.default(g);
        if (opts.loadingScreen) g.ui.showLoading(area.displayName, area.subtitle);

        if (this.current) {
          const old = this.current;
          this.current = null;
          old.dispose();
          g.events.emit('area:unloaded', { areaId: old.id });
        }

        await area.build((p) => {
          g.ui.setLoadingProgress(p);
          g.events.emit('area:loadProgress', { areaId, progress: p });
        });
        g.render.scene.add(area.root);
        this.current = area;
        this.applyAtmosphere(area, 0);
        // Compile shaders before revealing to avoid first-frame hitches.
        g.render.renderer.compile(g.render.scene, g.render.camera);
        g.events.emit('area:loaded', { areaId });
        this.placePlayer(spawnId);
        area.onEnter?.(spawnId);
        if (opts.loadingScreen) {
          g.ui.setLoadingProgress(1);
          await delay(350);
          g.ui.hideLoading();
        }
      }

      await opts.beforeReveal?.();
      g.events.emit('area:entered', { areaId, spawnId });
      g.setMode(prevMode === 'boot' || prevMode === 'title' ? 'exploration' : prevMode);
      await g.ui.fade(0, fadeSeconds * 1.3);
    } finally {
      g.player?.unlock('transition');
      this.transitioning = false;
    }
  }

  placePlayer(spawnId: string): void {
    const area = this.current;
    const player = this.game.player;
    if (!area || !player) return;
    const spawn = area.spawns.get(spawnId) ?? area.spawns.get('default');
    if (!spawn) {
      log.warn(`Area ${area.id} has no spawn "${spawnId}"`);
      return;
    }
    player.placeAt(spawn.position, spawn.yaw);
    this.game.camera.follow.snapBehind(player.followTarget);
    this.game.camera.release(0);
  }

  applyAtmosphere(area: Area, seconds: number): void {
    const a = area.atmosphere();
    const r = this.game.render;
    r.scene.background = a.background;
    r.scene.environment = a.environment;
    r.scene.environmentIntensity = a.environmentIntensity;
    r.scene.fog = null;
    r.fog.apply({ density: 0, skyHaze: 0, maxOpacity: 1, glowPower: 8, heightFalloff: 0.05, baseHeight: 0, ...a.fog });
    r.setGrade(a.grade, seconds);
    r.exposureTarget = a.exposure;
    if (this.game.player && a.tension !== undefined) this.game.player.tension = a.tension;
    if (a.keyLight) CharacterLighting.keyLightDir.copy(a.keyLight).normalize();
    if (a.rim) {
      CharacterLighting.rimColor.value.copy(a.rim.color);
      CharacterLighting.rimStrength.value = a.rim.strength;
    }
    if (a.music) this.game.events.emit('audio:musicState', { state: a.music });
  }

  update(dt: number): void {
    this.current?.update?.(dt);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
