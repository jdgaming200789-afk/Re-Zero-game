import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Taygeta, the first trial. The question can only be answered by someone
 * who knows the sky of Subaru's world: Shaula is the scorpion's stinger, the
 * hero it killed is Orion, and his greatest splendour is Rigel. What Subaru
 * learned on Alcyone's balcony (or in an earlier loop) lets him say so at
 * once; otherwise every wrong star burns and the hints grow sharper, until
 * he remembers on his own.
 */
export const TAYGETA_DIALOGUES: DialogueDef[] = [
  {
    id: 'tay.arrive',
    cast: ['subaru', 'emilia', 'beatrice', 'julius', 'ram'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'White. Floor, walls, ceiling — everything. It’s like standing inside a blank page.', thought: true, expression: 'surprised' },
          { speaker: 'beatrice', text: 'There is no mana in this room. None at all. Betty does not like it, in fact.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'emilia', text: 'There’s something in the middle. A stone...?', expression: 'thinking' },
          { speaker: 'julius', text: 'A monolith. Then let us hear what the tower would ask of us.', anim: 'handOnChest' },
          { speaker: 'ram', text: 'Barusu first. If it bites, Ram will know not to touch it.', expression: 'smug', to: 'subaru' },
        ],
      },
    },
  },
  {
    id: 'tay.monolith',
    cast: ['subaru', 'emilia', 'anastasia', 'beatrice', 'meili'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: null, text: 'Gold letters cut into black stone, in a script Subaru has never seen and somehow reads anyway:', shot: 'keep' },
          { speaker: null, text: '“Touch upon the greatest splendour of the hero destroyed by Shaula.”', shot: 'keep', effects: [{ learn: 'tower.taygeta_riddle' }] },
          { speaker: 'anastasia', text: 'Shaula. The girl downstairs? She has guarded a door for four hundred years, Natsuki-kun. I doubt she has had time to destroy many heroes.', expression: 'thinking', to: 'subaru' },
          { speaker: 'meili', text: 'Big sister Shaula is super strong, though. Maybe she squished one and forgot?', expression: 'happy' },
        ],
        next: 'think',
      },
      // Whether Subaru already knows the stinger's name (balcony, or another loop).
      think: {
        branch: [{ if: 'know.sky.shaula_star', goto: 'insight' }],
        next: 'puzzled',
      },
      insight: {
        lines: [
          { speaker: 'subaru', text: 'Not Shaula the girl. Shaula the star — the scorpion’s stinger. The hero it killed is Orion.', thought: true, expression: 'determined' },
          { speaker: 'subaru', text: 'And Orion’s greatest splendour, his brightest star... Rigel. The blue-white one at his foot.', thought: true, expression: 'determined' },
          { speaker: 'emilia', text: 'Subaru? You’ve got that look again. The one where you know something.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Maybe. Give me a second.', anim: 'fist' },
        ],
        next: 'sky',
      },
      puzzled: {
        lines: [
          { speaker: 'subaru', text: '“The hero destroyed by Shaula.” “Greatest splendour.” Great. A riddle. I hate riddles.', expression: 'annoyed', anim: 'facepalm' },
          { speaker: 'beatrice', text: 'Complaining at the stone won’t make it answer, I suppose.', expression: 'annoyed' },
        ],
        next: 'sky',
      },
      sky: {
        lines: [{ speaker: 'emilia', text: 'Subaru — look! The room!', expression: 'surprised', anim: 'gasp', effects: [{ set: 'tay.trial_started' }, { event: 'tay.sky' }] }],
      },
    },
  },
  {
    id: 'tay.monolith_again',
    cast: ['subaru'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: null, text: '“Touch upon the greatest splendour of the hero destroyed by Shaula.”', shot: 'keep' },
          { speaker: 'subaru', text: 'The hero the scorpion killed. His brightest star. ...Rigel.', thought: true, if: 'know.sky.shaula_star' },
          { speaker: 'subaru', text: 'A hero. Destroyed by Shaula. The greatest splendour... Brightest? Most beautiful? Think, Natsuki Subaru.', thought: true, if: '!know.sky.shaula_star' },
        ],
      },
    },
  },
  {
    id: 'tay.fail',
    cast: ['subaru', 'emilia', 'anastasia', 'beatrice'],
    start: 'start',
    nodes: {
      start: {
        branch: [
          { if: 'tay.fails >= 3', goto: 'third' },
          { if: 'tay.fails >= 2', goto: 'second' },
        ],
        lines: [
          { speaker: 'emilia', text: 'Subaru! Are you hurt? That star — it burned you!', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'Okay. Wrong answers cost extra. Noted.', expression: 'pain', anim: 'sigh' },
          { speaker: 'beatrice', text: 'Guessing will get you cooked, Subaru. Think first, touch second, I suppose.', expression: 'annoyed', to: 'subaru' },
        ],
      },
      second: {
        lines: [
          { speaker: 'anastasia', text: 'Natsuki-kun. Has it occurred to you that “Shaula” might be a word from somewhere else?', expression: 'thinking', to: 'subaru' },
          { speaker: 'anastasia', text: 'The girl downstairs knows you as her Master. Perhaps you ought to know her name, too — from wherever it is you come from.', expression: 'smug' },
          { speaker: 'subaru', text: 'From where I come from...', thought: true, expression: 'thinking' },
        ],
      },
      third: {
        lines: [
          { speaker: 'subaru', text: 'Shaula. Shaula... that’s a star! Back home! The stinger of Scorpius — the scorpion that killed Orion!', thought: true, expression: 'surprised', effects: [{ learn: 'sky.shaula_star' }, { learn: 'sky.orion_myth' }] },
          { speaker: 'subaru', text: 'The hero is Orion. His greatest splendour is his brightest star. Rigel — the blue-white one at his foot. Not the red one. Rigel.', thought: true, expression: 'determined' },
          { speaker: 'emilia', text: 'Subaru, please be careful. You can’t take many more of those.', expression: 'sad', to: 'subaru' },
        ],
      },
    },
  },
  {
    id: 'tay.solved',
    cast: ['subaru', 'emilia', 'anastasia', 'ram', 'julius', 'beatrice', 'meili'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'emilia', text: 'Subaru... how did you know which star it was?', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'It’s the sky from my world. Same stars, same stories. Orion the hunter, killed by the scorpion — and the scorpion’s stinger is a star called Shaula.', anim: 'explain', to: 'emilia' },
          { speaker: 'subaru', text: 'Which means whoever built this tower knew my sky too.', thought: true, expression: 'thinking' },
          { speaker: 'anastasia', text: 'A trial only someone from your world could pass. How very, very interesting, Natsuki-kun.', expression: 'smug', to: 'subaru' },
          { speaker: 'ram', text: 'Barusu, being useful. The tower must be broken.', expression: 'smug' },
          { speaker: 'meili', text: 'Look, look! There are books everywhere now!', expression: 'joy', anim: 'wave' },
          { speaker: 'julius', text: 'The library Shaula spoke of. It seems she told the truth.', anim: 'nod' },
          { speaker: 'beatrice', text: 'So many books... Betty could stay here a hundred years, in fact.', expression: 'happy' },
          { speaker: 'subaru', text: 'Somewhere in here is the way to wake Rem up. Hang on, Rem. We’re one floor closer.', thought: true, expression: 'determined' },
        ],
      },
    },
  },
];
