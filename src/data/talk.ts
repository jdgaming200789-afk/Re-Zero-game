import type { TalkEntry } from '../story/dialogue/TalkSystem';

/** Who says what when Subaru talks to them. First matching entry wins. */
const CAMP = { all: ["$area == 'tower_foot'", 'story.opening_done'] };

export const TALK: TalkEntry[] = [
  { who: 'emilia', dialogue: 'camp.talk.emilia', if: CAMP },
  { who: 'beatrice', dialogue: 'camp.talk.beatrice', if: CAMP },
  { who: 'julius', dialogue: 'camp.talk.julius', if: CAMP },
  { who: 'ram', dialogue: 'camp.talk.ram', if: CAMP },
  { who: 'anastasia', dialogue: 'camp.talk.anastasia', if: CAMP },
  { who: 'meili', dialogue: 'camp.talk.meili', if: CAMP },
  { who: 'patrasche', dialogue: 'camp.talk.patrasche', if: CAMP },
  { who: 'shaula', dialogue: 'cel.talk.shaula', if: { all: ["$area == 'celaeno'", 'cel.met_shaula'] } },
];
