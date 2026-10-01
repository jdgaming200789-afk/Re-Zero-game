import { Vector3 } from 'three';
import { createLogger } from '../core/Log';
import type { Scheduler } from '../core/Scheduler';
import { characterDef } from '../data/characters';
import { isCreature } from '../data/actors';
import { creatureDef } from '../data/creatures';
import { CreatureVisual } from '../creatures/CreatureVisual';
import { Masks, type Physics } from '../physics/Physics';
import { AnimeCharacter } from './AnimeCharacter';
import type { CharacterVisual } from './CharacterVisual';
import { PlaceholderVisual } from './PlaceholderVisual';

const log = createLogger('Characters');

/**
 * Builds character visuals from their definitions. Every character gets the
 * same wiring (foot IK against the physics ground); a model that fails to
 * load degrades to the placeholder body instead of breaking the scene.
 */
export class CharacterFactory {
  constructor(
    private readonly physics: Physics,
    private readonly scheduler: Scheduler,
  ) {}

  async create(id: string, costume?: string): Promise<CharacterVisual> {
    try {
      const c = isCreature(id) ? await CreatureVisual.create(creatureDef(id), this.scheduler) : await AnimeCharacter.create(characterDef(id, costume), this.scheduler);
      const down = new Vector3(0, -1, 0);
      const from = new Vector3();
      c.groundQuery = (x, y, z) => {
        const hit = this.physics.raycast(from.set(x, y, z), down, 1.4, Masks.ground);
        return hit ? { y: hit.point.y, normal: hit.normal } : null;
      };
      c.occlusionQuery = (p, dir) => this.physics.raycast(p, dir, 60, Masks.lineOfSight) !== null;
      return c;
    } catch (err) {
      log.error(`Character "${id}" failed to load; using the placeholder body.`, err);
      return new PlaceholderVisual(this.scheduler);
    }
  }

  /** Warm the model cache so later spawns don't hitch. */
  async preload(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => (isCreature(id) ? CreatureVisual.preload(creatureDef(id)) : AnimeCharacter.preload(characterDef(id)))));
  }
}
