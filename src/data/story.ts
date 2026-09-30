import type { StoryTrigger } from '../story/StoryDirector';

/**
 * Story beats that start themselves: what plays when. (The camp opening is
 * played by the new-game flow directly; no save can exist before it, since
 * its end sets the first return point.)
 */
export const STORY_TRIGGERS: StoryTrigger[] = [
  {
    // The pack is dead; the noise woke something bigger.
    id: 'tf.worm',
    on: { flag: 'tf.plaza_cleared' },
    if: '!tf.worm_seen',
    play: { cinematic: 'tf.worm' },
    delay: 1.2,
  },
  {
    id: 'ele.arrive',
    on: { areaEnter: 'electra' },
    if: '!ele.met_reid',
    play: { cinematic: 'ele.arrive' },
    delay: 0.3,
  },
  {
    id: 'ele.cleared',
    on: { event: 'ele.chopstick' },
    play: { cinematic: 'ele.cleared' },
    delay: 0.2,
  },
  {
    id: 'tf.worm_dead',
    on: { flag: 'tf.worm_dead' },
    play: { dialogue: 'tf.worm_dead' },
    delay: 2.5,
  },
  {
    id: 'cel.shaula',
    on: { areaEnter: 'celaeno' },
    if: { all: ['story.opening_done', '!cel.met_shaula'] },
    play: { cinematic: 'cel.shaula' },
    delay: 0.4,
  },
  {
    id: 'alc.arrive',
    on: { areaEnter: 'alcyone' },
    if: { all: ['cel.met_shaula', '!alc.rem_settled'] },
    play: { cinematic: 'alc.arrive' },
    delay: 0.3,
  },
  {
    // Stepping into the Green Room for the first time: Rem is laid to rest.
    id: 'alc.rem',
    on: { zone: 'alc.green_room' },
    if: { all: ['cel.met_shaula', '!alc.rem_settled'] },
    play: { cinematic: 'alc.rem' },
  },
  {
    id: 'tay.arrive',
    on: { areaEnter: 'taygeta' },
    if: '!tay.trial_started',
    play: { cinematic: 'tay.arrive' },
    delay: 0.6,
  },
  {
    // The balcony, once Rem is settled: Emilia comes looking for Subaru.
    id: 'alc.balcony',
    on: { zone: 'alc.balcony' },
    if: 'alc.rem_settled',
    play: { cinematic: 'alc.balcony' },
    delay: 0.3,
  },
];
