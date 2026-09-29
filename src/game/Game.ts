import { Vector3 } from 'three';
import { EventBus } from '../core/events/EventBus';
import type { GameEvents, GameMode } from '../core/events/GameEvents';
import { Time } from '../core/Time';
import { Scheduler } from '../core/Scheduler';
import { World } from '../core/ecs/World';
import { createLogger } from '../core/Log';
import { SettingsManager } from '../settings/SettingsManager';
import { InputManager } from '../input/InputManager';
import type { InputContext } from '../input/Actions';
import { Physics } from '../physics/Physics';
import { RenderPipeline } from '../render/RenderPipeline';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { CameraDirector } from '../camera/CameraDirector';
import { SceneManager } from '../scene/SceneManager';
import { InteractionManager } from '../interaction/InteractionManager';
import { UIManager } from '../ui/UIManager';
import { WorldStateManager } from '../world/WorldStateManager';
import { AssetManager } from '../assets/AssetManager';
import { EnvironmentLibrary } from '../scene/EnvironmentLibrary';
import { VfxSystem } from '../vfx/VfxSystem';
import { CharacterMotor } from '../characters/CharacterMotor';
import type { PlayerController } from '../player/PlayerController';
import type { GameContext, GameSystem } from './GameContext';
import { DevConsole } from '../debug/DevConsole';
import { registerCoreDevCommands } from '../debug/coreCommands';

const log = createLogger('Game');

const MODE_CONTEXTS: Record<GameMode, InputContext[]> = {
  boot: [],
  title: ['ui'],
  exploration: ['gameplay'],
  combat: ['gameplay', 'combat'],
  dialogue: ['dialogue'],
  cinematic: ['cinematic'],
  menu: ['ui'],
  loading: [],
  death: [],
};

/**
 * Composition root and main loop. Creates every manager, wires them
 * together and drives the frame:
 *
 *   input → fixed steps (entities + physics) → update → systems →
 *   late update → camera → UI → render
 */
export class Game implements GameContext {
  readonly events = new EventBus<GameEvents>();
  readonly time = new Time();
  readonly scheduler = new Scheduler();
  readonly settings: SettingsManager;
  readonly input: InputManager;
  readonly physics: Physics;
  readonly render: RenderPipeline;
  readonly world: World;
  readonly camera: CameraDirector;
  readonly scenes: SceneManager;
  readonly interaction: InteractionManager;
  readonly ui: UIManager;
  readonly state: WorldStateManager;
  readonly assets: AssetManager;
  readonly environment: EnvironmentLibrary;
  readonly vfx: VfxSystem;
  readonly devMode: boolean;
  dev: DevConsole | null = null;
  player: PlayerController | null = null;

  private _mode: GameMode = 'boot';
  private readonly systems: GameSystem[] = [];
  private accumulator = 0;
  private lastFrame = 0;
  private running = false;
  private rafId = 0;
  private fpsTimer = 0;
  private modeBeforePause: GameMode | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.devMode = import.meta.env.DEV || params.has('dev');

    this.settings = new SettingsManager(this.events);
    this.input = new InputManager(canvas);
    this.applyInputSettings();
    this.physics = new Physics(-9.81);
    this.render = new RenderPipeline(canvas, this.settings.graphics);
    this.world = new World(this.render.scene);
    this.assets = new AssetManager();
    this.assets.maxAnisotropy = this.render.maxAnisotropy;
    this.environment = new EnvironmentLibrary(this.render.maxAnisotropy);
    this.state = new WorldStateManager(this.events);
    this.ui = new UIManager(this.events, this.input, this.scheduler);

    const follow = new ThirdPersonCamera(this.physics);
    follow.baseFov = this.settings.graphics.fieldOfView;
    this.camera = new CameraDirector(this.render.camera, follow);
    this.camera.shake.scale = this.settings.gameplay.cameraShake;
    this.camera.onDepthOfField = (on, d, r) => this.render.setDepthOfField(on, d, r);

    this.scenes = new SceneManager(this);
    this.interaction = new InteractionManager(this);
    this.addSystem(this.scenes);
    this.addSystem(this.interaction);
    this.vfx = new VfxSystem(this);

    this.events.on('settings:changed', ({ key }) => {
      if (key.startsWith('graphics') || key === '*') {
        this.render.applySettings(this.settings.graphics);
        this.camera.follow.baseFov = this.settings.graphics.fieldOfView;
        this.assets.maxAnisotropy = this.render.maxAnisotropy;
        this.environment.materials.setAnisotropy(this.render.maxAnisotropy);
      }
      if (key.startsWith('gameplay') || key.startsWith('bindings') || key === '*') this.applyInputSettings();
    });

    window.addEventListener('resize', () => this.render.onResize());
    document.addEventListener('visibilitychange', () => {
      // Don't let a hidden tab accumulate a giant physics backlog.
      if (document.hidden) this.accumulator = 0;
    });

    if (this.devMode) {
      this.dev = new DevConsole(this);
      registerCoreDevCommands(this.dev, this);
    }
  }

  private applyInputSettings(): void {
    const gp = this.settings.gameplay;
    this.input.mouseSensitivity = gp.cameraSensitivity;
    this.input.invertY = gp.invertY;
    this.input.applyBindingOverrides(this.settings.bindings);
    if (this.camera) this.camera.shake.scale = gp.cameraShake;
  }

  // ---------------------------------------------------------------- mode
  get mode(): GameMode {
    return this._mode;
  }

  setMode(mode: GameMode): void {
    if (mode === this._mode) return;
    const from = this._mode;
    this._mode = mode;
    this.input.setContexts(MODE_CONTEXTS[mode]);
    this.input.setPointerLockWanted(mode === 'exploration' || mode === 'combat');
    this.events.emit('game:modeChanged', { from, to: mode });
  }

  setPaused(paused: boolean, reason = 'menu'): void {
    if (paused) {
      if (this.modeBeforePause !== null) return;
      this.modeBeforePause = this._mode;
      this.time.setBaseScale(0);
      this.setMode('menu');
    } else {
      if (this.modeBeforePause === null) return;
      this.time.setBaseScale(1);
      this.setMode(this.modeBeforePause);
      this.modeBeforePause = null;
    }
    this.events.emit('game:paused', { paused, reason });
  }

  get paused(): boolean {
    return this.modeBeforePause !== null;
  }

  addSystem(system: GameSystem): void {
    this.systems.push(system);
  }

  getSystem<T extends GameSystem>(name: string): T | undefined {
    return this.systems.find((s) => s.name === name) as T | undefined;
  }

  // ---------------------------------------------------------------- loop
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      try {
        this.frame(dt);
      } catch (err) {
        log.error('Frame error', err);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Advance the simulation deterministically (automated tests, headless
   * capture). Runs 60 Hz frames without rendering, then renders once.
   */
  advance(seconds: number, renderLast = true): void {
    const steps = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < steps; i++) this.frame(1 / 60, renderLast && i === steps - 1);
  }

  /**
   * Like `advance`, but yields to the event loop between frames so awaited
   * gameplay sequences (interactions, dialogue, cinematics) progress.
   */
  async advanceAsync(seconds: number, renderLast = true): Promise<void> {
    const steps = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < steps; i++) {
      this.frame(1 / 60, renderLast && i === steps - 1);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  /** One frame. Public so automated tests can step the game deterministically. */
  frame(realDt: number, render = true): void {
    const t = this.time;
    t.advance(realDt);
    this.input.beginFrame(t.unscaledElapsed, t.unscaledDt);
    this.handleGlobalInput();

    // Fixed-rate simulation
    this.accumulator += t.dt;
    let steps = 0;
    while (this.accumulator >= t.fixedDt && steps < 5) {
      this.world.fixedUpdate(t.fixedDt);
      for (const s of this.systems) s.fixedUpdate?.(t.fixedDt);
      this.physics.step(t.fixedDt);
      this.accumulator -= t.fixedDt;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;
    t.fixedAlpha = this.accumulator / t.fixedDt;
    CharacterMotor.alpha = t.fixedAlpha;

    this.world.update(t.dt);
    this.scheduler.update(t.dt, t.unscaledDt);
    for (const s of this.systems) s.update?.(t.dt);
    this.ui.update(t.unscaledDt);
    this.world.lateUpdate(t.dt);
    for (const s of this.systems) s.lateUpdate?.(t.dt);

    const player = this.player;
    this.camera.update(t.dt, t.unscaledDt, player ? player.followTarget : null, this.input.look);
    // Effects update after the camera so billboards face this frame's view.
    this.vfx.update(t.dt);
    this.ui.updatePrompt(
      this.interaction.focused,
      this.render.camera,
      this.interaction.holdFraction,
      this.interaction.focused ? this.interaction.focused.lockedMessage(this) : null,
    );
    this.physics.updateDebug();
    if (render) this.render.render(t.unscaledDt);
    this.updateFps(t.unscaledDt);
    this.input.endFrame();
  }

  private handleGlobalInput(): void {
    if (this.input.pressed('debugConsole') && this.dev) {
      this.input.consume('debugConsole');
      this.dev.toggle();
    }
  }

  private updateFps(dt: number): void {
    if (!this.settings.graphics.showFps) {
      this.ui.setFpsText(null);
      return;
    }
    this.fpsTimer -= dt;
    if (this.fpsTimer > 0) return;
    this.fpsTimer = 0.5;
    const s = this.render.stats();
    const p = this.player?.entity.object3D.position ?? new Vector3();
    this.ui.setFpsText(
      `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms  ${s.drawCalls} calls  ${(s.triangles / 1000).toFixed(0)}k tris\n` +
        `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  mode ${this._mode}`,
    );
  }
}
