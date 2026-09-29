import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS, TRIAL_ANSWER, layoutConstellation, starKey } from '../src/data/constellations';
import { ORION_STARS } from '../src/render/sky/NightSky';

describe('Taygeta constellations', () => {
  it('has a unique key for every star, and the answer is one of them', () => {
    const keys = CONSTELLATIONS.flatMap((c) => c.stars.map((s) => starKey(c, s)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(TRIAL_ANSWER);
  });

  it('only draws lines between stars that exist', () => {
    for (const c of CONSTELLATIONS) {
      const ids = new Set(c.stars.map((s) => s.id));
      for (const [a, b] of c.lines) {
        expect(ids.has(a), `${c.id}: ${a}`).toBe(true);
        expect(ids.has(b), `${c.id}: ${b}`).toBe(true);
      }
    }
  });

  it('makes Rigel the greatest splendour of Orion (its brightest star)', () => {
    const orion = CONSTELLATIONS.find((c) => c.id === 'orion')!;
    const brightest = [...orion.stars].sort((a, b) => a.mag - b.mag)[0]!;
    expect(`orion.${brightest.id}`).toBe(TRIAL_ANSWER);
    // Betelgeuse is the tempting wrong answer: red, big, and second.
    expect([...orion.stars].sort((a, b) => a.mag - b.mag)[1]!.id).toBe('betelgeuse');
  });

  it('includes the star called Shaula in the scorpion, far across the room from Orion', () => {
    const scorpius = CONSTELLATIONS.find((c) => c.id === 'scorpius')!;
    expect(scorpius.stars.some((s) => s.name === 'Shaula')).toBe(true);
    const orion = CONSTELLATIONS.find((c) => c.id === 'orion')!;
    const apart = Math.abs(((scorpius.at - orion.at + 540) % 360) - 180);
    expect(apart).toBeGreaterThanOrEqual(120);
  });

  it('lays every figure out within arm’s reach on its page', () => {
    for (const c of CONSTELLATIONS) {
      const layout = layoutConstellation(c, 4.2, 1.55, 0.95);
      for (const p of layout.values()) {
        expect(p.y).toBeGreaterThanOrEqual(0.95 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(0.95 + 1.55 + 1e-6);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(2.1 + 1e-6);
      }
    }
  });

  it('keeps the pages apart and clear of the stairwell at the south', () => {
    const angles = CONSTELLATIONS.map((c) => c.at);
    for (let i = 0; i < angles.length; i++) {
      const toStair = Math.min(angles[i]!, 360 - angles[i]!);
      expect(toStair, CONSTELLATIONS[i]!.id).toBeGreaterThanOrEqual(25);
      for (let j = i + 1; j < angles.length; j++) {
        const d = Math.abs(((angles[i]! - angles[j]! + 540) % 360) - 180);
        expect(d).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('matches the Orion painted into the night sky', () => {
    const orion = CONSTELLATIONS.find((c) => c.id === 'orion')!;
    for (const s of ORION_STARS) {
      const t = orion.stars.find((x) => x.name === s.name);
      expect(t, s.name).toBeDefined();
      expect(t!.x).toBeCloseTo(s.x, 2);
      expect(t!.y).toBeCloseTo(s.y, 2);
    }
  });
});
