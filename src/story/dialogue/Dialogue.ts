import { evaluate, validateCondition, type Condition, type ConditionContext } from '../Conditions';
import { validateEffect, type Effect } from '../Effects';

/** Camera hint for a line in an auto-framed conversation. */
export type LineShot = 'auto' | 'keep' | 'ots' | 'single' | 'two' | 'wide';

export interface DialogueLine {
  /** Voice/localisation id; defaults to `<dialogue>.<node>.<index>`. */
  id?: string;
  /** Character id, or null for narration. */
  speaker: string | null;
  text: string;
  expression?: string;
  /** Gesture clip the speaker performs as the line starts. */
  anim?: string;
  /** Who the speaker addresses (defaults to the previous speaker, or Subaru). */
  to?: string;
  /** Subaru's inner voice: no lip movement, styled as thought. */
  thought?: boolean;
  if?: Condition;
  effects?: Effect[];
  shot?: LineShot;
}

export interface DialogueChoice {
  id?: string;
  text: string;
  /** Node to continue at; null ends the conversation. */
  goto: string | null;
  if?: Condition;
  /** When `if` fails, show the option disabled with this hint instead of hiding it. */
  lockedHint?: string;
  effects?: Effect[];
  /** Only possible because of what Subaru learned in another loop. */
  insight?: boolean;
  /** Hide once chosen (in this loop). */
  once?: boolean;
}

export interface DialogueNode {
  /** Redirects evaluated on entry; the first whose condition holds wins. */
  branch?: Array<{ if: Condition; goto: string | null }>;
  effects?: Effect[];
  lines?: DialogueLine[];
  choices?: DialogueChoice[];
  /** Where to go after the lines when there are no (visible) choices. */
  next?: string | null;
}

export interface DialogueDef {
  id: string;
  /** Everyone staged in the conversation (looked at, framed). */
  cast: string[];
  start: string;
  nodes: Record<string, DialogueNode>;
  /** 'auto' composes conversation shots; 'keep' leaves the camera alone. */
  camera?: 'auto' | 'keep';
  letterbox?: boolean;
}

export interface ChoiceOption {
  index: number;
  choice: DialogueChoice;
  enabled: boolean;
  /** Chosen before in this loop (dimmed, like a read line). */
  chosen: boolean;
}

export type DialogueStep =
  | { kind: 'line'; line: DialogueLine; lineId: string; nodeId: string }
  | { kind: 'choice'; nodeId: string; options: ChoiceOption[] }
  | { kind: 'end' };

export interface RunnerHost {
  conditions: ConditionContext;
  apply(effect: Effect): void;
  /** Loop-scoped memory (visited nodes, chosen options). */
  remember(key: string): void;
  remembers(key: string): boolean;
}

/**
 * Walks a dialogue graph: evaluates conditions, applies effects as lines
 * are shown and choices are made, and yields one step at a time. Pure
 * logic, no presentation — the DialogueSystem drives it and tests can too.
 */
export class DialogueRunner {
  private nodeId: string | null = null;
  private lineIndex = 0;
  private current: DialogueStep | null = null;

  constructor(
    readonly def: DialogueDef,
    private readonly host: RunnerHost,
  ) {}

  get step(): DialogueStep | null {
    return this.current;
  }

  start(): DialogueStep {
    return (this.current = this.enter(this.def.start));
  }

  /** Continue after a line has been read. */
  advance(): DialogueStep {
    if (this.current?.kind !== 'line') throw new Error(`advance() while at ${this.current?.kind ?? 'nothing'}`);
    return (this.current = this.continueNode());
  }

  choose(index: number): DialogueStep {
    const step = this.current;
    if (step?.kind !== 'choice') throw new Error('choose() without a choice');
    const opt = step.options.find((o) => o.index === index);
    if (!opt || !opt.enabled) throw new Error(`Choice ${index} is not available`);
    this.host.remember(choiceKey(this.def.id, step.nodeId, index));
    for (const e of opt.choice.effects ?? []) this.host.apply(e);
    return (this.current = this.enter(opt.choice.goto));
  }

  private enter(target: string | null): DialogueStep {
    let id = target;
    for (let hops = 0; hops < 64; hops++) {
      if (id === null) return { kind: 'end' };
      const node = this.def.nodes[id];
      if (!node) throw new Error(`Dialogue "${this.def.id}": no node "${id}"`);
      const redirect = node.branch?.find((b) => evaluate(b.if, this.host.conditions));
      if (redirect) {
        id = redirect.goto;
        continue;
      }
      this.nodeId = id;
      this.lineIndex = 0;
      this.host.remember(`${this.def.id}.${id}`);
      for (const e of node.effects ?? []) this.host.apply(e);
      return this.continueNode();
    }
    throw new Error(`Dialogue "${this.def.id}": branch loop`);
  }

  private continueNode(): DialogueStep {
    const nodeId = this.nodeId!;
    const node = this.def.nodes[nodeId]!;
    const lines = node.lines ?? [];
    while (this.lineIndex < lines.length) {
      const i = this.lineIndex++;
      const line = lines[i]!;
      if (!evaluate(line.if, this.host.conditions)) continue;
      for (const e of line.effects ?? []) this.host.apply(e);
      return { kind: 'line', line, lineId: line.id ?? `${this.def.id}.${nodeId}.${i}`, nodeId };
    }
    const options = this.options(nodeId, node);
    if (options.length) return { kind: 'choice', nodeId, options };
    return this.enter(node.next ?? null);
  }

  private options(nodeId: string, node: DialogueNode): ChoiceOption[] {
    const out: ChoiceOption[] = [];
    (node.choices ?? []).forEach((choice, index) => {
      const chosen = this.host.remembers(choiceKey(this.def.id, nodeId, index));
      if (choice.once && chosen) return;
      const ok = evaluate(choice.if, this.host.conditions);
      if (!ok && choice.lockedHint === undefined) return;
      out.push({ index, choice, enabled: ok, chosen });
    });
    // A menu of only disabled options would trap the player.
    return out.some((o) => o.enabled) ? out : [];
  }
}

export function choiceKey(dialogueId: string, nodeId: string, index: number): string {
  return `${dialogueId}.${nodeId}.c${index}`;
}

/**
 * Structural validation for data tests: every jump lands on a node, every
 * node is reachable, conditions parse, effects are well-formed, speakers
 * exist.
 */
export function validateDialogue(def: DialogueDef, known: { characters: Set<string>; quests?: Set<string> }): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${def.id}: ${m}`);
  const nodes = def.nodes;
  if (!nodes[def.start]) err(`start node "${def.start}" missing`);
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(def.id)) err('dialogue ids are dotted lowercase words');
  for (const id of Object.keys(nodes)) if (!/^[a-z0-9_]+$/.test(id)) err(`node id "${id}" must be a lowercase word`);
  for (const c of def.cast) if (!known.characters.has(c)) err(`unknown cast member "${c}"`);
  const target = (from: string, to: string | null | undefined) => {
    if (to !== null && to !== undefined && !nodes[to]) err(`${from} → missing node "${to}"`);
  };
  const tryCond = (where: string, c: Condition | undefined) => {
    if (c === undefined) return;
    try {
      validateCondition(c);
    } catch (e) {
      err(`${where}: ${(e as Error).message}`);
    }
  };
  const tryEffects = (where: string, effects: Effect[] | undefined) => {
    for (const e of effects ?? []) {
      try {
        validateEffect(e, { quests: known.quests, characters: known.characters });
      } catch (x) {
        err(`${where}: ${(x as Error).message}`);
      }
    }
  };
  for (const [id, n] of Object.entries(nodes)) {
    for (const b of n.branch ?? []) {
      tryCond(`${id} branch`, b.if);
      target(id, b.goto);
    }
    tryEffects(id, n.effects);
    (n.lines ?? []).forEach((l, i) => {
      const where = `${id}[${i}]`;
      if (l.speaker !== null && !known.characters.has(l.speaker)) err(`${where}: unknown speaker "${l.speaker}"`);
      if (l.to && !known.characters.has(l.to)) err(`${where}: unknown addressee "${l.to}"`);
      if (!l.text.trim()) err(`${where}: empty line`);
      if (l.thought && l.speaker !== 'subaru') err(`${where}: only Subaru thinks aloud`);
      tryCond(where, l.if);
      tryEffects(where, l.effects);
    });
    (n.choices ?? []).forEach((c, i) => {
      const where = `${id} choice ${i}`;
      tryCond(where, c.if);
      tryEffects(where, c.effects);
      target(where, c.goto);
      if (c.insight && c.if === undefined) err(`${where}: insight choices need a knowledge condition`);
    });
    if (n.choices?.length && n.next !== undefined && n.choices.every((c) => c.if === undefined && !c.once)) err(`${id}: "next" is unreachable (unconditional choices)`);
    target(id, n.next);
  }
  // Reachability
  const seen = new Set<string>();
  const stack = [def.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !nodes[id]) continue;
    seen.add(id);
    const n = nodes[id]!;
    for (const b of n.branch ?? []) if (b.goto) stack.push(b.goto);
    for (const c of n.choices ?? []) if (c.goto) stack.push(c.goto);
    if (n.next) stack.push(n.next);
  }
  for (const id of Object.keys(nodes)) if (!seen.has(id)) err(`node "${id}" is unreachable`);
  return errors;
}
