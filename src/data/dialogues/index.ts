import type { DialogueDef } from '../../story/dialogue/Dialogue';
import { ALCYONE_DIALOGUES } from './alcyone';
import { CAMP_OPENING } from './camp';
import { CAMP_TALK } from './campTalk';
import { CELAENO_DIALOGUES } from './celaeno';
import { DEV_DIALOGUES } from './dev';
import { ELECTRA_DIALOGUES } from './electra';
import { LIBRARY_DIALOGUES } from './library';
import { RBD_DIALOGUES } from './rbd';
import { TAYGETA_DIALOGUES } from './taygeta';
import { TOWERFOOT_DIALOGUES } from './towerfoot';

/** Every conversation in the game, by id. */
export const DIALOGUES: DialogueDef[] = [
  CAMP_OPENING,
  ...CAMP_TALK,
  ...TOWERFOOT_DIALOGUES,
  ...CELAENO_DIALOGUES,
  ...ALCYONE_DIALOGUES,
  ...TAYGETA_DIALOGUES,
  ...LIBRARY_DIALOGUES,
  ...ELECTRA_DIALOGUES,
  ...RBD_DIALOGUES,
  ...DEV_DIALOGUES,
];
