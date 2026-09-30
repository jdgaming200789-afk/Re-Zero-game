import type { GameContext } from '../game/GameContext';

/**
 * Ring the Carriage Bell where Subaru stands: clear and carrying, heard by
 * everything under the sand for a long way (the Sand Earthworm crosses the
 * dunes to it). Returns false when there is nobody to ring it.
 */
export function ringBell(game: GameContext): boolean {
  const p = game.player;
  if (!p) return false;
  game.events.emit('audio:stinger', { id: 'bell' });
  game.enemies.noise(p.entity.object3D.position, 40);
  game.events.emit('story:event', { id: 'bell.rung' });
  void p.visual.play('reachMid');
  game.events.emit('bark:play', { speakerId: 'subaru', text: 'Come on, then. Come and get it.', duration: 2.5 });
  return true;
}
