import type { DialogueDef } from '../../story/dialogue/Dialogue';
import { CAMP_OPENING } from './camp';
import { CAMP_TALK } from './campTalk';
import { CELAENO_DIALOGUES } from './celaeno';
import { DEV_DIALOGUES } from './dev';
import { RBD_DIALOGUES } from './rbd';

/** Every conversation in the game, by id. */
export const DIALOGUES: DialogueDef[] = [CAMP_OPENING, ...CAMP_TALK, ...CELAENO_DIALOGUES, ...RBD_DIALOGUES, ...DEV_DIALOGUES];
