import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { hostile } from '../src/combat/Damage';
import { Telegraphs } from '../src/combat/Telegraphs';
import { ENEMIES, enemyDef } from '../src/data/enemies';
import type { EnemyController } from '../src/enemies/EnemyController';
import { PackDirector } from '../src/enemies/PackDirector';

/** Just enough of an EnemyController for the pack director. */
function member(x = 0, z = 0) {
  const statuses = new Set<string>();
  const m = {
    alive: true,
    actor: { position: new Vector3(x, 0, z) },
    health: { canAct: true, hasStatus: (s: string) => statuses.has(s) },
    statuses,
  };
  return m as unknown as EnemyController & { alive: boolean; statuses: Set<string> };
}

describe('PackDirector', () => {
  it('grants at most maxAttackers tokens and frees them on release', () => {
    const [a, b, c] = [member(), member(), member()];
    const pack = new PackDirector([a, b, c], 2);
    expect(pack.request(a)).toBe(true);
    expect(pack.request(b)).toBe(true);
    expect(pack.request(c)).toBe(false);
    expect(pack.request(a)).toBe(true); // already holding one
    pack.release(a);
    expect(pack.request(c)).toBe(true);
  });

  it('reclaims tokens held by the dead and the charmed', () => {
    const [a, b, c] = [member(), member(), member()];
    const pack = new PackDirector([a, b, c], 2);
    pack.request(a);
    pack.request(b);
    a.alive = false;
    expect(pack.request(c)).toBe(true);
    const d = member();
    const pack2 = new PackDirector([b, c, d], 1);
    pack2.request(b);
    b.statuses.add('charmed');
    expect(pack2.request(d)).toBe(true);
  });

  it('lets whoever has waited longest go first', () => {
    const [a, b, c] = [member(), member(), member()];
    const pack = new PackDirector([a, b, c], 1);
    pack.request(a);
    for (let i = 0; i < 10; i++) pack.request(b); // b keeps asking
    pack.release(a);
    expect(pack.request(c)).toBe(false); // c only just arrived
    expect(pack.request(b)).toBe(true);
  });

  it('spreads circling slots evenly and pushes crowded members apart', () => {
    const [a, b] = [member(0, 0), member(0.5, 0)];
    const pack = new PackDirector([a, b]);
    expect(pack.slotAngle(a)).toBe(0);
    expect(pack.slotAngle(b)).toBeCloseTo(Math.PI);
    const steer = new Vector3();
    pack.addSpacing(a, steer);
    expect(steer.x).toBeLessThan(0);
  });
});

describe('Telegraphs', () => {
  const t = new Telegraphs(new Group());
  const at = (x: number, z: number) => new Vector3(x, 0, z);

  it('covers circles, cones and lines with the victim radius', () => {
    const circle = { kind: 'circle' as const, center: at(0, 0), radius: 3 };
    expect(t.contains(circle, at(3.2, 0), 0.3)).toBe(true);
    expect(t.contains(circle, at(3.5, 0), 0.3)).toBe(false);

    const cone = { kind: 'cone' as const, origin: at(0, 0), dir: new Vector3(0, 0, 1), reach: 2, arc: 70 };
    expect(t.contains(cone, at(0, 1.5), 0.3)).toBe(true);
    expect(t.contains(cone, at(0, -1.5), 0.3)).toBe(false); // behind
    expect(t.contains(cone, at(1.5, 0.2), 0.3)).toBe(false); // far outside the arc

    const line = { kind: 'line' as const, origin: at(0, 0), dir: new Vector3(1, 0, 0), length: 6, width: 1 };
    expect(t.contains(line, at(5, 0.4), 0.3)).toBe(true);
    expect(t.contains(line, at(5, 1.2), 0.3)).toBe(false);
    expect(t.contains(line, at(7, 0), 0.3)).toBe(false);
  });

  it('only warns bodies the source is hostile to, and expires after impact', () => {
    const tg = new Telegraphs(new Group());
    tg.add({ kind: 'circle', center: at(0, 0), radius: 2 }, 1, 'enemy', 0, 1);
    expect(tg.threatening(at(1, 0), 0.4, 'party', hostile)).toHaveLength(1);
    expect(tg.threatening(at(1, 0), 0.4, 'enemy', hostile)).toHaveLength(0);
    tg.update(0.5);
    expect(tg.list).toHaveLength(1);
    tg.update(1.2);
    expect(tg.list).toHaveLength(0);
  });
});

describe('enemy data', () => {
  it('is well-formed', () => {
    for (const [id, d] of Object.entries(ENEMIES)) {
      expect(d.id).toBe(id);
      expect(d.maxHp).toBeGreaterThan(0);
      for (const a of d.attacks) {
        expect(a.range[0]).toBeLessThanOrEqual(a.range[1]);
        expect(a.windup).toBeGreaterThan(0.2); // readable
      }
    }
    expect(() => enemyDef('nope')).toThrow();
  });

  it('makes the earthworm a light problem, not a damage race', () => {
    const w = enemyDef('sand_earthworm');
    expect(w.elite).toBe(true);
    expect(w.resist?.physical).toBeLessThan(0.5);
    expect(w.resist?.light ?? 1).toBe(1);
  });
});
