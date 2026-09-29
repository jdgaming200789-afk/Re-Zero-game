import { describe, expect, it } from 'vitest';
import type { FlagValue } from '../src/core/events/GameEvents';
import { CHARACTERS } from '../src/data/characters';
import { CINEMATICS } from '../src/data/cinematics';
import { CREATURES } from '../src/data/creatures';
import { DIALOGUES } from '../src/data/dialogues';
import { KNOWLEDGE } from '../src/data/knowledge';
import { QUESTS } from '../src/data/quests';
import { STORY_TRIGGERS } from '../src/data/story';
import { TALK as TALK_ENTRIES } from '../src/data/talk';
import { validateCinematic } from '../src/story/cinematic/Cinematic';
import { DialogueRunner, validateDialogue, type DialogueDef, type RunnerHost } from '../src/story/dialogue/Dialogue';
import type { Effect } from '../src/story/Effects';
import { evaluateQuest, validateQuest, type QuestDef } from '../src/story/quests/Quest';
import { validateCondition } from '../src/story/Conditions';

function host(flags: Record<string, FlagValue> = {}) {
  const applied: Effect[] = [];
  const memory = new Set<string>();
  const h: RunnerHost = {
    conditions: { get: (k) => flags[k] },
    apply: (e) => {
      applied.push(e);
      if ('set' in e) flags[e.set] = e.to ?? true;
    },
    remember: (k) => memory.add(k),
    remembers: (k) => memory.has(k),
  };
  return { h, applied, memory, flags };
}

const TALK: DialogueDef = {
  id: 'test',
  cast: ['subaru', 'emilia'],
  start: 'a',
  nodes: {
    a: {
      branch: [{ if: 'met', goto: 'again' }],
      effects: [{ set: 'met' }],
      lines: [
        { speaker: 'emilia', text: 'Hello.' },
        { speaker: 'emilia', text: 'Only if you know.', if: 'know.secret' },
        { speaker: 'subaru', text: 'Hi!', effects: [{ event: 'hi' }] },
      ],
      choices: [
        { text: 'Leave', goto: null },
        { text: 'Ask', goto: 'ask', once: true },
        { text: 'Insight', goto: 'b', if: 'know.secret', insight: true },
        { text: 'Locked', goto: 'b', if: 'never', lockedHint: 'Not yet' },
      ],
    },
    ask: { lines: [{ speaker: 'emilia', text: 'Ask away.' }], next: 'a2' },
    a2: { choices: [{ text: 'Bye', goto: null }] },
    b: { lines: [{ speaker: 'subaru', text: 'I know.', thought: true }] },
    again: { lines: [{ speaker: 'emilia', text: 'Back again?' }] },
  },
};

describe('DialogueRunner', () => {
  it('walks lines, skipping those whose condition fails, and applies effects', () => {
    const { h, applied } = host();
    const r = new DialogueRunner(TALK, h);
    let s = r.start();
    expect(s.kind === 'line' && s.line.text).toBe('Hello.');
    expect(s.kind === 'line' && s.lineId).toBe('test.a.0');
    s = r.advance();
    expect(s.kind === 'line' && s.line.text).toBe('Hi!');
    expect(applied).toContainEqual({ set: 'met' });
    expect(applied).toContainEqual({ event: 'hi' });
  });

  it('offers choices: hidden without knowledge, locked with a hint, once-only remembered', () => {
    const { h } = host();
    const r = new DialogueRunner(TALK, h);
    r.start();
    const s = r.advance() && r.advance();
    expect(s.kind).toBe('choice');
    if (s.kind !== 'choice') return;
    expect(s.options.map((o) => o.choice.text)).toEqual(['Leave', 'Ask', 'Locked']);
    expect(s.options.find((o) => o.choice.text === 'Locked')!.enabled).toBe(false);
    expect(() => r.choose(3)).toThrow();
    const next = r.choose(1);
    expect(next.kind === 'line' && next.line.text).toBe('Ask away.');
  });

  it('branches on story state and knowledge', () => {
    const again = new DialogueRunner(TALK, host({ met: true }).h).start();
    expect(again.kind === 'line' && again.line.text).toBe('Back again?');
    const { h } = host({ 'know.secret': true });
    const r = new DialogueRunner(TALK, h);
    r.start();
    const second = r.advance();
    expect(second.kind === 'line' && second.line.text).toBe('Only if you know.');
    r.advance();
    const choice = r.advance();
    expect(choice.kind === 'choice' && choice.options.some((o) => o.choice.insight && o.enabled)).toBe(true);
  });

  it('ends when a choice leads nowhere', () => {
    const { h } = host();
    const r = new DialogueRunner(TALK, h);
    r.start();
    r.advance();
    r.advance();
    expect(r.choose(0).kind).toBe('end');
  });

  it('refuses advancing out of turn', () => {
    const r = new DialogueRunner(TALK, host().h);
    expect(() => r.advance()).toThrow();
  });
});

const QUEST: QuestDef = {
  id: 'q',
  title: 'Q',
  kind: 'main',
  summary: '',
  objectives: [
    { id: 'one', text: 'One', done: 'a' },
    { id: 'opt', text: 'Optional', done: 'x', optional: true },
    { id: 'two', text: 'Two', done: 'b' },
  ],
};

describe('quests', () => {
  const run = (flags: Record<string, FlagValue>) => evaluateQuest(QUEST, (k) => flags[k], { get: (k) => flags[k] });

  it('reveals objectives in order and completes them from story state', () => {
    let r = run({ 'quest.q': 'active' });
    expect(r.objectives.map((o) => o.visible)).toEqual([true, false, false]);
    expect(r.complete).toBe(false);
    r = run({ 'quest.q': 'active', a: true });
    expect(r.newlyDone.map((o) => o.id)).toEqual(['one']);
    // Optional objectives never hold up the ones after them.
    expect(r.objectives.map((o) => o.visible)).toEqual([true, true, true]);
  });

  it('completes later objectives whose condition already held, skipping optional ones', () => {
    const r = run({ 'quest.q': 'active', a: true, b: true });
    expect(r.newlyDone.map((o) => o.id)).toEqual(['one', 'two']);
    expect(r.complete).toBe(true);
  });

  it('does nothing for quests that are not active', () => {
    const r = run({ a: true, b: true });
    expect(r.newlyDone).toEqual([]);
    expect(r.complete).toBe(false);
  });
});

describe('story data', () => {
  const characters = new Set([...Object.keys(CHARACTERS), ...Object.keys(CREATURES)]);
  const quests = new Set(QUESTS.map((q) => q.id));
  const dialogues = new Set(DIALOGUES.map((d) => d.id));

  it('dialogues are well-formed and fully reachable', () => {
    for (const d of DIALOGUES) expect(validateDialogue(d, { characters, quests })).toEqual([]);
    expect(dialogues.size).toBe(DIALOGUES.length);
  });

  it('quests are well-formed', () => {
    for (const q of QUESTS) expect(validateQuest(q, { quests, characters })).toEqual([]);
  });

  it('cinematics reference real dialogues, people and quests', () => {
    for (const c of CINEMATICS) expect(validateCinematic(c, { dialogues, characters, quests })).toEqual([]);
  });

  it('story triggers point at real scenes', () => {
    const cines = new Set(CINEMATICS.map((c) => c.id));
    for (const t of STORY_TRIGGERS) {
      if (t.if) validateCondition(t.if);
      if ('cinematic' in t.play) expect(cines.has(t.play.cinematic)).toBe(true);
      else expect(dialogues.has(t.play.dialogue)).toBe(true);
    }
  });

  it('talk entries name real people and conversations', () => {
    for (const t of TALK_ENTRIES) {
      expect(characters.has(t.who)).toBe(true);
      expect(dialogues.has(t.dialogue)).toBe(true);
      if (t.if) validateCondition(t.if);
    }
  });

  it('every piece of knowledge has a title and text', () => {
    for (const k of Object.values(KNOWLEDGE)) expect(k.title && k.text).toBeTruthy();
  });

  it('the validator catches broken data', () => {
    const broken: DialogueDef = { id: 'x', cast: ['nobody'], start: 'a', nodes: { a: { lines: [{ speaker: 'ghost', text: '' }], next: 'missing' }, orphan: {} } };
    const errs = validateDialogue(broken, { characters, quests });
    expect(errs.some((e) => e.includes('unknown cast'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown speaker'))).toBe(true);
    expect(errs.some((e) => e.includes('missing node'))).toBe(true);
    expect(errs.some((e) => e.includes('unreachable'))).toBe(true);
  });
});
