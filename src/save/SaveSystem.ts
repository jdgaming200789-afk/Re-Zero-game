import { Vector3 } from 'three';
import { SubaruCombat } from '../combat/SubaruCombat';
import { createLogger } from '../core/Log';
import type { FlagValue } from '../core/events/GameEvents';
import type { GameContext, GameSystem } from '../game/GameContext';
import type { ReturnPoint } from '../story/rbd/Checkpoints';
import type { FlagSnapshot } from '../world/WorldStateManager';
import { safeStorage as storage } from './SafeStorage';

const log = createLogger('Saves');

export const SAVE_VERSION = 1;
export const SAVE_SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

export interface SaveData {
  version: number;
  slot: SaveSlot;
  savedAt: number;
  playtime: number;
  area: string;
  position: [number, number, number];
  yaw: number;
  /** Every flag: world, knowledge and meta. */
  flags: FlagSnapshot;
  returnPoint: ReturnPoint | null;
  seenLines: string[];
  trackedQuest: string | null;
  summary: { area: string; loop: number; quest: string | null; returnPoint: string | null };
}

const KEY = (slot: string) => `rzp.save.${slot}`;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFlag = (v: unknown): v is FlagValue => typeof v === 'boolean' || typeof v === 'string' || isNum(v);

function validFlags(v: unknown): v is FlagSnapshot {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(isFlag);
}

/**
 * Strict structural check of a save read back from storage. A corrupt,
 * tampered or future-version save is rejected rather than half-loaded.
 */
export function validateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.version !== SAVE_VERSION) return null;
  if (!SAVE_SLOTS.includes(d.slot as SaveSlot)) return null;
  if (!isNum(d.savedAt) || !isNum(d.playtime) || !isNum(d.yaw)) return null;
  if (typeof d.area !== 'string' || !d.area) return null;
  if (!Array.isArray(d.position) || d.position.length !== 3 || !d.position.every(isNum)) return null;
  if (!validFlags(d.flags)) return null;
  if (d.returnPoint !== null) {
    const r = d.returnPoint as Record<string, unknown>;
    if (!r || typeof r.id !== 'string' || typeof r.area !== 'string' || typeof r.spawn !== 'string' || typeof r.name !== 'string' || !isNum(r.loop) || !validFlags(r.flags)) return null;
  }
  if (!Array.isArray(d.seenLines) || !d.seenLines.every((s) => typeof s === 'string')) return null;
  if (d.trackedQuest !== null && typeof d.trackedQuest !== 'string') return null;
  if (!d.summary || typeof d.summary !== 'object') return null;
  return d as unknown as SaveData;
}

/**
 * Save slots. A save is a snapshot of every flag (the world, Subaru's
 * knowledge, loop bookkeeping), where he stands, his current return point
 * and a few presentation details. Settings live elsewhere and are never
 * part of a save. The autosave is written whenever a return point is set.
 */
export class SaveSystem implements GameSystem {
  readonly name = 'saves';
  playtime = 0;

  constructor(private readonly game: GameContext) {}

  update(): void {
    const m = this.game.mode;
    if (m !== 'menu' && m !== 'loading' && m !== 'title' && m !== 'boot') this.playtime += this.game.time.unscaledDt;
  }

  /** Why saving isn't possible right now, if it isn't. */
  blocked(): string | null {
    const g = this.game;
    if (!g.player || !g.scenes.current) return 'Nothing to save yet.';
    if (g.mode === 'combat' || g.combat.inCombat) return 'Can’t save during a fight.';
    if (g.mode === 'dialogue' || g.mode === 'cinematic' || g.mode === 'death') return 'Can’t save right now.';
    return null;
  }

  capture(slot: SaveSlot): SaveData {
    const g = this.game;
    const p = g.player!.entity.object3D.position;
    const tracked = g.quests.tracked;
    const rp = g.checkpoints.current;
    return {
      version: SAVE_VERSION,
      slot,
      savedAt: Date.now(),
      playtime: Math.round(this.playtime),
      area: g.scenes.current!.id,
      position: [p.x, p.y, p.z],
      yaw: g.player!.yaw,
      flags: g.state.snapshot(),
      returnPoint: rp ? { ...rp, flags: { ...rp.flags } } : null,
      seenLines: Array.from(g.dialogue.seen),
      trackedQuest: tracked,
      summary: {
        area: g.scenes.current!.displayName,
        loop: g.state.num('meta.loop', 1),
        quest: tracked ? (g.quests.get(tracked)?.title ?? null) : null,
        returnPoint: rp?.name ?? null,
      },
    };
  }

  save(slot: SaveSlot): { ok: boolean; reason?: string } {
    const why = slot === 'auto' ? (this.game.player && this.game.scenes.current ? null : 'Nothing to save yet.') : this.blocked();
    if (why) return { ok: false, reason: why };
    const data = this.capture(slot);
    const ok = storage.setItem(KEY(slot), JSON.stringify(data));
    log.info(`Saved ${slot}${ok ? '' : ' (memory only)'}`);
    return { ok: true, reason: ok ? undefined : 'Saved for this session only (storage unavailable).' };
  }

  autosave(): void {
    this.save('auto');
  }

  read(slot: SaveSlot): SaveData | null {
    const raw = storage.getItem(KEY(slot));
    if (!raw) return null;
    try {
      return validateSave(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  list(): Array<{ slot: SaveSlot; data: SaveData | null }> {
    return SAVE_SLOTS.map((slot) => ({ slot, data: this.read(slot) }));
  }

  delete(slot: SaveSlot): void {
    storage.removeItem(KEY(slot));
  }

  /** Restore a save: every flag, the return point, the area, Subaru where he stood, the party. */
  async load(slot: SaveSlot): Promise<boolean> {
    const data = this.read(slot);
    if (!data) return false;
    const g = this.game;
    log.info(`Loading ${slot}`);
    g.dialogue.abort();
    g.chatter.stop();
    g.combat.reset();
    g.state.restore(data.flags);
    g.checkpoints.current = data.returnPoint ? { ...data.returnPoint, flags: { ...data.returnPoint.flags } } : null;
    g.dialogue.seen.clear();
    for (const id of data.seenLines) g.dialogue.seen.add(id);
    this.playtime = data.playtime;
    const at = new Vector3(...data.position);
    await g.scenes.goto(data.area, 'default', {
      reload: true,
      loadingScreen: true,
      beforeReveal: async () => {
        const p = g.player;
        if (p) {
          p.placeAt(at, data.yaw);
          g.camera.follow.snapBehind(p.followTarget);
          p.entity.get(SubaruCombat)?.restore();
        }
        await g.party.respawnAll();
      },
    });
    if (data.trackedQuest) g.quests.track(data.trackedQuest);
    return true;
  }
}
