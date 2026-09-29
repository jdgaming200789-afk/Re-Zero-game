import type { EventBus } from '../core/events/EventBus';
import type { GameEvents, GameMode } from '../core/events/GameEvents';
import type { Time } from '../core/Time';
import type { World } from '../core/ecs/World';
import type { SettingsManager } from '../settings/SettingsManager';
import type { InputManager } from '../input/InputManager';
import type { Physics } from '../physics/Physics';
import type { RenderPipeline } from '../render/RenderPipeline';
import type { CameraDirector } from '../camera/CameraDirector';
import type { SceneManager } from '../scene/SceneManager';
import type { InteractionManager } from '../interaction/InteractionManager';
import type { UIManager } from '../ui/UIManager';
import type { PlayerController } from '../player/PlayerController';
import type { WorldStateManager } from '../world/WorldStateManager';
import type { AssetManager } from '../assets/AssetManager';
import type { Scheduler } from '../core/Scheduler';

/**
 * The composition root's public surface. Systems receive this instead of
 * reaching for globals, which keeps dependencies explicit and lets tests
 * substitute pieces.
 */
export interface GameContext {
  readonly events: EventBus<GameEvents>;
  readonly time: Time;
  readonly world: World;
  readonly settings: SettingsManager;
  readonly input: InputManager;
  readonly physics: Physics;
  readonly render: RenderPipeline;
  readonly camera: CameraDirector;
  readonly scenes: SceneManager;
  readonly interaction: InteractionManager;
  readonly ui: UIManager;
  readonly state: WorldStateManager;
  readonly assets: AssetManager;
  readonly scheduler: Scheduler;

  readonly mode: GameMode;
  setMode(mode: GameMode): void;
  player: PlayerController | null;

  /** True when developer tools are enabled (dev server or ?dev=1). */
  readonly devMode: boolean;
}

/** A frame-updated service (non-entity system). */
export interface GameSystem {
  readonly name: string;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  lateUpdate?(dt: number): void;
}
