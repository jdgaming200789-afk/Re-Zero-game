import type { FlagValue } from '../core/events/GameEvents';

/**
 * Data-driven conditions for dialogue choices, chatter, quests and
 * interactables.
 *
 * String form (the common case, readable in data files):
 *   "door.open"                 truthy
 *   "!door.open"                falsy / unset
 *   "meta.loop >= 2"            comparison (== != > >= < <=)
 *   "area == 'celaeno'"         strings may be quoted
 *   "$party.emilia"             `$` keys are virtual, answered by a resolver
 *
 * Structured form for combinations:
 *   { all: [...] }  { any: [...] }  { not: cond }
 */
export type Condition = string | { all: Condition[] } | { any: Condition[] } | { not: Condition };

export interface ConditionContext {
  /** Story flags. */
  get(key: string): FlagValue | undefined;
  /** Virtual values ($area, $party.<id>, $time...). */
  resolve?(key: string): FlagValue | undefined;
}

const COMPARISON = /^(!?)\s*(\$?[a-z0-9_]+(?:\.[a-z0-9_]+)*)\s*(?:(==|!=|>=|<=|>|<)\s*([^=<>!\s].*))?$/i;

type Op = '==' | '!=' | '>=' | '<=' | '>' | '<';

interface Parsed {
  negate: boolean;
  key: string;
  op: Op | null;
  value: FlagValue | null;
}

const cache = new Map<string, Parsed>();

function parseLiteral(raw: string): FlagValue {
  const t = raw.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  return Number.isNaN(n) ? t : n;
}

export function parseCondition(expr: string): Parsed {
  let p = cache.get(expr);
  if (p) return p;
  const m = COMPARISON.exec(expr.trim());
  if (!m) throw new Error(`Bad condition "${expr}"`);
  p = { negate: m[1] === '!', key: m[2]!, op: (m[3] as Op) ?? null, value: m[4] !== undefined ? parseLiteral(m[4]) : null };
  if (p.negate && p.op) throw new Error(`Condition "${expr}": use != instead of ! with a comparison`);
  cache.set(expr, p);
  return p;
}

function truthy(v: FlagValue | undefined): boolean {
  return v !== undefined && v !== false && v !== 0 && v !== '';
}

function compare(a: FlagValue | undefined, op: Op, b: FlagValue): boolean {
  switch (op) {
    case '==':
      return a === b || (a === undefined && (b === false || b === 0));
    case '!=':
      return !(a === b || (a === undefined && (b === false || b === 0)));
    default: {
      const x = typeof a === 'number' ? a : typeof a === 'boolean' ? Number(a) : a === undefined ? 0 : Number.NaN;
      const y = typeof b === 'number' ? b : Number(b);
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      return op === '>' ? x > y : op === '>=' ? x >= y : op === '<' ? x < y : x <= y;
    }
  }
}

export function evaluate(cond: Condition | undefined | null, ctx: ConditionContext): boolean {
  if (cond === undefined || cond === null) return true;
  if (typeof cond === 'string') {
    const p = parseCondition(cond);
    const v = p.key.startsWith('$') ? ctx.resolve?.(p.key.slice(1)) : ctx.get(p.key);
    if (p.op) return compare(v, p.op, p.value!);
    return p.negate ? !truthy(v) : truthy(v);
  }
  if ('all' in cond) return cond.all.every((c) => evaluate(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evaluate(c, ctx));
  if ('not' in cond) return !evaluate(cond.not, ctx);
  return false;
}

/** Throws on malformed conditions (data validation in tests). */
export function validateCondition(cond: Condition): void {
  if (typeof cond === 'string') {
    parseCondition(cond);
    return;
  }
  if ('all' in cond) cond.all.forEach(validateCondition);
  else if ('any' in cond) cond.any.forEach(validateCondition);
  else if ('not' in cond) validateCondition(cond.not);
}
