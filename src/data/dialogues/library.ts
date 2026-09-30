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
];
