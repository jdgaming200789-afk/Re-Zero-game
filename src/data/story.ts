import type { StoryTrigger } from '../story/StoryDirector';

/**
 * Story beats: what plays when. New games start the opening directly
 * (see NewGame.ts); the trigger here covers resuming a save made before it.
 */
export const STORY_TRIGGERS: StoryTrigger[] = [
  {
    id: 'tf.opening',
    on: { areaEnter: 'tower_foot' },
    if: { all: ['story.started', '!story.opening_done'] },
    play: { cinematic: 'tf.opening' },
    delay: 0.2,
  },
];
