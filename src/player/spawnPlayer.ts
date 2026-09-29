import type { Game } from '../game/Game';
import { CharacterMotor } from '../characters/CharacterMotor';
import { PlayerController } from './PlayerController';
import type { CharacterVisual } from '../characters/CharacterVisual';
import { Layer } from '../physics/Physics';

/** Creates the persistent player entity (survives area changes). */
export function spawnPlayer(game: Game, visual: CharacterVisual, characterId = 'subaru'): PlayerController {
  const entity = game.world.spawn('player', 'persistent', { tags: ['player', 'character'] });
  const motor = entity.add(
    new CharacterMotor(game.physics, { membership: Layer.Player, collidesWith: Layer.Environment | Layer.Prop | Layer.CharacterOnly | Layer.Enemy }, { kind: 'character' }),
  );
  const controller = entity.add(new PlayerController(game, characterId, motor, visual));
  game.player = controller;
  game.events.emit('player:spawned', { characterId });
  return controller;
}
