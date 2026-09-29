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
import type { EnvironmentLibrary } from '../scene/EnvironmentLibrary';
import type { VfxSystem } from '../vfx/VfxSystem';
import type { CharacterFactory } from '../characters/CharacterFactory';
import type { ActorManager } from '../actors/ActorManager';
import type { PartyManager } from '../party/PartyManager';
import type { ChatterSystem } from '../party/Chatter';
import type { CombatManager } from '../combat/CombatManager';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { DialogueSystem } from '../story/dialogue/DialogueSystem';
import type { CinematicPlayer } from '../story/cinematic/CinematicPlayer';
import type { QuestSystem } from '../story/quests/QuestSystem';
import type { StoryDirector } from '../story/StoryDirector';
import type { ScreenManager } from '../ui/screens/Screen';

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
  readonly environment: EnvironmentLibrary;
  readonly vfx: VfxSystem;
  readonly characters: CharacterFactory;
  readonly actors: ActorManager;
  readonly party: PartyManager;
  readonly chatter: ChatterSystem;
  readonly combat: CombatManager;
  readonly enemies: EnemyManager;
  readonly dialogue: DialogueSystem;
  readonly cinematics: CinematicPlayer;
  readonly quests: QuestSystem;
  readonly story: StoryDirector;
  readonly screens: ScreenManager;

  readonly mode: GameMode;
  setMode(mode: GameMode): void;
  player: PlayerController | null;

  getSystem<T extends GameSystem>(name: string): T | undefined;

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
