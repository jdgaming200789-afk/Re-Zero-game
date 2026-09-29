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
      { id: 'gate', text: 'Enter the Watchtower', done: "$area == 'celaeno'", marker: { area: 'tower_foot', at: [0, 5, -126] } },
    ],
    epilogue: 'We made it inside. Whatever is waiting for us in this tower, at least now it has to look us in the eye.',
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
