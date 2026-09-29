import type { FlagValue } from '../../core/events/GameEvents';
import { evaluate, validateCondition, type Condition, type ConditionContext } from '../Conditions';
import { validateEffect, type Effect } from '../Effects';

export interface ObjectiveDef {
  id: string;
  text: string;
  /** Completes when this holds (re-checked whenever story state changes). */
  done: Condition;
  /** Visible when this holds; by default once every earlier required objective is done. */
  show?: Condition;
  optional?: boolean;
  /** Where it points on the map / compass. */
  marker?: { area: string; at: [number, number, number] };
  /** Extra journal line. */
  hint?: string;
}

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side';
  /** Journal description. */
  summary: string;
  objectives: ObjectiveDef[];
  /** Starts by itself once this holds. */
  autoStart?: Condition;
  fail?: Condition;
  onComplete?: Effect[];
  /** Journal text once finished. */
  epilogue?: string;
}

export type QuestStatus = 'inactive' | 'active' | 'done' | 'failed';

export interface ObjectiveView {
  def: ObjectiveDef;
  visible: boolean;
  done: boolean;
}

/** Quest state lives in world flags, so Return by Death rewinds it with everything else. */
export const questKey = (questId: string) => `quest.${questId}`;
export const objectiveKey = (questId: string, objectiveId: string) => `quest.${questId}.${objectiveId}`;

export function questStatus(get: (k: string) => FlagValue | undefined, id: string): QuestStatus {
  const v = get(questKey(id));
  return v === 'active' || v === 'done' || v === 'failed' ? v : 'inactive';
}

/**
 * One evaluation pass over a quest: which objectives are visible and done,
 * which have just completed, and whether the quest is finished. Pure, so
 * the QuestSystem and the tests share it.
 */
export function evaluateQuest(
  def: QuestDef,
  get: (k: string) => FlagValue | undefined,
  ctx: ConditionContext,
): { objectives: ObjectiveView[]; newlyDone: ObjectiveDef[]; complete: boolean; failed: boolean } {
  const status = questStatus(get, def.id);
  const objectives: ObjectiveView[] = [];
  const newlyDone: ObjectiveDef[] = [];
  let earlierDone = true;
  const active = status === 'active';
  const failed = active && def.fail !== undefined && evaluate(def.fail, ctx);
  for (const o of def.objectives) {
    let done = status === 'done' || get(objectiveKey(def.id, o.id)) === true;
    const visible = status === 'done' || (o.show !== undefined ? evaluate(o.show, ctx) : earlierDone);
    if (active && !failed && !done && visible && evaluate(o.done, ctx)) {
      done = true;
      newlyDone.push(o);
    }
    objectives.push({ def: o, visible: visible || done, done });
    if (!o.optional) earlierDone = earlierDone && done;
  }
  const complete = active && !failed && def.objectives.every((o, i) => o.optional || objectives[i]!.done);
  return { objectives, newlyDone, complete, failed };
}

export function validateQuest(def: QuestDef, known: { quests: Set<string>; characters: Set<string> }): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${def.id}: ${m}`);
  const cond = (where: string, c: Condition | undefined) => {
    if (c === undefined) return;
    try {
      validateCondition(c);
    } catch (e) {
      err(`${where}: ${(e as Error).message}`);
    }
  };
  if (!/^[a-z0-9_]+$/.test(def.id)) err('quest ids are lowercase words');
  const ids = new Set<string>();
  for (const o of def.objectives) {
    if (!/^[a-z0-9_]+$/.test(o.id)) err(`objective id "${o.id}"`);
    if (ids.has(o.id)) err(`duplicate objective "${o.id}"`);
    ids.add(o.id);
    cond(o.id, o.done);
    cond(`${o.id} show`, o.show);
  }
  if (!def.objectives.some((o) => !o.optional)) err('needs at least one required objective');
  cond('autoStart', def.autoStart);
  cond('fail', def.fail);
  for (const e of def.onComplete ?? []) {
    try {
      validateEffect(e, known);
    } catch (x) {
      err(`onComplete: ${(x as Error).message}`);
    }
  }
  return errors;
}
