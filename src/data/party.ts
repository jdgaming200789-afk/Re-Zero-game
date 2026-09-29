/**
 * Party member definitions: how each companion travels with Subaru and what
 * they bring to a fight. Membership itself is story state (`party.<id>`
 * flags), so it rewinds correctly on Return by Death.
 */
export type CombatRole = 'spirit_mage' | 'yin_mage' | 'spirit_knight' | 'wind_mage' | 'beast_tamer' | 'strategist' | 'land_dragon';

export interface PartyMemberDef {
  id: string;
  /** Preferred distance behind the leader along the path walked (m). */
  followDistance: number;
  /** Sideways offset from the leader's path (+ = leader's left). */
  lateral: number;
  /** 0..1: how often they look around / fidget when idle. */
  curiosity: number;
  /** 0..1: how hard they push to keep up (sprint threshold). */
  eagerness: number;
  /** Personal space when the group stops (m). */
  personalSpace: number;
  combatRole: CombatRole;
  /** One-line role summary for the party screen. */
  role: string;
}

export const PARTY_MEMBERS: Record<string, PartyMemberDef> = {
  emilia: {
    id: 'emilia',
    followDistance: 1.9,
    lateral: 1.1,
    curiosity: 0.5,
    eagerness: 0.8,
    personalSpace: 0.9,
    combatRole: 'spirit_mage',
    role: 'Ice spirit arts — area control and heavy hits',
  },
  beatrice: {
    id: 'beatrice',
    // Contracted to Subaru: she stays close enough to hold his hand.
    followDistance: 1.3,
    lateral: -0.8,
    curiosity: 0.2,
    eagerness: 1,
    personalSpace: 0.6,
    combatRole: 'yin_mage',
    role: 'Yin magic through Subaru — shields, slows, E·M·T',
  },
  julius: {
    id: 'julius',
    followDistance: 2.8,
    lateral: -1.5,
    curiosity: 0.3,
    eagerness: 0.7,
    personalSpace: 1.1,
    combatRole: 'spirit_knight',
    role: 'Spirit knight — duelist and front line',
  },
  ram: {
    id: 'ram',
    followDistance: 2.6,
    lateral: 1.6,
    curiosity: 0.2,
    eagerness: 0.5,
    personalSpace: 1.0,
    combatRole: 'wind_mage',
    role: 'Wind magic and clairvoyance — ranged cutter, scouting',
  },
  meili: {
    id: 'meili',
    followDistance: 3.1,
    lateral: 0.9,
    curiosity: 0.9,
    eagerness: 0.6,
    personalSpace: 0.8,
    combatRole: 'beast_tamer',
    role: 'Beast tamer — turns witchbeasts, calms the Sand Earthworm',
  },
  patrasche: {
    id: 'patrasche',
    // Keeps to the flank, where there's room for a land dragon.
    followDistance: 3.6,
    lateral: 2.3,
    curiosity: 0.4,
    eagerness: 0.9,
    personalSpace: 1.6,
    combatRole: 'land_dragon',
    role: 'Land dragon — carries Subaru, outruns anything on the sand',
  },
  anastasia: {
    id: 'anastasia',
    followDistance: 3.4,
    lateral: -1.0,
    curiosity: 0.6,
    eagerness: 0.4,
    personalSpace: 1.0,
    combatRole: 'strategist',
    role: 'Echidna in Anastasia\'s body — analysis and spirit support',
  },
};

export const PARTY_ORDER = ['beatrice', 'emilia', 'julius', 'ram', 'meili', 'anastasia', 'patrasche'];
