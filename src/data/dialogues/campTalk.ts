import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Talking to the party at the camp after the opening. Each conversation has
 * a first telling and a short line for when Subaru comes back (the runner
 * remembers visited nodes as `dlg.<dialogue>.<node>`, which rewinds with
 * Return by Death like everything else Subaru didn't learn).
 */
const again = (id: string) => ({ if: `dlg.${id}.done`, goto: 'again' });

export const CAMP_TALK: DialogueDef[] = [
  {
    id: 'camp.talk.emilia',
    cast: ['subaru', 'emilia'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.emilia')],
        lines: [
          { speaker: 'emilia', text: 'Subaru. Can’t sleep either?', expression: 'thinking' },
          { speaker: 'subaru', text: 'Too excited. Or too scared. Hard to tell the difference lately.', anim: 'shrug' },
          { speaker: 'emilia', text: 'Mm... Me too. When I look at the tower, it feels like it’s looking back at me.', expression: 'sad', anim: 'lookDown' },
        ],
        choices: [
          { text: 'It’s just a tower. A big, creepy, ominous tower.', goto: 'joke' },
          { text: 'Whatever’s up there, we face it together.', goto: 'together', effects: [{ set: 'tf.emilia_together' }] },
        ],
      },
      joke: {
        lines: [
          { speaker: 'emilia', text: 'Subaru!', expression: 'annoyed' },
          { speaker: 'emilia', text: '...Hehe. Thank you. That helped, a little.', expression: 'happy', anim: 'laugh' },
        ],
        next: 'done',
      },
      together: {
        lines: [
          { speaker: 'emilia', text: 'Mm. Together.', expression: 'happy', anim: 'nod' },
          { speaker: 'subaru', text: 'She said it like it was the simplest thing in the world. Maybe for her, it is.', thought: true },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'emilia', text: 'Get some rest, Subaru. Tomorrow is going to be a long day.', expression: 'happy' }] },
    },
  },
  {
    id: 'camp.talk.beatrice',
    cast: ['subaru', 'beatrice'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.beatrice')],
        lines: [
          { speaker: 'beatrice', text: 'What is it? Betty is not sleepy, in fact.', expression: 'annoyed' },
          { speaker: 'subaru', text: 'Nothing. Just making sure my partner’s still here.' },
          { speaker: 'beatrice', text: '...Where else would Betty be, you idiot. The contract doesn’t let go that easily, I suppose.', expression: 'embarrassed', anim: 'shakeHead' },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'beatrice', text: 'Betty is *still* here. Stop checking, I suppose.', expression: 'annoyed' }] },
    },
  },
  {
    id: 'camp.talk.julius',
    cast: ['subaru', 'julius'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.julius')],
        lines: [
          { speaker: 'julius', text: 'The sky out here is unlike anything I have seen from the capital. Every star seems close enough to touch.', expression: 'happy' },
          { speaker: 'subaru', text: 'Yeah...', expression: 'thinking' },
          { speaker: 'subaru', text: 'Wait. That shape. Three stars in a row, and the bright one down at the corner... That’s Orion. That’s *my* sky.', thought: true, effects: [{ set: 'tf.saw_orion' }] },
          { speaker: 'julius', text: 'Subaru? You look as though you have seen an old friend.' },
        ],
        choices: [
          { text: 'Something like that. Where I’m from, that’s the Hunter.', goto: 'hunter' },
          { text: 'It’s nothing. Just tired.', goto: 'done' },
        ],
      },
      hunter: {
        lines: [
          { speaker: 'julius', text: 'A hunter? How curious. Here, the old texts only call them “the stars the Sage watched over.”', expression: 'thinking', anim: 'think' },
          { speaker: 'julius', text: 'Perhaps your homeland and the Sage share more than we know.', expression: 'happy' },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'julius', text: 'I will keep watch. Rest while you can, my friend.', anim: 'handOnChest' }] },
    },
  },
  {
    id: 'camp.talk.ram',
    cast: ['subaru', 'ram'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.ram')],
        lines: [
          { speaker: 'ram', text: 'Barusu. Ram doesn’t know that girl. And yet Ram’s hands know exactly how she likes her blanket folded.', expression: 'thinking' },
          { speaker: 'ram', text: 'Explain that.', to: 'subaru' },
        ],
        choices: [
          { text: 'Because she’s your sister.', goto: 'sister' },
          { text: 'I can’t. Not yet.', goto: 'cant' },
        ],
      },
      sister: {
        lines: [
          { speaker: 'ram', text: 'Hmph. Ram has no sister.', anim: 'lookDown' },
          { speaker: 'ram', text: '...Ram will check on her again before dawn anyway.' },
        ],
        next: 'done',
      },
      cant: {
        lines: [{ speaker: 'ram', text: 'Useless as ever, Barusu. Then find someone who can.', expression: 'smug' }],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'ram', text: 'Ram is busy. Go bother someone who likes you.', expression: 'annoyed' }] },
    },
  },
  {
    id: 'camp.talk.anastasia',
    cast: ['subaru', 'anastasia'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.anastasia')],
        lines: [
          { speaker: 'anastasia', text: 'Natsuki-kun. A word of advice from a humble artificial spirit?', expression: 'smug' },
          { speaker: 'anastasia', text: 'Places built to keep people out always have rules. Read them before you break them. It is cheaper that way.', anim: 'explain' },
          { speaker: 'subaru', text: 'Rules. Like the stuff carved on those obelisks by the glass...', thought: true },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'anastasia', text: 'Anastasia-sama would tell you to sleep. I am inclined to agree with her.' }] },
    },
  },
  {
    id: 'camp.talk.meili',
    cast: ['subaru', 'meili'],
    start: 'start',
    nodes: {
      start: {
        branch: [again('camp.talk.meili')],
        lines: [
          { speaker: 'meili', text: 'Onii-san! You wanted to know about the big one, right?', expression: 'happy' },
          { speaker: 'meili', text: 'The worm doesn’t listen to me. It only listens to the *ground*. If you stomp and run around, it comes. If you stand still, it forgets you.', anim: 'explain', effects: [{ learn: 'earthworm.vibration' }] },
          { speaker: 'subaru', text: 'That’s... weirdly useful and completely terrifying.', expression: 'fear' },
          { speaker: 'meili', text: 'Hehe. That’s the dunes for you.', expression: 'smug' },
        ],
        next: 'done',
      },
      done: {},
      again: { lines: [{ speaker: 'meili', text: 'Remember, Onii-san. Tiptoe.', expression: 'happy' }] },
    },
  },
  {
    id: 'camp.talk.patrasche',
    cast: ['subaru', 'patrasche'],
    start: 'start',
    nodes: {
      start: {
        lines: [{ speaker: 'patrasche', text: '(Patrasche lowers her head and waits, patient and proud.)' }],
        choices: [
          { text: 'Scratch under her chin.', goto: 'pat' },
          { text: 'Thank her for getting everyone here.', goto: 'thanks' },
        ],
      },
      pat: {
        lines: [
          { speaker: 'patrasche', text: '(A low, rumbling purr. Her tail sweeps the sand.)', expression: 'happy' },
          { speaker: 'subaru', text: 'Who’s the best girl? You are. Yes you are.', expression: 'happy' },
        ],
      },
      thanks: {
        lines: [
          { speaker: 'subaru', text: 'Seriously, Patrasche. We wouldn’t have made it without you.', expression: 'happy' },
          { speaker: 'patrasche', text: '(She snorts, as if to say: obviously.)' },
        ],
      },
    },
  },
];
