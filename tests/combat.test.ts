import { describe, expect, it } from 'vitest';
import { computeDamage, hostile, type DamageInfo } from '../src/combat/Damage';
import { Health } from '../src/combat/Health';
import { Entity } from '../src/core/ecs/Entity';
import type { World } from '../src/core/ecs/World';

const hit = (amount: number, extra: Partial<DamageInfo> = {}): DamageInfo => ({ amount, type: 'physical', sourceId: 1, ...extra });

function body(max = 100, opts: Partial<ConstructorParameters<typeof Health>[0]> = {}): Health {
  const world = { registerComponent() {}, unregisterComponent() {} } as unknown as World;
  const e = new Entity(world, 'test', 'test');
  return e.add(new Health({ max, faction: 'enemy', name: 'Test', ...opts }));
}

describe('damage calculation', () => {
  it('applies resistances, status bonuses and criticals', () => {
    expect(computeDamage(hit(10), {}, new Set(), 0).damage).toBe(10);
    expect(computeDamage(hit(10, { type: 'ice' }), { ice: 0.5 }, new Set(), 0).damage).toBe(5);
    expect(computeDamage(hit(10), {}, new Set(['frozen']), 0).damage).toBe(15);
    expect(computeDamage(hit(10), {}, new Set(['marked']), 0).damage).toBe(12.5);
    expect(computeDamage(hit(10, { critical: true }), {}, new Set(), 0).damage).toBe(15);
  });

  it('absorbs with shields first and never goes negative', () => {
    expect(computeDamage(hit(10), {}, new Set(), 4)).toEqual({ damage: 6, absorbed: 4 });
    expect(computeDamage(hit(10), {}, new Set(), 50)).toEqual({ damage: 0, absorbed: 10 });
    expect(computeDamage(hit(10, { type: 'yin' }), { yin: -1 }, new Set(), 0).damage).toBe(0);
  });

  it('knows who is hostile to whom', () => {
    expect(hostile('party', 'enemy')).toBe(true);
    expect(hostile('party', 'party')).toBe(false);
    expect(hostile('enemy', 'neutral')).toBe(false);
  });
});

describe('Health', () => {
  it('takes damage, dies once, ignores hits while invulnerable', () => {
    const h = body(30);
    expect(h.receive(hit(10)).applied).toBe(10);
    h.grantInvulnerability(0.5);
    expect(h.receive(hit(10)).ignored).toBe(true);
    h.tick(0.6, 0.6);
    const r = h.receive(hit(50));
    expect(r.killed).toBe(true);
    expect(h.hp).toBe(0);
    expect(h.receive(hit(5)).ignored).toBe(true);
  });

  it('staggers when poise breaks and regenerates poise', () => {
    const h = body(100, { poise: 20, poiseRegen: 10 });
    expect(h.receive(hit(1, { stagger: 12 })).staggered).toBe(false);
    expect(h.receive(hit(1, { stagger: 12 })).staggered).toBe(true);
    expect(h.staggered).toBe(true);
    expect(h.canAct).toBe(false);
    h.tick(1.0, 1.0);
    expect(h.staggered).toBe(false);
  });

  it('expires statuses and shatters ice with physical blows', () => {
    const h = body(100);
    h.receive(hit(1, { type: 'ice', status: { id: 'frozen', seconds: 2 } }));
    expect(h.hasStatus('frozen')).toBe(true);
    const r = h.receive(hit(10));
    expect(r.applied).toBe(15);
    expect(h.hasStatus('frozen')).toBe(false);
    h.applyStatus({ id: 'blinded', seconds: 1 });
    h.tick(0.5, 0.5);
    expect(h.hasStatus('blinded')).toBe(true);
    h.tick(0.6, 1.1);
    expect(h.hasStatus('blinded')).toBe(false);
  });

  it('charmed enemies change sides', () => {
    const h = body(10);
    expect(h.effectiveFaction).toBe('enemy');
    h.applyStatus({ id: 'charmed', seconds: 5 });
    expect(h.effectiveFaction).toBe('party');
  });
});
