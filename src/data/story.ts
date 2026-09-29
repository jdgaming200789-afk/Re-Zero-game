import type { StoryTrigger } from '../story/StoryDirector';

/**
 * Story beats that start themselves: what plays when. (The camp opening is
 * played by the new-game flow directly; no save can exist before it, since
 * its end sets the first return point.)
 */
export const STORY_TRIGGERS: StoryTrigger[] = [];
