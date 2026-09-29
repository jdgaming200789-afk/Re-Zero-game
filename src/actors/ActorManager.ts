import { Vector3 } from 'three';
import { CharacterMotor } from '../characters/CharacterMotor';
import type { CharacterFactory } from '../characters/CharacterFactory';
import { createLogger } from '../core/Log';
import { actorDef } from '../data/actors';
import type { GameContext, GameSystem } from '../game/GameContext';
import { Layer } from '../physics/Physics';
import { ActorController, DEFAULT_ACTOR_MOVEMENT, type ActorMovement } from './ActorController';

const log = createLogger('Actors');

export interface SpawnActorOptions {
  position: Vector3;
  yaw?: number;
  /** Entity scope: an area id (destroyed with the area) or 'persistent'. */
  scope?: string;
  /** Collide with the world through a character motor (default true). */
  physics?: boolean;
  tags?: string[];
  movement?: Partial<ActorMovement>;
}

/**
 * Registry of every non-player character in the world, addressed by
 * character id ("emilia", "shaula") so dialogue, cinematics and quests can
 * find who they need without holding references.
 */
export class ActorManager implements GameSystem {
  readonly name = 'actors';
  private readonly actors = new Map<string, ActorController>();
  private readonly pending = new Map<string, Promise<ActorController>>();

  constructor(
    private readonly game: GameContext,
    private readonly factory: CharacterFactory,
  ) {
    game.events.on('area:unloaded', () => this.prune());
  }

  /** Spawn (or return the existing) actor for a character id. */
  spawn(id: string, opts: SpawnActorOptions): Promise<ActorController> {
    const existing = this.get(id);
    if (existing) {
      existing.placeAt(opts.position, opts.yaw ?? existing.yaw);
      return Promise.resolve(existing);
    }
    const inflight = this.pending.get(id);
    if (inflight) return inflight;
    const p = this.create(id, opts).finally(() => this.pending.delete(id));
    this.pending.set(id, p);
    return p;
  }

  private async create(id: string, opts: SpawnActorOptions): Promise<ActorController> {
    const def = actorDef(id);
    const visual = await this.factory.create(id);
    const scope = opts.scope ?? this.game.scenes.current?.scope ?? 'persistent';
    const entity = this.game.world.spawn(`actor:${id}`, scope, { tags: ['actor', 'character', ...(opts.tags ?? [])] });
    entity.object3D.position.copy(opts.position);
    let motor: CharacterMotor | null = null;
    if (opts.physics !== false) {
      const s = def.height / 1.7;
      motor = entity.add(
        new CharacterMotor(
          this.game.physics,
          {
            radius: def.radius ?? Math.max(0.2, 0.26 * s),
            height: def.height,
            stepHeight: 0.38 * Math.max(0.8, s),
            membership: Layer.Party,
            collidesWith: Layer.Environment | Layer.Prop | Layer.CharacterOnly,
          },
          { kind: 'character' },
        ),
      );
    }
    const movement = { ...DEFAULT_ACTOR_MOVEMENT, ...def.movement, ...opts.movement };
    const actor = entity.add(new ActorController(this.game, def, visual, motor, movement));
    actor.placeAt(opts.position, opts.yaw ?? 0);
    this.actors.set(id, actor);
    this.game.ui.registerSpeakerName(id, def.shortName, def.nameColor);
    log.info(`Spawned ${id} in ${scope}`);
    return actor;
  }

  get(id: string): ActorController | undefined {
    const a = this.actors.get(id);
    if (a && a.entity.destroyed) {
      this.actors.delete(id);
      return undefined;
    }
    return a;
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  despawn(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.actors.delete(id);
    a.entity.destroy();
  }

  all(): ActorController[] {
    this.prune();
    return Array.from(this.actors.values());
  }

  /** World position of a speaker's head, player included (dialogue framing). */
  headPosition(id: string, out: Vector3): Vector3 | null {
    const player = this.game.player;
    if (player && player.characterId === id) return player.visual.socketPosition('head', out);
    const a = this.get(id);
    return a ? a.visual.socketPosition('head', out) : null;
  }

  private prune(): void {
    for (const [id, a] of this.actors) if (a.entity.destroyed) this.actors.delete(id);
  }
}
