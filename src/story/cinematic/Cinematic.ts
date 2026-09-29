import type { MusicState } from '../../core/events/GameEvents';
import type { EasingName } from '../../core/math/MathUtil';
import { validateCondition, type Condition } from '../Conditions';
import type { DialogueLine } from '../dialogue/Dialogue';
import { validateEffect, type Effect } from '../Effects';

export type Vec3 = [number, number, number];

/**
 * A place in the scene:
 *   [x, y, z]                       world coordinates
 *   '@camp.fire'                    an area spawn / marker
 *   'emilia'                        a character (feet, or head where a gaze is meant)
 *   { of: 'emilia', offset: [...] } relative to a character, in their local
 *                                   frame (x left/right, y up, z forward)
 */
export type PlaceRef = Vec3 | string | { of: string; offset?: Vec3; socket?: 'head' | 'chest' | 'feet' };

export interface ShotSpec {
  from: PlaceRef;
  at: PlaceRef;
  fov?: number;
  /** Slow move in camera space (m/s): [right, up, back]. */
  drift?: Vec3;
  sway?: number;
  /** Focus on the `at` point. */
  dof?: boolean;
}

export type CineStep =
  | { do: 'fade'; to: number; seconds?: number; color?: string; wait?: boolean }
  | { do: 'letterbox'; on: boolean }
  | { do: 'title'; title: string; sub?: string; kicker?: string; seconds?: number; wait?: boolean }
  | { do: 'shot'; shot: ShotSpec; blend?: number; ease?: EasingName }
  | { do: 'follow'; blend?: number }
  | { do: 'wait'; seconds: number }
  | { do: 'place'; who: string; at: PlaceRef; face?: PlaceRef | number }
  | { do: 'move'; who: string; to: PlaceRef; speed?: 'walk' | 'run' | number; wait?: boolean }
  | { do: 'face'; who: string; to: PlaceRef; wait?: boolean }
  | { do: 'look'; who: string; at: PlaceRef | null }
  | { do: 'anim'; who: string; clip: string; wait?: boolean; hold?: boolean }
  | { do: 'expr'; who: string; expression: string; seconds?: number }
  | { do: 'say'; lines: DialogueLine[]; camera?: 'auto' | 'keep' }
  | { do: 'dialogue'; id: string; camera?: 'auto' | 'keep' }
  | { do: 'effects'; effects: Effect[] }
  /** Wait until party membership changes have spawned everyone. */
  | { do: 'party' }
  | { do: 'music'; state: MusicState }
  | { do: 'shake'; strength: number; seconds: number }
  | { do: 'if'; cond: Condition; then: CineStep[]; else?: CineStep[] }
  | { do: 'parallel'; steps: CineStep[] };

export interface CinematicDef {
  id: string;
  letterbox?: boolean;
  /** Default true. */
  skippable?: boolean;
  steps: CineStep[];
  /** Applied at the end whether watched or skipped. */
  onEnd?: Effect[];
}

export function validateCinematic(def: CinematicDef, known: { dialogues: Set<string>; characters: Set<string>; quests: Set<string> }): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${def.id}: ${m}`);
  const who = (id: string, i: string) => {
    if (!known.characters.has(id)) err(`${i}: unknown character "${id}"`);
  };
  const place = (p: PlaceRef | null | number | undefined, i: string) => {
    if (p === null || p === undefined || typeof p === 'number') return;
    if (Array.isArray(p)) {
      if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) err(`${i}: bad coordinates`);
    } else if (typeof p === 'string') {
      if (!p.startsWith('@')) who(p, i);
    } else who(p.of, i);
  };
  const walk = (steps: CineStep[], path: string) =>
    steps.forEach((s, k) => {
      const i = `${path}${k}:${s.do}`;
      switch (s.do) {
        case 'shot':
          place(s.shot.from, i);
          place(s.shot.at, i);
          break;
        case 'place':
          who(s.who, i);
          place(s.at, i);
          place(s.face, i);
          break;
        case 'move':
          who(s.who, i);
          place(s.to, i);
          break;
        case 'face':
          who(s.who, i);
          place(s.to, i);
          break;
        case 'look':
          who(s.who, i);
          place(s.at, i);
          break;
        case 'anim':
        case 'expr':
          who(s.who, i);
          break;
        case 'say':
          for (const l of s.lines) if (l.speaker) who(l.speaker, i);
          break;
        case 'dialogue':
          if (!known.dialogues.has(s.id)) err(`${i}: unknown dialogue "${s.id}"`);
          break;
        case 'effects':
          for (const e of s.effects) {
            try {
              validateEffect(e, known);
            } catch (x) {
              err(`${i}: ${(x as Error).message}`);
            }
          }
          break;
        case 'if':
          try {
            validateCondition(s.cond);
          } catch (x) {
            err(`${i}: ${(x as Error).message}`);
          }
          walk(s.then, `${i}.then.`);
          walk(s.else ?? [], `${i}.else.`);
          break;
        case 'parallel':
          walk(s.steps, `${i}.`);
          break;
        default:
          break;
      }
    });
  walk(def.steps, '');
  return errors;
}
