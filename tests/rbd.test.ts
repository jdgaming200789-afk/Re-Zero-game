import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/EventBus';
import type { GameEvents } from '../src/core/events/GameEvents';
import { CHECKPOINTS, DEATHS, deathDef } from '../src/data/deaths';
import { KNOWLEDGE } from '../src/data/knowledge';
import { FLATS_COVER, flatsMask, inFlatsCover } from '../src/areas/towerfoot/TowerFootLayout';
import { SAVE_VERSION, validateSave, type SaveData } from '../src/save/SaveSystem';
import { WorldStateManager } from '../src/world/WorldStateManager';

function save(extra: Partial<SaveData> = {}): SaveData {
  return {
    version: SAVE_VERSION,
    slot: 'slot1',
    savedAt: 1,
    playtime: 60,
    area: 'tower_foot',
    position: [1, 2, 3],
    yaw: 0.5,
    flags: { 'party.emilia': true, 'know.heliosphere.movement': true, 'meta.loop': 2, 'quest.watchtower': 'active' },
    returnPoint: { id: 'camp_night', area: 'tower_foot', spawn: 'camp', name: 'Camp', flags: { 'party.emilia': true }, loop: 1 },
    seenLines: ['camp.opening.start.0'],
    trackedQuest: 'watchtower',
    summary: { area: 'The Tower’s Foot', loop: 2, quest: 'The Watchtower in the Sand', returnPoint: 'Camp' },
    ...extra,
  };
}

describe('Return by Death rewind', () => {
  it('restores the world at the return point but keeps knowledge and loop bookkeeping', () => {
    const s = new WorldStateManager(new EventBus<GameEvents>());
    s.set('party.emilia', true);
    s.set('quest.watchtower', 'active');
    s.set('meta.loop', 1);
    const returnPoint = s.snapshot(['world']);
    // The world moves on...
    s.set('quest.watchtower.ruins', true);
    s.set('visited.tf.ruins', true);
    s.set('dlg.camp.talk.emilia.done', true);
    // ...Subaru learns something, and dies.
    s.set('know.heliosphere.movement', true);
    s.set('meta.loop', 2);
    s.restore(returnPoint, ['world']);
    expect(s.bool('quest.watchtower.ruins')).toBe(false);
    expect(s.bool('visited.tf.ruins')).toBe(false);
    expect(s.bool('dlg.camp.talk.emilia.done')).toBe(false);
    expect(s.str('quest.watchtower')).toBe('active');
    expect(s.bool('party.emilia')).toBe(true);
    expect(s.bool('know.heliosphere.movement')).toBe(true);
    expect(s.num('meta.loop')).toBe(2);
  });

  it('every death teaches real knowledge; unknown causes fall back sensibly', () => {
    for (const d of Object.values(DEATHS)) for (const k of d.learn) expect(KNOWLEDGE[k]).toBeTruthy();
    expect(deathDef('heliosphere').style).toBe('light');
    expect(deathDef('combat.dune_jackal')).toBe(DEATHS.combat);
    expect(deathDef('something.else')).toBe(DEATHS.default);
    for (const [id, c] of Object.entries(CHECKPOINTS)) expect(c.id).toBe(id);
  });
});

describe('saves', () => {
  it('accepts a well-formed save', () => {
    expect(validateSave(JSON.parse(JSON.stringify(save())))).not.toBeNull();
    expect(validateSave(save({ returnPoint: null, trackedQuest: null }))).not.toBeNull();
  });

  it('rejects corrupt, tampered or future saves', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave('nope')).toBeNull();
    expect(validateSave(save({ version: SAVE_VERSION + 1 }))).toBeNull();
    expect(validateSave(save({ slot: 'hacked' as never }))).toBeNull();
    expect(validateSave(save({ position: [1, 2] as never }))).toBeNull();
    expect(validateSave(save({ position: [1, 2, Number.NaN] }))).toBeNull();
    expect(validateSave(save({ flags: { a: { nested: true } } as never }))).toBeNull();
    expect(validateSave(save({ area: '' }))).toBeNull();
    expect(validateSave(save({ seenLines: [1] as never }))).toBeNull();
    const rp = save().returnPoint!;
    expect(validateSave(save({ returnPoint: { ...rp, flags: { x: [] } as never } }))).toBeNull();
  });
});

describe('the Glass Flats', () => {
  it('every ruin on the flats shelters the ground around it', () => {
    for (const [, x, z, , , r] of FLATS_COVER) {
      expect(flatsMask(x, z)).toBeGreaterThan(0.5);
      expect(inFlatsCover(x + r * 0.7, z)).toBe(true);
      expect(inFlatsCover(x + r * 1.3, z)).toBe(false);
    }
  });

  it('there is open glass between the cover (a crossing is a choice of route)', () => {
    expect(flatsMask(-30, -50)).toBeGreaterThan(0.5);
    expect(inFlatsCover(-30, -50)).toBe(false);
    expect(flatsMask(0, 10)).toBeLessThan(0.5);
  });
});
