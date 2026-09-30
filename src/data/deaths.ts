/**
 * How each death looks, and what Subaru carries back from it. The cause
 * string comes from whatever killed him ('heliosphere', 'combat.dune_jackal',
 * 'fall'...); unknown causes fall back to their prefix, then 'default'.
 */
export interface DeathDef {
  /** 'light': burned away in a white flash. 'wound': collapses, the world drains. */
  style: 'light' | 'wound';
  /** Knowledge learned by dying this way (survives the return). */
  learn: string[];
}

export const DEATHS: Record<string, DeathDef> = {
  heliosphere: { style: 'light', learn: ['heliosphere.movement', 'heliosphere.glint'] },
  /** Broke the tower's rules: the Star Guardian keeps her word. */
  shaula: { style: 'light', learn: ['people.shaula_rules'] },
  /** Guessed wrong once too often in Taygeta: the stars burn. */
  taygeta: { style: 'light', learn: ['tower.taygeta_burns'] },
  'combat.sand_earthworm': { style: 'wound', learn: ['earthworm.vibration'] },
  combat: { style: 'wound', learn: [] },
  fall: { style: 'wound', learn: [] },
  default: { style: 'wound', learn: [] },
};

export function deathDef(cause: string): DeathDef {
  return DEATHS[cause] ?? DEATHS[cause.split('.')[0]!] ?? DEATHS.default!;
}

/** Places the Witch sets Subaru's return to. */
export interface CheckpointDef {
  id: string;
  area: string;
  spawn: string;
  /** Shown faintly when the return point is set, and in saves. */
  name: string;
}

export const CHECKPOINTS: Record<string, CheckpointDef> = {
  camp_night: { id: 'camp_night', area: 'tower_foot', spawn: 'camp', name: 'The camp at the tower’s foot, the first night' },
  plaza_edge: { id: 'plaza_edge', area: 'tower_foot', spawn: 'tf.plaza_edge', name: 'The edge of the plaza, the Glass Flats behind us' },
  plaza: { id: 'plaza', area: 'tower_foot', spawn: 'tf.plaza_subaru', name: 'The gate plaza, the witchbeasts dead' },
  celaeno: { id: 'celaeno', area: 'celaeno', spawn: 'gate', name: 'Celaeno, inside the tower' },
  alcyone: { id: 'alcyone', area: 'alcyone', spawn: 'green_room', name: 'The Green Room, at Rem’s side' },
  gym: { id: 'gym', area: 'dev_gym', spawn: 'default', name: 'The practice hall' },
};
