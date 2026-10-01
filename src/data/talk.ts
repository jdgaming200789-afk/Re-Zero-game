import type { TalkEntry } from '../story/dialogue/TalkSystem';

/** Who says what when Subaru talks to them. First matching entry wins. */
const CAMP = { all: ["$area == 'tower_foot'", 'story.opening_done'] };

const AMNESIA = 'subaru.amnesia';

export const TALK: TalkEntry[] = [
  // After Reid's book: Subaru remembers no one.
  { who: 'emilia', dialogue: 'amn.talk.emilia', if: AMNESIA },
  { who: 'beatrice', dialogue: 'amn.talk.beatrice', if: AMNESIA },
  { who: 'julius', dialogue: 'amn.talk.julius', if: AMNESIA },
  { who: 'ram', dialogue: 'amn.talk.ram', if: AMNESIA },
  { who: 'anastasia', dialogue: 'amn.talk.anastasia', if: AMNESIA },
  { who: 'meili', dialogue: 'amn.talk.meili', if: AMNESIA },
  { who: 'patrasche', dialogue: 'amn.talk.patrasche', if: AMNESIA },
  { who: 'emilia', dialogue: 'camp.talk.emilia', if: CAMP },
  { who: 'beatrice', dialogue: 'camp.talk.beatrice', if: CAMP },
  { who: 'julius', dialogue: 'camp.talk.julius', if: CAMP },
  { who: 'ram', dialogue: 'camp.talk.ram', if: CAMP },
  { who: 'anastasia', dialogue: 'camp.talk.anastasia', if: CAMP },
  { who: 'meili', dialogue: 'camp.talk.meili', if: CAMP },
  { who: 'patrasche', dialogue: 'camp.talk.patrasche', if: CAMP },
  { who: 'shaula', dialogue: 'cel.talk.shaula', if: { all: ["$area == 'celaeno'", 'cel.met_shaula'] } },
];
