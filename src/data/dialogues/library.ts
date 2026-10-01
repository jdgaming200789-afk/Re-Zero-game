import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Taygeta's library: the Books of the Dead. Beatrice — who kept a library
 * of her own for four hundred years — knows what they are the moment
 * Subaru touches one. He looks for Rem's book and is gladder than he's ever
 * been to find nothing; and he looks for Hadrian, the traveller from the
 * journal page by the ruins, whose book is there.
 */
export const LIBRARY_DIALOGUES: DialogueDef[] = [
  {
    id: 'lib.lectern',
    cast: ['subaru', 'beatrice', 'julius', 'emilia', 'ram'],
    start: 'start',
    nodes: {
      start: {
        branch: [{ if: 'know.library.books', goto: 'ask' }],
        lines: [
          { speaker: null, text: 'No title. No author. The first page is blank — and then, the moment his fingers touch it, it isn’t.', shot: 'keep' },
          { speaker: 'subaru', text: 'Gah—! That was — somebody’s morning. Somebody’s hands. I was in there!', expression: 'fear', anim: 'gasp' },
          { speaker: 'beatrice', text: 'Put it down, you fool. You don’t even know what you’re holding. ...No, of course you don’t.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'beatrice', text: 'Books of the Dead, I suppose. One for every soul that has died. Open one and you don’t read it — you live it, in fact.', expression: 'thinking', effects: [{ learn: 'library.books' }, { quest: 'the_library' }] },
          { speaker: 'julius', text: 'Then every volume on these shelves is someone’s life. The whole of it, kept.', expression: 'sad', anim: 'handOnChest' },
          { speaker: 'emilia', text: 'There are so many...', expression: 'sad' },
          { speaker: 'subaru', text: 'Everyone who ever died. Then if Gluttony — if Rem —', thought: true, expression: 'fear' },
        ],
        next: 'ask',
      },
      ask: {
        lines: [{ speaker: 'subaru', text: 'A name. Somewhere in here, a name.', thought: true, shot: 'keep' }],
        choices: [
          { text: 'Look for Rem’s book.', goto: 'rem', if: '!lib.searched_rem' },
          { text: 'Look for Hadrian — the man from the journal page.', goto: 'hadrian', if: { all: ['know.flats.hadrian', '!lib.hadrian_found'] }, insight: true },
          { text: 'Look for Reid Astrea — the Sword Saint.', goto: 'reid', if: { all: ['ele.emilia_passed', '!lib.reid_found'] } },
          { text: 'Not now.', goto: null },
        ],
      },
      rem: {
        lines: [
          { speaker: 'subaru', text: 'Beako. Help me look. R-E-M. Rem.', expression: 'determined', to: 'beatrice' },
          { speaker: 'beatrice', text: '...Fine. Just this once, in fact.', expression: 'annoyed' },
          { speaker: null, text: 'Shelf after shelf. Spines without titles that somehow have names when you look straight at them. Beatrice’s fingers run along them faster than Subaru can read.' },
          { speaker: 'beatrice', text: 'It isn’t here.', expression: 'neutral' },
          { speaker: 'subaru', text: 'It has to be. Look again — she could be — maybe while we were climbing —', expression: 'fear', to: 'beatrice' },
          { speaker: 'beatrice', text: 'Subaru. Listen to Betty. This is a library of the dead. There is no book for her because there couldn’t be.', expression: 'sad', to: 'subaru' },
          { speaker: 'beatrice', text: 'Your Rem is alive, I suppose.', expression: 'happy', effects: [{ learn: 'library.rem_alive' }, { set: 'lib.searched_rem' }] },
          { speaker: 'subaru', text: '...Yeah. Yeah, she is.', expression: 'sad', anim: 'nod' },
          { speaker: 'ram', text: 'Barusu is crying over a book that isn’t there. How very like him.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'ram', text: '...Whoever she is. Ram is glad too.', expression: 'thinking', if: 'alc.ram_told' },
        ],
        next: 'ask',
      },
      reid: {
        lines: [
          { speaker: 'subaru', text: 'Reid Astrea died four hundred years ago. If his book is here, his whole life is in it — how he fights, how he thinks. How to make him move.', expression: 'determined' },
          { speaker: 'julius', text: 'The life of the first Sword Saint... If anyone’s book could show us a way past him, it is his own.', expression: 'thinking', anim: 'nod' },
          { speaker: 'beatrice', text: 'A whole Sword Saint poured into one small head. That is a great deal of a person, Subaru. Be careful, in fact.', expression: 'thinking', to: 'subaru' },
          { speaker: null, text: 'Ram finds it in the end, shelved far higher than anything around it — as if someone had put it out of reach on purpose.' },
          { speaker: 'ram', text: 'Here. A red cover. As loud as its owner.', expression: 'smug', effects: [{ set: 'lib.reid_found' }, { event: 'lib.reid_found' }] },
        ],
        next: null,
      },
      hadrian: {
        lines: [
          { speaker: 'subaru', text: 'The pack by the ruins. “Hadrian says we cross the glass at first light.” If he never made it across...', expression: 'thinking' },
          { speaker: 'julius', text: 'Then his book will be here. Allow me.', anim: 'nod', to: 'subaru' },
          { speaker: null, text: 'It takes the better part of an hour. Julius finds it at last on a low shelf beside the stair — a thin book, its spine as warm as a hand.' },
          { speaker: 'julius', text: 'Hadrian. The name was waiting for us.', expression: 'sad', effects: [{ set: 'lib.hadrian_found' }, { event: 'lib.hadrian_found' }] },
          { speaker: 'beatrice', text: 'Read it, and it reads you back. Don’t lose yourself in there, Subaru.', expression: 'thinking', to: 'subaru' },
        ],
        next: null,
      },
    },
  },
  {
    id: 'lib.after_hadrian',
    cast: ['subaru', 'emilia', 'beatrice'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: '— hah — hah — the glass, and the light, and — Maren. He turned around for Maren.', expression: 'pain' },
          { speaker: 'emilia', text: 'Subaru! You were shaking. You kept saying a name I didn’t know.', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'He was so close. He only turned around because she was shouting, and he wanted to hear what she said.', expression: 'sad', to: 'emilia' },
          { speaker: 'subaru', text: 'The same light. Every time I died out there, somebody had already died there first.', thought: true, expression: 'thinking' },
          { speaker: 'beatrice', text: 'That is what these books do, I suppose. You carry them afterwards. Don’t open another one lightly.', expression: 'sad', to: 'subaru' },
        ],
      },
    },
  },
  {
    // Reading Reid's book. Something else was reading with him.
    id: 'lib.amnesia',
    cast: ['subaru', 'emilia', 'beatrice', 'ram', 'julius', 'anastasia', 'meili'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: '...Huh. I fell asleep? Where... a library? This definitely isn’t the convenience store.', thought: true, expression: 'surprised' },
          { speaker: 'emilia', text: 'Subaru! You’re awake — thank goodness. You fell over the moment you opened that book, and you wouldn’t wake up...', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'Whoa— uh. Hi? Silver hair, elf ears... Is this a cosplay event? Am I being pranked right now?', expression: 'surprised', to: 'emilia' },
          { speaker: 'emilia', text: '...Subaru? It’s me. Emilia.', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'Emilia. That’s a pretty name. Sorry — have we met?', expression: 'thinking', to: 'emilia' },
          { speaker: 'beatrice', text: 'Subaru. Stop it. This isn’t funny, in fact.', expression: 'fear', to: 'subaru' },
          { speaker: 'subaru', text: 'I mean — yeah, I’m Subaru. Natsuki Subaru. But who are you, little lady? Why does everyone know my name?', expression: 'surprised', to: 'beatrice' },
          { speaker: 'ram', text: 'Barusu. If this is a joke, Ram will never forgive it.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'subaru', text: 'Barusu? Who’s Barusu?', expression: 'surprised', to: 'ram' },
          { speaker: 'julius', text: 'Natsuki Subaru. Do you know who I am?', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Should I? You look like the prince route in a dating sim.', expression: 'thinking', to: 'julius' },
          { speaker: 'julius', text: '...I see. Then there is no one left in the world who remembers my name.', expression: 'sad' },
          { speaker: 'anastasia', text: 'Natsuki-kun. What is the last thing you remember? Before waking up here.', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'The last thing... walking home from the convenience store. Cup noodles, a bag of chips. And then — this.', expression: 'thinking', to: 'anastasia' },
          { speaker: 'beatrice', text: 'That smell on the pages... I know it. Gluttony. Something of Gluttony’s was waiting inside that book, and it ate, I suppose.', expression: 'fear' },
          { speaker: 'meili', text: 'Onii-san forgot... everybody?', expression: 'sad' },
          { speaker: 'subaru', text: 'Everyone’s looking at me like I died. Like I’m a stranger wearing somebody they love. ...What did I do?', thought: true, expression: 'fear' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.emilia',
    cast: ['subaru', 'emilia'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'emilia', text: 'Do you remember anything? Even a little bit?', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'Sorry. I keep trying. It’s like the last year of my life is a blank page.', expression: 'sad', to: 'emilia' },
          { speaker: 'emilia', text: 'Then I’ll tell you, a little at a time. You came here to save someone very important to you. And you’re very brave — even when you’re scared.', expression: 'happy', to: 'subaru' },
          { speaker: 'subaru', text: 'She’s about to cry. Over me. Someone I don’t even know is about to cry over me.', thought: true, expression: 'sad' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.beatrice',
    cast: ['subaru', 'beatrice'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'beatrice', text: 'You chose Betty. Out of four hundred years of waiting, you walked in and you chose Betty.', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'I... did? I’m sorry. I wish I remembered. I really do.', expression: 'sad', to: 'beatrice' },
          { speaker: 'beatrice', text: 'Don’t apologise to Betty with that face. It’s still your face, in fact. That’s the worst part.', expression: 'sad' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.julius',
    cast: ['subaru', 'julius'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'julius', text: 'I am Julius Juukulius. You will not have heard the name. No one has, any longer.', expression: 'sad', anim: 'handOnChest', to: 'subaru' },
          { speaker: 'subaru', text: 'That’s a really sad way to introduce yourself, man.', expression: 'thinking', to: 'julius' },
          { speaker: 'julius', text: 'You were the one person who still remembered it. You promised me you would. It seems the world has a cruel sense of humour.', expression: 'sad' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.ram',
    cast: ['subaru', 'ram'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'ram', text: 'You have forgotten Ram, which is unforgivable. And you have forgotten the sleeping girl downstairs — the one you would not stop talking about.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'subaru', text: 'There’s a sleeping girl?', expression: 'surprised', to: 'ram' },
          { speaker: 'ram', text: 'Rem. You said her name as if it were the only word you knew. Now there is no one in this tower who knows her at all.', expression: 'thinking' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.anastasia',
    cast: ['subaru', 'anastasia'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'anastasia', text: 'So. Natsuki-kun, the boy from the convenience store. Tell me everything you know. It shouldn’t take long.', expression: 'smug', to: 'subaru' },
          { speaker: 'subaru', text: 'Wow. Rude. Accurate, but rude.', expression: 'annoyed', to: 'anastasia' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.meili',
    cast: ['subaru', 'meili'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'meili', text: 'Onii-san forgot everybody? Even Meili? ...That’s kind of scary.', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'Sorry, kid. I don’t even know where I am.', expression: 'sad', to: 'meili' },
        ],
      },
    },
  },
  {
    id: 'amn.talk.patrasche',
    cast: ['subaru', 'patrasche'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: null, text: 'The land dragon presses her head into his chest and doesn’t let go.' },
          { speaker: 'subaru', text: 'I have no idea why that makes my eyes sting.', thought: true, expression: 'sad' },
        ],
      },
    },
  },
];
