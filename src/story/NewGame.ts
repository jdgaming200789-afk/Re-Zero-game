import type { GameContext } from '../game/GameContext';

/** The party that crossed the dunes together. Rem travels asleep in the carriage. */
export const STARTING_PARTY = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'];

/**
 * Begin the story: the party at the foot of the tower, the opening scene
 * revealed from black.
 */
export async function startNewGame(game: GameContext, opts: { skipOpening?: boolean } = {}): Promise<void> {
  const s = game.state;
  await game.ui.fade(1, 0.6);
  for (const id of STARTING_PARTY) game.party.join(id);
  s.set('story.started', true);
  if (!s.has('meta.loop')) s.set('meta.loop', 1);
  // The carriage's harness bell: loud enough to carry over the dunes.
  if (!s.has('inv.carriage_bell')) s.set('inv.carriage_bell', 1);
  if (opts.skipOpening) s.set('story.opening_done', true);
  await game.scenes.goto('tower_foot', 'camp', { loadingScreen: true, fadeSeconds: 0.01, reveal: !!opts.skipOpening });
  await game.party.settled();
  if (opts.skipOpening) {
    game.quests.start('watchtower');
    game.checkpoints.reach('camp_night');
  }
  else await game.cinematics.play('tf.opening');
}
