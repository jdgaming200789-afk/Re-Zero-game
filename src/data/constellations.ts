/**
 * The stars Taygeta brings down within reach. Positions are offsets in
 * degrees on the sky (x to the west/right, y up) from a reference star;
 * `mag` is apparent magnitude (smaller is brighter). Four constellations are
 * from Subaru's sky — only someone from his world could name them — and two
 * belong to this world's sky and mean nothing to him.
 *
 * Taygeta's question: "Touch upon the greatest splendour of the hero
 * destroyed by Shaula." Shaula is the scorpion's stinger; the hero it killed
 * is Orion; his greatest splendour is his brightest star, Rigel.
 */
export interface StarDef {
  id: string;
  name: string;
  x: number;
  y: number;
  mag: number;
  /** Colour (linear-ish RGB, 0..1). */
  color: [number, number, number];
}

export interface ConstellationDef {
  id: string;
  /** What Subaru calls it (null: a sky he doesn't know). */
  name: string | null;
  stars: StarDef[];
  /** Pairs of star ids joined by faint lines. */
  lines: Array<[string, string]>;
  /** Degrees to turn the figure on its plane (Orion rises lying on its side). */
  rotate?: number;
  /** Where it hangs in Taygeta: angle around the room (degrees, 0 = south). */
  at: number;
}

const BLUE: [number, number, number] = [0.72, 0.82, 1.0];
const WHITE: [number, number, number] = [0.92, 0.94, 1.0];
const YELLOW: [number, number, number] = [1.0, 0.9, 0.7];
const RED: [number, number, number] = [1.0, 0.5, 0.3];

export const TRIAL_ANSWER = 'orion.rigel';

export const CONSTELLATIONS: ConstellationDef[] = [
  {
    id: 'orion',
    name: 'Orion',
    at: 180,
    rotate: 90,
    stars: [
      { id: 'rigel', name: 'Rigel', x: 5.42, y: -7.0, mag: 0.13, color: [0.7, 0.8, 1.0] },
      { id: 'betelgeuse', name: 'Betelgeuse', x: -4.75, y: 8.6, mag: 0.5, color: RED },
      { id: 'bellatrix', name: 'Bellatrix', x: 2.75, y: 7.55, mag: 1.64, color: BLUE },
      { id: 'alnitak', name: 'Alnitak', x: -1.15, y: -0.74, mag: 1.77, color: BLUE },
      { id: 'alnilam', name: 'Alnilam', x: 0, y: 0, mag: 1.69, color: BLUE },
      { id: 'mintaka', name: 'Mintaka', x: 1.05, y: 0.9, mag: 2.23, color: BLUE },
      { id: 'saiph', name: 'Saiph', x: -2.89, y: -8.47, mag: 2.09, color: BLUE },
      { id: 'meissa', name: 'Meissa', x: 0.27, y: 11.1, mag: 3.39, color: WHITE },
    ],
    lines: [
      ['meissa', 'betelgeuse'],
      ['meissa', 'bellatrix'],
      ['betelgeuse', 'alnitak'],
      ['bellatrix', 'mintaka'],
      ['alnitak', 'alnilam'],
      ['alnilam', 'mintaka'],
      ['alnitak', 'saiph'],
      ['mintaka', 'rigel'],
    ],
  },
  {
    // On the far side of the sky from Orion, as in the story (clear of the stair).
    id: 'scorpius',
    name: 'Scorpius',
    at: 330,
    stars: [
      { id: 'antares', name: 'Antares', x: 0, y: 0, mag: 1.0, color: RED },
      { id: 'acrab', name: 'Acrab', x: 5.63, y: 6.62, mag: 2.62, color: BLUE },
      { id: 'dschubba', name: 'Dschubba', x: 6.71, y: 3.81, mag: 2.32, color: BLUE },
      { id: 'pi', name: 'Fang', x: 6.85, y: 0.32, mag: 2.89, color: BLUE },
      { id: 'tau', name: 'Paikauhale', x: -1.43, y: -1.79, mag: 2.82, color: BLUE },
      { id: 'larawag', name: 'Larawag', x: -4.29, y: -7.86, mag: 2.29, color: YELLOW },
      { id: 'mu', name: 'Xamidimura', x: -4.43, y: -11.62, mag: 3.0, color: BLUE },
      { id: 'zeta', name: 'Zeta Scorpii', x: -4.66, y: -15.93, mag: 3.6, color: YELLOW },
      { id: 'eta', name: 'Eta Scorpii', x: -7.78, y: -16.81, mag: 3.3, color: WHITE },
      { id: 'sargas', name: 'Sargas', x: -12.41, y: -16.57, mag: 1.86, color: YELLOW },
      { id: 'iota', name: 'Iota Scorpii', x: -14.96, y: -13.7, mag: 3.0, color: WHITE },
      { id: 'kappa', name: 'Girtab', x: -14.2, y: -12.6, mag: 2.39, color: BLUE },
      { id: 'shaula', name: 'Shaula', x: -12.79, y: -10.67, mag: 1.62, color: BLUE },
      { id: 'lesath', name: 'Lesath', x: -12.2, y: -10.87, mag: 2.7, color: BLUE },
    ],
    lines: [
      ['acrab', 'dschubba'],
      ['dschubba', 'pi'],
      ['dschubba', 'antares'],
      ['antares', 'tau'],
      ['tau', 'larawag'],
      ['larawag', 'mu'],
      ['mu', 'zeta'],
      ['zeta', 'eta'],
      ['eta', 'sargas'],
      ['sargas', 'iota'],
      ['iota', 'kappa'],
      ['kappa', 'shaula'],
      ['shaula', 'lesath'],
    ],
  },
  {
    id: 'dipper',
    name: 'The Big Dipper',
    at: 90,
    stars: [
      { id: 'dubhe', name: 'Dubhe', x: 10.2, y: 4.72, mag: 1.79, color: YELLOW },
      { id: 'merak', name: 'Merak', x: 10.49, y: -0.65, mag: 2.37, color: WHITE },
      { id: 'phecda', name: 'Phecda', x: 3.08, y: -3.34, mag: 2.44, color: WHITE },
      { id: 'megrez', name: 'Megrez', x: 0, y: 0, mag: 3.31, color: WHITE },
      { id: 'alioth', name: 'Alioth', x: -5.5, y: -1.07, mag: 1.77, color: WHITE },
      { id: 'mizar', name: 'Mizar', x: -9.76, y: -2.1, mag: 2.23, color: WHITE },
      { id: 'alkaid', name: 'Alkaid', x: -13.1, y: -7.72, mag: 1.86, color: BLUE },
    ],
    lines: [
      ['dubhe', 'merak'],
      ['merak', 'phecda'],
      ['phecda', 'megrez'],
      ['megrez', 'dubhe'],
      ['megrez', 'alioth'],
      ['alioth', 'mizar'],
      ['mizar', 'alkaid'],
    ],
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    at: 270,
    stars: [
      { id: 'caph', name: 'Caph', x: 5.95, y: -1.57, mag: 2.28, color: WHITE },
      { id: 'schedar', name: 'Schedar', x: 2.03, y: -4.18, mag: 2.24, color: YELLOW },
      { id: 'navi', name: 'Navi', x: 0, y: 0, mag: 2.15, color: BLUE },
      { id: 'ruchbah', name: 'Ruchbah', x: -3.64, y: -0.48, mag: 2.68, color: WHITE },
      { id: 'segin', name: 'Segin', x: -7.21, y: 2.95, mag: 3.37, color: BLUE },
    ],
    lines: [
      ['caph', 'schedar'],
      ['schedar', 'navi'],
      ['navi', 'ruchbah'],
      ['ruchbah', 'segin'],
    ],
  },
  {
    // This world's sky: a crooked "lantern" nobody from Earth would know.
    id: 'lantern',
    name: null,
    at: 135,
    stars: [
      { id: 'a', name: '', x: 0, y: 0, mag: 1.4, color: YELLOW },
      { id: 'b', name: '', x: 3.5, y: 2.2, mag: 2.4, color: WHITE },
      { id: 'c', name: '', x: 6.1, y: -0.8, mag: 2.1, color: BLUE },
      { id: 'd', name: '', x: 3.2, y: -4.4, mag: 2.8, color: WHITE },
      { id: 'e', name: '', x: -0.4, y: -5.6, mag: 1.9, color: RED },
      { id: 'f', name: '', x: 2.8, y: 6.9, mag: 3.2, color: BLUE },
    ],
    lines: [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
      ['e', 'a'],
      ['b', 'f'],
    ],
  },
  {
    id: 'ring',
    name: null,
    at: 225,
    stars: [
      { id: 'a', name: '', x: 0, y: 4, mag: 1.2, color: BLUE },
      { id: 'b', name: '', x: 3.8, y: 1.2, mag: 2.6, color: WHITE },
      { id: 'c', name: '', x: 2.4, y: -3.2, mag: 2.2, color: YELLOW },
      { id: 'd', name: '', x: -2.4, y: -3.2, mag: 2.9, color: WHITE },
      { id: 'e', name: '', x: -3.8, y: 1.2, mag: 2.0, color: BLUE },
    ],
    lines: [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
      ['e', 'a'],
    ],
  },
];

/** Stable id for a star in the trial: `<constellation>.<star>`. */
export function starKey(c: ConstellationDef, s: StarDef): string {
  return `${c.id}.${s.id}`;
}

/**
 * Lay a constellation onto its vertical plane in Taygeta: returns metres
 * (x across the plane, y height above the floor) that fit inside a
 * width × height window at a comfortable reaching height.
 */
export function layoutConstellation(c: ConstellationDef, width = 4.2, height = 1.55, baseY = 0.95): Map<string, { x: number; y: number }> {
  const rot = ((c.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts = c.stars.map((s) => ({ id: s.id, x: s.x * cos - s.y * sin, y: s.x * sin + s.y * cos }));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const scale = Math.min(width / Math.max(1e-3, maxX - minX), height / Math.max(1e-3, maxY - minY));
  const cx = (minX + maxX) / 2;
  const out = new Map<string, { x: number; y: number }>();
  for (const p of pts) out.set(p.id, { x: (p.x - cx) * scale, y: baseY + (p.y - minY) * scale });
  return out;
}
