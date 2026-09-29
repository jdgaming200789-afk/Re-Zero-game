import { describe, expect, it } from 'vitest';
import { evaluate, validateCondition, type ConditionContext } from '../src/story/Conditions';

function ctx(flags: Record<string, string | number | boolean>, virtual: Record<string, string | number | boolean> = {}): ConditionContext {
  return { get: (k) => flags[k], resolve: (k) => virtual[k] };
}

describe('Conditions', () => {
  const c = ctx({ 'door.open': true, 'meta.loop': 3, name: 'rigel', zero: 0 }, { area: 'celaeno', 'party.emilia': true });

  it('evaluates truthiness and negation', () => {
    expect(evaluate('door.open', c)).toBe(true);
    expect(evaluate('!door.open', c)).toBe(false);
    expect(evaluate('missing', c)).toBe(false);
    expect(evaluate('!missing', c)).toBe(true);
    expect(evaluate('zero', c)).toBe(false);
    expect(evaluate(undefined, c)).toBe(true);
  });

  it('compares numbers and strings', () => {
    expect(evaluate('meta.loop >= 3', c)).toBe(true);
    expect(evaluate('meta.loop > 3', c)).toBe(false);
    expect(evaluate('meta.loop == 3', c)).toBe(true);
    expect(evaluate("name == 'rigel'", c)).toBe(true);
    expect(evaluate('name != rigel', c)).toBe(false);
    // Unset flags compare as 0 / false.
    expect(evaluate('missing < 1', c)).toBe(true);
    expect(evaluate('missing == false', c)).toBe(true);
  });

  it('resolves virtual keys', () => {
    expect(evaluate("$area == 'celaeno'", c)).toBe(true);
    expect(evaluate('$party.emilia', c)).toBe(true);
    expect(evaluate('$party.julius', c)).toBe(false);
  });

  it('combines with all / any / not', () => {
    expect(evaluate({ all: ['door.open', 'meta.loop >= 2'] }, c)).toBe(true);
    expect(evaluate({ any: ['missing', '!door.open'] }, c)).toBe(false);
    expect(evaluate({ not: { any: ['missing', 'door.open'] } }, c)).toBe(false);
  });

  it('rejects malformed conditions', () => {
    expect(() => validateCondition('meta.loop >=')).toThrow();
    expect(() => validateCondition('!a == 1')).toThrow();
    expect(() => validateCondition({ all: ['ok', 'bad key!'] })).toThrow();
  });
});
