import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Meeting Shaula in Celaeno. She mistakes Subaru for her "Master" (the Sage
 * Flügel, though nobody says that name yet), is delighted, childish and
 * utterly sincere — including about killing rule-breakers.
 */
export const CELAENO_DIALOGUES: DialogueDef[] = [
  {
    id: 'cel.shaula',
    cast: ['subaru', 'shaula', 'emilia', 'beatrice', 'julius', 'anastasia', 'ram', 'meili'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'shaula', text: 'Master! You came back! You really, *really* came back! Four hundred years, Master — I waited the whole time!', expression: 'joy', anim: 'wave', to: 'subaru' },
          { speaker: 'subaru', text: 'M-master? Me? You’ve got the wrong guy, I’ve never—', expression: 'surprised', anim: 'shrug' },
          { speaker: 'shaula', text: 'Ehh? Don’t be mean, Master! It’s me, Shaula! I kept watch just like you told me to. Every single day!', expression: 'annoyed', to: 'subaru' },
          { speaker: 'emilia', text: 'Subaru... do you know her?', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Never seen her before in my life. And trust me, I would remember.', anim: 'shakeHead', to: 'emilia' },
          { speaker: 'julius', text: 'Forgive me, my lady. Are you the Sage who dwells in this tower?', anim: 'bow', to: 'shaula' },
          { speaker: 'shaula', text: 'Sage? Nope! Master’s the Sage. I’m Shaula — the Star Guardian of the tower!', expression: 'smug', anim: 'fist', effects: [{ learn: 'people.shaula' }] },
          { speaker: 'anastasia', text: 'Four hundred years guarding a door... and she believes Natsuki-kun is the one who left her there. How very interesting.', expression: 'smug', to: 'julius' },
          { speaker: 'beatrice', text: 'Of all the people in the world to mistake for a sage, I suppose.', expression: 'annoyed' },
          { speaker: 'shaula', text: 'Oh! Oh! But even for Master, rules are rules. The tower has rules!', expression: 'happy', anim: 'explain', to: 'subaru' },
          { speaker: 'shaula', text: 'Don’t leave the tower before the trials are cleared. Clear the trials. Don’t wreck the books in the library. Don’t wreck the tower.', effects: [{ learn: 'tower.rules' }] },
          { speaker: 'shaula', text: 'If anybody breaks the rules, I have to kill them. Even Master! Hehe.', expression: 'joy', anim: 'laugh' },
          { speaker: 'subaru', text: 'She said that with a smile. She absolutely means it.', thought: true, expression: 'fear' },
        ],
        choices: [
          { text: 'That light on the glass. That was you, wasn’t it?', goto: 'light', if: 'know.heliosphere.movement', insight: true },
          { text: 'Okay. Rules. Got it. Absolutely no wrecking.', goto: 'rules' },
          { text: 'Is there a way to wake someone whose name was eaten?', goto: 'rem' },
        ],
      },
      light: {
        lines: [
          { speaker: 'shaula', text: 'The Heliosphere? Yup! Anything that moves on the sand, I shoot. That’s my job!', expression: 'joy', to: 'subaru' },
          { speaker: 'subaru', text: 'So she’s the one who burned me into the glass. And now she wants a hug.', thought: true, if: "meta.last_death == 'heliosphere'" },
          { speaker: 'subaru', text: 'Good thing I didn’t run out there. Really, really good thing.', thought: true, if: "meta.last_death != 'heliosphere'" },
          { speaker: 'ram', text: 'Barusu. How did you know about that?', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Lucky guess.', anim: 'shrug', to: 'ram' },
        ],
        next: 'rem',
      },
      rules: {
        lines: [{ speaker: 'shaula', text: 'Yay! Master’s so nice today!', expression: 'joy', anim: 'wave' }],
        next: 'rem',
      },
      rem: {
        lines: [
          { speaker: 'subaru', text: 'Shaula. Is there a way to wake someone up? Someone whose name was eaten?', expression: 'determined', to: 'shaula' },
          { speaker: 'shaula', text: 'Hmm... Dunno! But the library knows everything. It’s up past the living rooms. You have to clear Taygeta’s trial first, though!', expression: 'thinking', anim: 'think' },
          { speaker: 'emilia', text: 'Then that’s where we’re going.', expression: 'determined', anim: 'nod' },
          { speaker: 'meili', text: 'Onii-san, can we put your sleeping girl somewhere comfy first? The carriage is all sandy.', expression: 'happy', to: 'subaru' },
          { speaker: 'shaula', text: 'The Green Room! It’s upstairs in Alcyone. It’s the best room. Master made it!', expression: 'joy', effects: [{ quest: 'the_trials' }] },
        ],
      },
    },
  },
  {
    id: 'cel.talk.shaula',
    cast: ['subaru', 'shaula'],
    start: 'start',
    nodes: {
      start: {
        branch: [{ if: 'dlg.cel.talk.shaula.done', goto: 'again' }],
        lines: [
          { speaker: 'shaula', text: 'Master! Did you need something? A hug? A snack? Somebody shot?', expression: 'joy' },
          { speaker: 'subaru', text: 'Let’s... start with the first one and never do the last one.', anim: 'facepalm' },
          { speaker: 'shaula', text: 'Hehe. The stairs up are on the gallery, over the gate. Alcyone first, then Taygeta. Don’t forget the rules!', expression: 'happy', anim: 'explain' },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'shaula', text: 'Rules, Master! Rules!', expression: 'smug', anim: 'fist' }] },
    },
  },
  {
    id: 'cel.gate_rule',
    cast: ['subaru', 'shaula', 'emilia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'shaula', text: 'Master? Where are you going? The trials aren’t cleared yet.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'She was by the dais a second ago. A whole hall away.', thought: true, expression: 'surprised', if: '!know.people.shaula_rules' },
          { speaker: 'subaru', text: 'Same smile. Same question. Last time I answered it wrong.', thought: true, expression: 'fear', if: 'know.people.shaula_rules' },
        ],
        choices: [
          { text: 'Nowhere! Just stretching my legs. Inside.', goto: 'stay' },
          { text: 'Only to the carriage. I’ll be right back.', goto: 'leave', if: '!know.people.shaula_rules' },
        ],
      },
      stay: {
        lines: [{ speaker: 'shaula', text: 'Okay! Stretch all you want, Master. Inside is the best place anyway!', expression: 'joy', anim: 'wave' }],
      },
      leave: {
        lines: [
          { speaker: 'shaula', text: 'Aww. But Master... you know the rules.', expression: 'sad', to: 'subaru' },
          { speaker: 'shaula', text: 'Sorry, Master. Hehe.', expression: 'joy', effects: [{ set: 'cel.leave_anyway' }] },
        ],
      },
    },
  },
];
