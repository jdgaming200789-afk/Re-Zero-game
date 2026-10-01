import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Electra: Reid Astrea, the first Sword Saint — or the shade of him the
 * tower keeps — sits eating on the open floor and makes a trial of himself:
 * make him take one step off the spot he's standing on. He fights with a
 * pair of chopsticks and nothing the party throws at him lands. Subaru's
 * best trick only makes him drop a chopstick; it's Emilia who makes him
 * move — and she alone passes. A stair of light comes down from the sky
 * for her, and the party decides she shouldn't climb it alone. Not yet.
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
          { speaker: 'reid', text: 'Never heard of him. Don’t care. Here’s your trial, kid. See this spot I’m standing on?', expression: 'neutral', to: 'subaru' },
          { speaker: 'reid', text: 'Make me take one step off it. One step. One at a time or all at once — I don’t care. I’ll even use these.', expression: 'joy', anim: 'wave' },
          { speaker: 'julius', text: '...You intend to face us with chopsticks.', expression: 'annoyed', to: 'reid' },
          { speaker: 'reid', text: 'What, you’d rather I used a spoon?', expression: 'smug', anim: 'laugh', to: 'julius' },
          { speaker: 'beatrice', text: 'He’s a shade, I suppose. Nothing we throw at him is going to stick, in fact.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'One step. Not a scratch, not a win — one step. How hard can that be?', thought: true, expression: 'determined' },
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
    // Subaru's best trick lands — and doesn't count.
    id: 'ele.not_a_step',
    cast: ['subaru', 'reid', 'julius', 'emilia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'reid', text: 'Not bad, kid. You can’t swing that thing worth a damn — but you watch. You watched where I wasn’t looking.', expression: 'happy', to: 'subaru', if: "ele.snared_how == 'behind'" },
          { speaker: 'reid', text: 'Turning out the lights on a swordsman? Cheap. Dirty. I love it.', expression: 'joy', to: 'subaru', if: "ele.snared_how == 'dark'" },
          { speaker: 'subaru', text: 'Then — that’s it? I did it?', expression: 'happy', to: 'reid' },
          { speaker: 'reid', text: 'Did what? That’s a chopstick, kid. Look at my feet.', expression: 'smug', to: 'subaru' },
          { speaker: 'subaru', text: '...They haven’t moved an inch.', thought: true, expression: 'surprised' },
          { speaker: 'reid', text: 'I said a step. You made me drop my lunch. Different thing. Next!', expression: 'joy', anim: 'laugh' },
          { speaker: 'julius', text: 'Not even that was enough...', expression: 'sad' },
          { speaker: 'emilia', text: '...Then let me try.', expression: 'determined' },
        ],
      },
    },
  },
  {
    id: 'ele.emilia_turn',
    cast: ['subaru', 'reid', 'emilia', 'beatrice'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'Emilia-tan, wait — he’s been swatting all of us like flies—', expression: 'fear', to: 'emilia' },
          { speaker: 'emilia', text: 'It’s all right, Subaru. He doesn’t want to be beaten. He wants to be moved.', expression: 'determined', to: 'subaru' },
          { speaker: 'reid', text: 'Ohh? The pretty one’s got a plan. Go on, then, missy. Show me something.', expression: 'smug', to: 'emilia' },
          { speaker: 'beatrice', text: 'That girl’s mana is moving like a winter tide... What is she doing, I wonder.', expression: 'thinking' },
        ],
      },
    },
  },
  {
    id: 'ele.emilia_passed',
    cast: ['subaru', 'reid', 'emilia', 'julius', 'ram', 'beatrice', 'anastasia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'reid', text: 'You froze the floor out from under a man’s sandals — not to hit me, not to beat me. Just so my own feet would have to choose.', expression: 'joy', to: 'emilia' },
          { speaker: 'reid', text: 'And they chose. A step’s a step. You pass, missy.', expression: 'happy', to: 'emilia' },
          { speaker: 'emilia', text: 'I... passed? I really passed?', expression: 'surprised' },
          { speaker: 'subaru', text: 'EMILIA-TAN! You did it! You actually did it!', expression: 'joy', anim: 'fist', to: 'emilia' },
          { speaker: 'julius', text: 'Not by force at all. Remarkable.', expression: 'happy', anim: 'handOnChest' },
          { speaker: 'ram', text: 'Of course Emilia-sama passed. The rest of you were simply in the way.', expression: 'smug' },
          { speaker: 'reid', text: 'Don’t get excited, the rest of you. She passed. You didn’t.', expression: 'neutral' },
        ],
      },
    },
  },
  {
    // The stair of light: only she may climb it, and they decide she won't. Not yet.
    id: 'ele.stair',
    cast: ['subaru', 'reid', 'emilia', 'julius', 'ram', 'beatrice', 'anastasia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'A stair, coming down out of the sky. Steps made of light, one after another, all the way down to her feet.', thought: true, expression: 'surprised' },
          { speaker: 'reid', text: 'There’s your way up, missy. Only yours. The rest of them can stand there and stare.', expression: 'smug', to: 'emilia' },
          { speaker: 'emilia', text: 'Only me...?', expression: 'surprised' },
          { speaker: 'beatrice', text: 'The floor above this one — the top of the tower, I suppose.', expression: 'thinking' },
          { speaker: 'reid', text: 'Up top? The old lizard. Volcanica. Big, loud, never listens. You’ll love him.', expression: 'smug' },
          { speaker: 'julius', text: 'Volcanica... the Divine Dragon of the Covenant himself.', expression: 'surprised' },
          { speaker: 'anastasia', text: 'A dragon at the top of a tower, and only one of us allowed to go up to it. I don’t like those odds, Emilia-san.', expression: 'thinking', to: 'emilia' },
          { speaker: 'ram', text: 'Emilia-sama alone, in front of a dragon, with no one beside her. No.', expression: 'annoyed' },
          { speaker: 'subaru', text: 'Ram’s right. We don’t know what’s up there, and we can’t follow you. Not yet, Emilia-tan. Not alone.', expression: 'determined', to: 'emilia' },
          { speaker: 'emilia', text: '...But I’m the only one who passed. If there’s something I can do up there, I should—', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'And you will. When we know what’s waiting — and when I’ve made that guy take a step too. We go up together.', expression: 'determined', to: 'emilia' },
          { speaker: 'emilia', text: '...Okay. Not yet. But when it’s time, I’m going.', expression: 'determined', anim: 'nod', to: 'subaru' },
          { speaker: 'reid', text: 'The stair’ll keep. It waited four hundred years — it can wait for you to grow a spine, kid.', expression: 'smug', to: 'subaru' },
          { speaker: 'subaru', text: 'He’s dead. He fought with Volcanica. Which means somewhere in the library downstairs, there’s a book with his whole life in it.', thought: true, expression: 'thinking', effects: [{ quest: 'the_book_of_reid' }] },
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
          { speaker: 'reid', text: 'What? I’m eating. The girl passed. You didn’t. Come back when you’ve got a way to make me move.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'subaru', text: 'Where do you even get noodles up here?', to: 'reid' },
          { speaker: 'reid', text: 'Kid. I’m a dead man in a magic tower. Don’t ask questions you don’t want answered.', expression: 'smug' },
        ],
      },
    },
  },
  {
    id: 'ele.stair_touch',
    cast: ['subaru'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'Steps made of light. My foot goes straight through the first one, like it isn’t there at all. For me, it isn’t.', thought: true, expression: 'sad', if: '!subaru.amnesia' },
          { speaker: 'subaru', text: 'A staircase of light into the sky, and I can’t stand on it. Of course. Why would anything here make sense.', thought: true, expression: 'thinking', if: 'subaru.amnesia' },
        ],
      },
    },
  },
];
