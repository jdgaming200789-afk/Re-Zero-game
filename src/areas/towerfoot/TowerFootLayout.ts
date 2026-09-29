import { Vector3 } from 'three';
import { clamp } from '../../core/math/MathUtil';
import { Noise2D } from '../../world/terrain/Noise2D';

/**
 * Geography of the tower's foot (three.js coordinates, metres, +Z toward
 * the camp, -Z toward the tower).
 *
 *            dunes                     dunes
 *   ┌──────────────────────── tower (0, -170) ─────┐
 *   │            paved plaza   gate z≈-128          │
 *   │            stairs down to z≈-106              │
 *   │   ~~~~~~~~ the Glass Flats z∈[-84,-26] ~~~~~~ │  ← Heliosphere kill zone
 *   │      outer ruins / colonnade z∈[-26,34]       │
 *   │                 camp (6, 52)                  │
 *   └────────────── dunes / Sand Time ──────────────┘
 */
export const TOWER_CENTER = new Vector3(0, 0, -170);
export const TOWER_RADIUS = 42;
export const GATE_FRONT_Z = TOWER_CENTER.z + TOWER_RADIUS; // -128
export const STAIRS_FOOT_Z = GATE_FRONT_Z + 22; // -106
export const CAMP = new Vector3(6, 0, 52);
export const FLATS = { minX: -54, maxX: 54, minZ: -84, maxZ: -26 };
export const CORRIDOR_HALF_WIDTH = 62;
export const CORRIDOR_FRONT_Z = 80;
export const SUMMIT = new Vector3(TOWER_CENTER.x, 400, TOWER_CENTER.z);

const noise = new Noise2D(20251);
const detail = new Noise2D(7);

function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 0..1 inside the glass flats (noisy, melted-looking edge). */
export function flatsMask(x: number, z: number): number {
  const edge = noise.fbm(x * 0.05, z * 0.05, 3) * 7;
  const dx = Math.max(FLATS.minX - x, x - FLATS.maxX, 0);
  const dz = Math.max(FLATS.minZ - z, z - FLATS.maxZ, 0);
  const outside = Math.hypot(dx, dz) - edge;
  // Also rounded corners: distance inside the box counts negative.
  const inside = Math.min(x - FLATS.minX, FLATS.maxX - x, z - FLATS.minZ, FLATS.maxZ - z);
  const sd = outside > 0 ? outside : -inside - edge * 0.3;
  return 1 - smooth(-3, 3, sd);
}

/** 0..1 paved plaza around the tower's base and the gate approach. */
export function plazaMask(x: number, z: number): number {
  const d = Math.hypot(x - TOWER_CENTER.x, z - TOWER_CENTER.z);
  const ring = 1 - smooth(66, 74, d + noise.fbm(x * 0.08, z * 0.08, 2) * 5);
  const approach = (1 - smooth(34, 40, Math.abs(x))) * (1 - smooth(-90, -84, z));
  return Math.max(ring, approach * (z < -80 ? 1 : 0));
}

/** The old road through the ruins: broken paving from the camp toward the flats. */
export function roadMask(x: number, z: number): number {
  if (z > 44 || z < -30) return 0;
  const wobble = noise.noise(z * 0.03, 3.1) * 4;
  return (1 - smooth(4.5, 6.5, Math.abs(x - wobble))) * (0.55 + 0.45 * smooth(-0.1, 0.4, detail.noise(x * 0.25, z * 0.25)));
}

function corridorDistance(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - CORRIDOR_HALF_WIDTH);
  const dz = Math.max(0, z - CORRIDOR_FRONT_Z);
  // Around the tower the playable space is the plaza circle.
  const towerSide = z < -96 ? Math.max(0, Math.hypot(x - TOWER_CENTER.x, z - TOWER_CENTER.z) - 76) : 0;
  return Math.max(Math.hypot(dx, dz), towerSide);
}

export function heightAt(x: number, z: number): number {
  // Wind-aligned dunes (wind from +X): stretch noise across the wind.
  const u = x * 0.9 + z * 0.35;
  const v = -x * 0.35 + z * 0.9;
  const dunes = noise.ridged(u / 110, v / 55, 4) * 26 + noise.fbm(x / 260, z / 260, 3) * 12;
  const ripples = detail.fbm(x / 22, z / 22, 3) * 0.7;
  const d = corridorDistance(x, z);
  const rim = smooth(0, 55, d);
  let h = ripples * (1 - rim * 0.5) + rim * (dunes + 4) + d * 0.08;
  // Gentle rise the camp sits on (a vantage point toward the tower).
  h += 1.4 * Math.exp(-((x - CAMP.x) ** 2 + (z - CAMP.z) ** 2) / 900);
  // The flats: a slightly sunken basin of fused glass.
  const f = flatsMask(x, z);
  h = h * (1 - f) + (-0.45 + detail.fbm(x / 9, z / 9, 2) * 0.08) * f;
  // Plaza: level with the base of the tower stairs.
  const p = plazaMask(x, z);
  h = h * (1 - p) + (0.02 + detail.noise(x / 6, z / 6) * 0.03) * p;
  return h;
}

export function splatAt(x: number, z: number): [number, number, number] {
  const glass = flatsMask(x, z);
  const sandCover = smooth(0.1, 0.55, noise.fbm(x * 0.06 + 40, z * 0.06, 3) * 0.5 + 0.5);
  const stone = Math.max(plazaMask(x, z) * (1 - sandCover * 0.55), roadMask(x, z) * (1 - sandCover * 0.7));
  const g = glass * (1 - stone);
  const s = Math.max(0, 1 - g - stone);
  return [s, g, stone];
}
