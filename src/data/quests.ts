import type { QuestDef } from '../story/quests/Quest';

/**
 * Quests. Objectives complete by themselves when their condition holds, in
 * order (each appears once the previous required one is done). Conditions
 * read story flags; `visited.<zone>` flags are set when Subaru first enters
 * an area zone.
 */
export const QUESTS: QuestDef[] = [
  {
    id: 'watchtower',
    title: 'The Watchtower in the Sand',
    kind: 'main',
    summary:
      'After days lost in the Sand Time, the Pleiades Watchtower finally stands in front of us. Somewhere inside is the Sage — and maybe a way to wake Rem and give back everything Gluttony took.',
    objectives: [
      { id: 'ruins', text: 'Scout the outer ruins', done: 'visited.tf.ruins', marker: { area: 'tower_foot', at: [0, 0, 10] } },
      { id: 'obelisk', text: 'Read the weathered obelisk', done: 'tf.read_obelisk', optional: true, show: 'visited.tf.ruins', hint: 'It stands where the old road meets the glass.' },
      {
        id: 'flats',
        text: 'Cross the Glass Flats',
        done: 'visited.tf.plaza',
        hint: 'Something about that glass feels wrong. Too clean. Too quiet.',
        marker: { area: 'tower_foot', at: [0, 0, -55] },
      },
      { id: 'pack', text: 'Survive the witchbeasts on the plaza', done: 'tf.plaza_cleared', show: 'visited.tf.plaza' },
      {
        id: 'worm',
        text: 'Lure the Sand Earthworm into the light',
        done: 'tf.worm_dead',
        show: 'tf.worm_seen',
        hint: 'Ring the Carriage Bell out on the glass — then get behind stone and keep still.',
        marker: { area: 'tower_foot', at: [-6, 0, -34] },
      },
      { id: 'gate', text: 'Enter the Watchtower', done: "$area == 'celaeno'", marker: { area: 'tower_foot', at: [0, 5, -126] } },
    ],
    epilogue: 'We made it inside. Whatever is waiting for us in this tower, at least now it has to look us in the eye.',
  },
  {
    id: 'the_trials',
    title: 'The Trial of Taygeta',
    kind: 'main',
    summary:
      'Shaula, the Star Guardian, says the library above knows everything — but only once Taygeta’s trial is cleared. First, somewhere warm for Rem to sleep.',
    objectives: [
      { id: 'green_room', text: 'Bring Rem to the Green Room in Alcyone', done: 'alc.rem_settled', marker: { area: 'celaeno', at: [0, 12, 19] } },
      { id: 'taygeta', text: 'Climb to Taygeta', done: "$area == 'taygeta'" },
      { id: 'trial', text: 'Touch the greatest splendour', done: 'tay.trial_cleared', hint: '“Touch upon the greatest splendour of the hero destroyed by Shaula.”' },
    ],
    epilogue: 'Rigel. The brightest star of Orion — the hunter the scorpion killed. Only someone from my world could have known.',
  },
  {
    id: 'the_sword_saint',
    title: 'The Trial of Electra',
    kind: 'main',
    summary: 'Above the library, a stair climbs to Electra — the second floor, and the second trial. Whatever waits up there, it’s one floor closer to the Sage.',
    objectives: [
      { id: 'climb', text: 'Climb to Electra', done: "$area == 'electra'", marker: { area: 'taygeta', at: [0, 0, -19] } },
      { id: 'reid', text: 'Make the Sword Saint take you seriously', done: 'ele.trial_cleared', show: 'ele.met_reid', hint: 'Nothing gets past those chopsticks head-on. Not even Julius.' },
    ],
    epilogue: 'The first Sword Saint dropped a chopstick, and laughed like it was the best thing that had happened in four hundred years.',
  },
  {
    id: 'the_library',
    title: 'The Books of the Dead',
    kind: 'side',
    summary: 'Every book in Taygeta’s library is someone’s life — someone dead. Open one and you live it. There’s a name I have to look for, even if I’m afraid of finding it.',
    objectives: [
      { id: 'rem', text: 'Look for Rem’s book', done: 'lib.searched_rem' },
      {
        id: 'hadrian',
        text: 'Read the book of the man from the flats',
        done: 'lib.read_hadrian',
        optional: true,
        show: 'know.flats.hadrian',
        hint: 'The journal page in the pack by the ruins had a name on it.',
      },
    ],
    epilogue: 'There is no book for Rem. Whatever else this tower does to me, I get to keep that.',
  },
  {
    id: 'gym_training',
    title: 'Practice Makes Perfect',
    kind: 'side',
    summary: 'A few rounds in the practice ring. Beatrice says it’s pointless. Beatrice is watching anyway.',
    autoStart: 'gym.chat_done',
    objectives: [
      { id: 'ring', text: 'Step into the practice ring', done: 'visited.gym.arena' },
      { id: 'win', text: 'Knock down the practice dummies', done: 'gym.practice_won' },
    ],
  },
];
