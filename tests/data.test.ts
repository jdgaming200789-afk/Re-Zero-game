import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { CHATTER } from '../src/data/chatter';
import { CREATURES } from '../src/data/creatures';
import { PARTY_MEMBERS, PARTY_ORDER } from '../src/data/party';
import { validateCondition } from '../src/story/Conditions';
import { STANCES } from '../src/characters/anim/Clips';
import { EXPRESSIONS } from '../src/characters/face/FaceRenderer';

describe('character data', () => {
  it('every character references a stance and expression that exist', () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(STANCES[c.stance], `${c.id} stance`).toBeDefined();
      expect(EXPRESSIONS[c.defaultExpression], `${c.id} expression`).toBeDefined();
      expect(c.model).toMatch(/\.glb$/);
    }
  });

  it('party members are characters and all appear in the formation order', () => {
    for (const id of Object.keys(PARTY_MEMBERS)) {
      expect(CHARACTERS[id] ?? CREATURES[id], id).toBeDefined();
      expect(PARTY_ORDER).toContain(id);
    }
  });
});

describe('chatter data', () => {
  it('has unique ids, known speakers, valid conditions and expressions', () => {
    const ids = new Set<string>();
    for (const d of CHATTER) {
      expect(ids.has(d.id), `duplicate ${d.id}`).toBe(false);
      ids.add(d.id);
      expect(d.lines.length).toBeGreaterThan(0);
      if (d.condition) validateCondition(d.condition);
      for (const l of d.lines) {
        expect(CHARACTERS[l.speaker] ?? CREATURES[l.speaker], `${d.id}: speaker ${l.speaker}`).toBeDefined();
        if (l.expression) expect(EXPRESSIONS[l.expression], `${d.id}: ${l.expression}`).toBeDefined();
        expect(l.text.length).toBeLessThan(140);
      }
    }
  });
});
