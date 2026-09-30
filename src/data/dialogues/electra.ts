import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Electra: Reid Astrea, the first Sword Saint — or the shade of him the
 * tower keeps — sits eating on the open floor and makes a trial of himself.
 * He's loud, crude, bored, and so far above everyone that he fights with a
 * pair of chopsticks. (The exact trial here is this game's adaptation: make
 * him drop one.)
 */
export const ELECTRA_DIALOGUES: DialogueDef[] = [
  {
    id: 'ele.reid',
    cast: ['subaru', 'reid', 'julius', 'beatrice', 'emilia', 'ram', 'anastasia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'julius', text: 'That hair. That bearing... You are Reid Astrea. The first Sword Saint.', expression: 'surprised', to: 'reid' },
          { speaker: 'reid', text: 'Heh. Somebody reads. Yeah, that’s me — or what this tower kept of me. Four hundred years dead, and I’m still stuck minding a floor.', expression: 'smug', to: 'julius' },
          { speaker: 'subaru', text: 'The first Sword Saint. As in, Reinhard’s great-great-lots-of-greats grandfather?', expression: 'surprised', to: 'reid' },
          { speaker: 'reid', text: 'Never heard of him. Don’t care. Here’s your trial, kid: take me seriously enough that I have to take you seriously.', expression: 'neutral', to: 'subaru' },
          { speaker: 'reid', text: 'Come at me. All of you, if you like. I’ll even use these.', expression: 'joy', anim: 'wave' },
          { speaker: 'julius', text: '...You intend to face us with chopsticks.', expression: 'annoyed', to: 'reid' },
          { speaker: 'reid', text: 'What, you’d rather I used a spoon?', expression: 'smug', anim: 'laugh', to: 'julius' },
          { speaker: 'beatrice', text: 'He’s a shade, I suppose. Nothing we throw at him is going to stick, in fact.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Then the trick isn’t hitting him. It’s getting him to flinch.', thought: true, expression: 'determined' },
        ],
      },
    },
  },
  {
    id: 'ele.rematch',
    cast: ['subaru', 'reid'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'reid', text: 'Back again? You’ve got the eyes of somebody who’s already lost to me once. Funny — I don’t remember winning.', expression: 'smug', to: 'subaru', if: 'meta.deaths > 0' },
          { speaker: 'reid', text: 'Done catching your breath? Good. I’m bored.', expression: 'neutral', to: 'subaru', if: 'meta.deaths == 0' },
          { speaker: 'subaru', text: 'He only ever watches one of us at a time. Let Julius keep him busy — and come at him from where he isn’t looking.', thought: true, expression: 'thinking', if: 'know.reid.attention' },
        ],
        choices: [
          { text: 'Again.', goto: null, effects: [{ set: 'ele.go' }] },
          { text: 'Not yet.', goto: null },
        ],
      },
    },
  },
  {
    id: 'ele.yield',
    cast: ['subaru', 'reid', 'julius', 'emilia', 'beatrice'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'reid', text: 'Not bad, kid. You can’t swing that thing worth a damn — but you watch. You watched where I wasn’t looking.', expression: 'happy', to: 'subaru', if: "ele.snared_how == 'behind'" },
          { speaker: 'reid', text: 'Turning out the lights on a swordsman? Cheap. Dirty. I love it.', expression: 'joy', to: 'subaru', if: "ele.snared_how == 'dark'" },
          { speaker: 'julius', text: 'Subaru... how did you—', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'He never once looked at me. Nobody ever does. For once, that came in handy.', anim: 'shrug', to: 'julius' },
          { speaker: 'emilia', text: 'That was amazing, Subaru! ...And a little bit sneaky.', expression: 'happy', to: 'subaru' },
          { speaker: 'reid', text: 'Trial’s passed. Go on up — whatever’s next has nothing on me, but go anyway.', expression: 'neutral' },
          { speaker: 'reid', text: 'And you, pretty boy. Your sword’s honest. Too honest. Come back when you’ve got something of your own worth swinging it for.', expression: 'smug', to: 'julius' },
          { speaker: 'julius', text: '...I will.', expression: 'determined', anim: 'nod', to: 'reid' },
          { speaker: 'beatrice', text: 'A four-hundred-year-old man throwing a tantrum over a chopstick. Betty has seen everything now, in fact.', expression: 'annoyed' },
        ],
      },
    },
  },
  {
    id: 'ele.after',
    cast: ['subaru', 'reid'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'reid', text: 'What? I’m eating. You passed, didn’t you? Go bother the next floor.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'subaru', text: 'Where do you even get noodles up here?', to: 'reid' },
          { speaker: 'reid', text: 'Kid. I’m a dead man in a magic tower. Don’t ask questions you don’t want answered.', expression: 'smug' },
        ],
      },
    },
  },
];
