import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Taygeta, the first trial. The question can only be answered by someone
 * who knows the sky of Subaru's world: Shaula is the star at the tip of the
 * scorpion's tail — the stinger — the hero the scorpion killed is Orion,
 * and his greatest splendour is his brightest star, Rigel. Beatrice's
 * remark about the girl's hooked braid sets Subaru thinking, and he
 * reasons it through in his mind's eye (the `tay.monolith` cinematic);
 * then the room becomes the sky and he has to find the hunter's foot.
 * Wrong stars burn.
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
    cast: ['subaru', 'emilia', 'anastasia', 'beatrice', 'meili', 'ram'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: null, text: 'Gold letters cut into black stone, in a script Subaru has never seen and somehow reads anyway:', shot: 'keep' },
          { speaker: null, text: '“Touch upon the greatest splendour of the hero destroyed by Shaula.”', shot: 'keep', effects: [{ learn: 'tower.taygeta_riddle' }] },
          { speaker: 'anastasia', text: 'Shaula. The girl downstairs? She has guarded a door for four hundred years, Natsuki-kun. I doubt she has had time to destroy many heroes.', expression: 'thinking', to: 'subaru' },
          { speaker: 'meili', text: 'Big sister Shaula is super strong, though. Maybe she squished one and forgot?', expression: 'happy' },
          { speaker: 'ram', text: 'If that girl ever destroyed a hero, she talked him to death.', expression: 'smug' },
          { speaker: 'beatrice', text: 'That braid of hers curls up into a hook at the end, I suppose. Like something that stings, in fact.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Like something that stings. A hook at the end of a tail... Shaula. Shaula.', thought: true, expression: 'thinking' },
        ],
      },
    },
  },
  {
    // After the mind's-eye sky: Subaru has the answer, and touches the stone.
    id: 'tay.answer',
    cast: ['subaru', 'emilia', 'anastasia', 'julius'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'emilia', text: 'Subaru? You’ve got that look again. The one where you know something.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'I do. Shaula isn’t a girl’s name where I come from — it’s a star. The stinger of the scorpion. And the answer is a star too.', expression: 'determined', anim: 'explain', to: 'emilia' },
          { speaker: 'julius', text: 'A star. Then the “greatest splendour” is a light in the sky.', expression: 'thinking' },
          { speaker: 'anastasia', text: 'Then by all means, Natsuki-kun. Touch it.', expression: 'smug', to: 'subaru' },
          { speaker: 'subaru', text: 'Here goes nothing.', anim: 'reachMid', effects: [{ set: 'tay.trial_started' }, { event: 'tay.sky' }] },
          { speaker: 'emilia', text: 'Subaru — look! The room!', expression: 'surprised', anim: 'gasp' },
        ],
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
          { speaker: 'subaru', text: 'The scorpion’s stinger killed the hunter. Orion — three stars in a row for a belt. His brightest is the blue-white one at his foot. Rigel.', thought: true },
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
          { speaker: 'subaru', text: 'Wrong star. I know the answer — I just grabbed the wrong light. Find the hunter first.', expression: 'pain', anim: 'sigh' },
          { speaker: 'beatrice', text: 'Guessing will get you cooked, Subaru. Look first, touch second, I suppose.', expression: 'annoyed', to: 'subaru' },
        ],
      },
      second: {
        lines: [
          { speaker: 'anastasia', text: 'Natsuki-kun, you said a hunter. Does this hunter of yours have anything one might recognise him by?', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'His belt — three stars in a perfect row. Nothing else in the sky looks like it.', thought: true, expression: 'thinking' },
        ],
      },
      third: {
        lines: [
          { speaker: 'subaru', text: 'Belt first. Shoulders above it, feet below. The red one is his shoulder. The blue-white one, down at his foot — that’s Rigel.', thought: true, expression: 'determined' },
          { speaker: 'emilia', text: 'Subaru, please be careful. You can’t take many more of those.', expression: 'sad', to: 'subaru' },
        ],
      },
    },
  },
  {
    // Touching Betelgeuse of all stars.
    id: 'tay.fail_betelgeuse',
    cast: ['subaru', 'ram', 'emilia'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'Ow— Betelgeuse. Of course it was Betelgeuse. I literally told myself not Betelgeuse.', expression: 'pain', anim: 'facepalm' },
          { speaker: 'ram', text: 'Barusu outwitted by his own mouth. Ram is not surprised.', expression: 'smug', to: 'subaru' },
          { speaker: 'subaru', text: 'The red shoulder gets the alpha. The foot gets the light. Rigel.', thought: true, expression: 'determined' },
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
