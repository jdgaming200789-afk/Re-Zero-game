import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/EventBus';
import type { GameEvents } from '../src/core/events/GameEvents';
import { WorldStateManager, scopeOf } from '../src/world/WorldStateManager';
import { Scheduler } from '../src/core/Scheduler';
import { StateMachine } from '../src/core/StateMachine';
import { angleDelta, damp, Rng } from '../src/core/math/MathUtil';

describe('EventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new EventBus<GameEvents>();
    const seen: string[] = [];
    const off = bus.on('quest:started', (e) => seen.push(e.questId));
    bus.emit('quest:started', { questId: 'a' });
    off();
    bus.emit('quest:started', { questId: 'b' });
    expect(seen).toEqual(['a']);
  });

  it('isolates throwing listeners', () => {
    const bus = new EventBus<GameEvents>();
    let reached = false;
    bus.on('story:event', () => {
      throw new Error('boom');
    });
    bus.on('story:event', () => (reached = true));
    const err = console.error;
    console.error = () => {};
    bus.emit('story:event', { id: 'x' });
    console.error = err;
    expect(reached).toBe(true);
  });

  it('handles removal during emit', () => {
    const bus = new EventBus<GameEvents>();
    const calls: number[] = [];
    const offA = bus.on('story:event', () => {
      calls.push(1);
      offA();
    });
    bus.on('story:event', () => calls.push(2));
    bus.emit('story:event', { id: 'x' });
    bus.emit('story:event', { id: 'x' });
    expect(calls).toEqual([1, 2, 2]);
  });
});

describe('WorldStateManager', () => {
  it('scopes keys by namespace', () => {
    expect(scopeOf('know.heliosphere')).toBe('knowledge');
    expect(scopeOf('meta.deaths')).toBe('meta');
    expect(scopeOf('door.gate.open')).toBe('world');
  });

  it('rewinds world flags but keeps knowledge (Return by Death)', () => {
    const s = new WorldStateManager(new EventBus<GameEvents>());
    s.set('door.gate.open', false);
    const checkpoint = s.snapshot(['world']);
    s.set('door.gate.open', true);
    s.set('enemy.worm.dead', true);
    s.set('know.worm.vibration', true);
    s.add('meta.deaths');
    s.restore(checkpoint, ['world']);
    expect(s.bool('door.gate.open')).toBe(false);
    expect(s.has('enemy.worm.dead')).toBe(false);
    expect(s.bool('know.worm.vibration')).toBe(true);
    expect(s.num('meta.deaths')).toBe(1);
  });

  it('rejects malformed keys and non-finite numbers', () => {
    const s = new WorldStateManager(new EventBus<GameEvents>());
    expect(() => s.set('bad key', true)).toThrow();
    expect(() => s.set('x', Number.NaN)).toThrow();
  });

  it('ignores corrupted snapshot entries on restore', () => {
    const s = new WorldStateManager(new EventBus<GameEvents>());
    s.restore({ ok: 1, 'bad key': 2, obj: { nested: true } as unknown as number });
    expect(s.num('ok')).toBe(1);
    expect(s.has('obj')).toBe(false);
    expect(s.entries().length).toBe(1);
  });
});

describe('Scheduler', () => {
  it('resolves waits on scaled time only', async () => {
    const sch = new Scheduler();
    let done = false;
    void sch.wait(1).then(() => (done = true));
    sch.update(0, 5); // paused: scaled dt is zero
    await Promise.resolve();
    expect(done).toBe(false);
    sch.update(0.6, 0.6);
    sch.update(0.6, 0.6);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('tweens from 0 to 1', () => {
    const sch = new Scheduler();
    const values: number[] = [];
    void sch.tween(1, (t) => values.push(t));
    for (let i = 0; i < 4; i++) sch.update(0.25, 0.25);
    expect(values.at(-1)).toBe(1);
    expect(values[0]).toBeCloseTo(0.25);
  });
});

describe('StateMachine', () => {
  it('transitions via update return values', () => {
    const log: string[] = [];
    const sm = new StateMachine<object, 'a' | 'b'>({});
    sm.add({ id: 'a', update: () => 'b', exit: () => log.push('exit a') });
    sm.add({ id: 'b', enter: (_o, from) => log.push(`enter b from ${from}`) });
    sm.set('a');
    sm.update(0.1);
    expect(sm.current).toBe('b');
    expect(log).toEqual(['exit a', 'enter b from a']);
  });
});

describe('Math', () => {
  it('wraps angle deltas', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });
  it('damps frame-rate independently', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 10, 0.25, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 10, 0.25, 1 / 30);
    expect(a).toBeCloseTo(b, 5);
  });
  it('seeded rng is deterministic', () => {
    const r1 = new Rng(42);
    const r2 = new Rng(42);
    expect([r1.next(), r1.next()]).toEqual([r2.next(), r2.next()]);
  });
});
