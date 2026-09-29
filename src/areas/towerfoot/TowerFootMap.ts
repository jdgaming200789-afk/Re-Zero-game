import type { AreaMap } from '../../scene/Area';
import { CAMP, FLATS_COVER, GATE_FRONT_Z, STAIRS_FOOT_Z, TOWER_CENTER, TOWER_RADIUS, flatsMask, heightAt, plazaMask, roadMask } from './TowerFootLayout';

const BOUNDS = { minX: -78, maxX: 78, minZ: -218, maxZ: 92 };
const RES = 0.8; // metres per map pixel

let cached: HTMLCanvasElement | null = null;

/**
 * The tower's foot as a hand-inked chart: dunes shaded by their slopes, the
 * glass of the flats in deep blue, the paved plaza and the old road. Painted
 * once from the same functions that shape the terrain, so the map can never
 * disagree with the world.
 */
function raster(): HTMLCanvasElement {
  if (cached) return cached;
  const w = Math.round((BOUNDS.maxX - BOUNDS.minX) / RES);
  const h = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / RES);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    const z = BOUNDS.minZ + (py + 0.5) * RES;
    for (let px = 0; px < w; px++) {
      const x = BOUNDS.minX + (px + 0.5) * RES;
      const hgt = heightAt(x, z);
      // Light from the upper left, from the height gradient.
      const dx = heightAt(x + RES, z) - hgt;
      const dz = heightAt(x, z + RES) - hgt;
      const shade = Math.max(0.55, Math.min(1.25, 1 - (dx + dz) * 0.9));
      let r = 176, g = 150, b = 112; // sand
      const glass = flatsMask(x, z);
      const stone = Math.max(plazaMask(x, z), roadMask(x, z) * 0.8);
      r = r * (1 - glass) + 34 * glass;
      g = g * (1 - glass) + 48 * glass;
      b = b * (1 - glass) + 78 * glass;
      r = r * (1 - stone) + 120 * stone;
      g = g * (1 - stone) + 114 * stone;
      b = b * (1 - stone) + 102 * stone;
      // High dunes at the edges fade into the dark.
      const edge = Math.max(0, Math.min(1, (hgt - 6) / 30));
      const k = shade * (1 - edge * 0.55);
      const i = (py * w + px) * 4;
      d[i] = r * k;
      d[i + 1] = g * k;
      d[i + 2] = b * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cached = c;
  return c;
}

export function towerFootMap(): AreaMap {
  return {
    bounds: BOUNDS,
    paint(ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster(), BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ);
      // The tower.
      ctx.fillStyle = '#3a3a44';
      ctx.strokeStyle = 'rgba(243, 226, 176, 0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(TOWER_CENTER.x, TOWER_CENTER.z, TOWER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(TOWER_CENTER.x, TOWER_CENTER.z, TOWER_RADIUS * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // The great gate and its stairs.
      ctx.fillStyle = 'rgba(243, 226, 176, 0.9)';
      ctx.fillRect(-6, GATE_FRONT_Z - 2, 12, 3);
      ctx.fillStyle = 'rgba(200, 190, 170, 0.5)';
      ctx.fillRect(-9, GATE_FRONT_Z + 1, 18, STAIRS_FOOT_Z - GATE_FRONT_Z - 1);
      // Ruins on the flats: the only cover out there.
      for (const [, x, z, rot, sc, r] of FLATS_COVER) {
        ctx.save();
        ctx.translate(x, z);
        ctx.fillStyle = 'rgba(120, 190, 150, 0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(-rot);
        ctx.fillStyle = '#b8b0a2';
        ctx.fillRect(-2.2 * sc, -0.8 * sc, 4.4 * sc, 1.6 * sc);
        ctx.restore();
      }
      // The camp: fire and carriage.
      ctx.fillStyle = '#f0a060';
      ctx.beginPath();
      ctx.arc(CAMP.x - 3, CAMP.z - 6, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(CAMP.x, CAMP.z - 4, 4, 2.4);
    },
    labels: [
      { text: 'The Pleiades Watchtower', x: TOWER_CENTER.x, z: TOWER_CENTER.z, size: 1.2 },
      { text: 'Gate Plaza', x: 0, z: STAIRS_FOOT_Z + 8 },
      { text: 'The Glass Flats', x: 0, z: -58, size: 1.1 },
      { text: 'Outer Ruins', x: -34, z: 14 },
      { text: 'Camp', x: CAMP.x + 10, z: CAMP.z - 2 },
    ],
  };
}
