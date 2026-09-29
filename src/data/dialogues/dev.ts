import type { DialogueDef } from '../../story/dialogue/Dialogue';

/** Developer-gym conversations that exercise every dialogue feature (tests use them). */
export const DEV_DIALOGUES: DialogueDef[] = [
  {
    id: 'gym.chat',
    cast: ['subaru', 'emilia', 'beatrice'],
    start: 'start',
    nodes: {
      start: {
        branch: [{ if: 'gym.chat_done', goto: 'again' }],
        lines: [
          { speaker: 'emilia', text: 'Subaru! Are you practising again? You’re so *diligent* lately.', expression: 'happy', to: 'subaru' },
          { speaker: 'subaru', text: 'A knight of the royal selection candidate has to stay sharp, Emilia-tan.', anim: 'fist' },
          { speaker: 'beatrice', text: 'He tripped over his own whip twice, in fact.', expression: 'smug', to: 'emilia' },
          { speaker: 'subaru', text: 'Beako, whose side are you on?!', expression: 'surprised', to: 'beatrice' },
        ],
        choices: [
          { text: 'Ask Emilia to train with you.', goto: 'train' },
          { text: 'Give up and take a break.', goto: 'rest', effects: [{ item: 'tonic', count: 1 }] },
          { text: 'Tell them about the light on the glass.', goto: 'secret', if: 'know.heliosphere.movement', insight: true },
          { text: 'Show off your whip tricks.', goto: null, if: 'gym.never', lockedHint: 'You don’t have any.' },
        ],
      },
      train: {
        lines: [
          { speaker: 'emilia', text: 'Mm! But I won’t go easy on you.', expression: 'determined', anim: 'nod' },
          { speaker: 'subaru', text: 'Please do go easy on me.', thought: false },
        ],
        next: 'end',
      },
      rest: {
        lines: [
          { speaker: 'beatrice', text: 'Here. Drink this and stop whining, I suppose.', expression: 'annoyed' },
          { speaker: null, text: 'Beatrice presses a small glass vial into Subaru’s hand.' },
        ],
        next: 'end',
      },
      secret: {
        lines: [
          { speaker: 'subaru', text: 'I can’t tell them how I know. I can never tell them.', thought: true },
          { speaker: 'emilia', text: 'Subaru? What light?', expression: 'thinking' },
        ],
        next: 'end',
      },
      end: {
        effects: [{ set: 'gym.chat_done' }],
        lines: [{ speaker: 'beatrice', text: 'Honestly. Betty is surrounded by children.', anim: 'sigh' }],
      },
      again: {
        lines: [{ speaker: 'emilia', text: 'Back again? Let’s keep going, then!', expression: 'happy', anim: 'wave' }],
      },
    },
  },
];
