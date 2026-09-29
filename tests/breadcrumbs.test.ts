import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '../src/party/Breadcrumbs';

describe('Breadcrumbs', () => {
  it('drops crumbs at the configured spacing', () => {
    const b = new Breadcrumbs(16, 0.5);
    b.reset(new Vector3(0, 0, 0));
    for (let z = 0.1; z <= 3.01; z += 0.1) b.record(new Vector3(0, 0, z));
    expect(b.length).toBeGreaterThanOrEqual(6);
    expect(3.0 - b.point(0).z).toBeLessThan(0.5 + 1e-6);
  });

  it('samples back along a corner path', () => {
    const b = new Breadcrumbs(32, 0.25);
    b.reset(new Vector3(0, 0, 0));
    // Walk +Z for 2 m, then +X for 2 m.
    for (let z = 0.25; z <= 2.001; z += 0.25) b.record(new Vector3(0, 0, z));
    for (let x = 0.25; x <= 2.001; x += 0.25) b.record(new Vector3(x, 0, 2));
    const pos = new Vector3();
    const dir = new Vector3();
    b.sampleBack(new Vector3(2, 0, 2), 3, new Vector3(0, 0, 1), pos, dir);
    // 3 m back: 2 m along X to the corner, then 1 m down Z.
    expect(pos.x).toBeCloseTo(0, 3);
    expect(pos.z).toBeCloseTo(1, 3);
    expect(dir.z).toBeCloseTo(1, 3);
  });

  it('extrapolates behind when the trail is short', () => {
    const b = new Breadcrumbs(8, 0.3);
    b.reset(new Vector3(0, 0, 0));
    const pos = new Vector3();
    const dir = new Vector3();
    b.sampleBack(new Vector3(0, 0, 0), 2, new Vector3(1, 0, 0), pos, dir);
    expect(pos.x).toBeCloseTo(-2, 3);
  });

  it('restarts after a teleport-sized jump', () => {
    const b = new Breadcrumbs(8, 0.3);
    b.reset(new Vector3(0, 0, 0));
    b.record(new Vector3(0, 0, 1));
    b.record(new Vector3(50, 0, 0));
    expect(b.length).toBe(1);
    expect(b.point(0).x).toBe(50);
  });
});
