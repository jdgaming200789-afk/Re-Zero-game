import type { ChatterDef } from '../party/Chatter';

/**
 * Ambient party banter. Each exchange plays once per loop (its flag is world
 * state, so Return by Death rewinds it) unless `once: false`.
 *
 * Voices: Beatrice ends lines with "I suppose" / "in fact" and calls herself
 * Betty; Ram calls Subaru "Barusu"; Meili calls him "Onii-san"; Echidna,
 * speaking through Anastasia, calls him "Natsuki-kun"; Julius is formal.
 */
export const CHATTER: ChatterDef[] = [
  // ------------------------------------------------------------ dev gym (test)
  {
    id: 'gym.book',
    trigger: { on: 'interact', id: 'gym.book' },
    lines: [
      { speaker: 'beatrice', text: 'A book left lying about on the floor. Betty disapproves, in fact.', expression: 'annoyed' },
      { speaker: 'subaru', text: "Relax, Beako. I'll put it back." },
    ],
  },
  {
    id: 'gym.idle',
    trigger: { on: 'idle', area: 'dev_gym', after: 20 },
    lines: [{ speaker: 'emilia', text: 'Subaru? Are you all right? You went quiet all of a sudden.', expression: 'thinking' }],
  },

  // ------------------------------------------------------------ Tower's Foot
  {
    id: 'tf.arrival',
    trigger: { on: 'areaEnter', area: 'tower_foot', delay: 4 },
    condition: '!tf.arrival_cinematic_pending',
    lines: [
      { speaker: 'emilia', text: "So that's the Pleiades Watchtower... It's so much bigger up close.", expression: 'surprised' },
      { speaker: 'beatrice', text: 'Who builds a tower in the middle of nowhere, I wonder. Someone unpleasant, I suppose.' },
      { speaker: 'subaru', text: "Someone who really, really doesn't want visitors." },
    ],
  },
  {
    id: 'tf.obelisk',
    trigger: { on: 'interact', id: 'tf.obelisk' },
    lines: [
      { speaker: 'julius', text: '"The watcher does not sleep." A warning, then. Or a boast.' },
      { speaker: 'anastasia', text: 'Or a job description, Natsuki-kun. Four hundred years is a very long shift.', expression: 'smug' },
    ],
  },
  {
    id: 'tf.glass',
    trigger: { on: 'interact', id: 'tf.glass_edge' },
    lines: [
      { speaker: 'ram', text: "Something burned this ground over and over, Barusu. Don't make Ram carry your ashes home.", expression: 'smug' },
      { speaker: 'subaru', text: 'Noted. Stay off the shiny death floor.' },
    ],
  },
  {
    id: 'tf.carriage',
    trigger: { on: 'interact', id: 'tf.carriage' },
    lines: [
      { speaker: 'emilia', text: "She looks peaceful, doesn't she? ...We'll wake her up, Subaru. I promise.", expression: 'sad' },
    ],
  },
  {
    id: 'tf.pack',
    trigger: { on: 'interact', id: 'tf.old_camp' },
    lines: [
      { speaker: 'meili', text: 'Onii-san, somebody walked all this way before us. Do you think the sand ate them?', expression: 'happy' },
      { speaker: 'beatrice', text: 'Do not say such things so cheerfully, I suppose!', expression: 'angry' },
    ],
  },
  {
    id: 'tf.idle_sand',
    trigger: { on: 'idle', area: 'tower_foot', after: 22 },
    lines: [{ speaker: 'beatrice', text: 'Subaru. Staring at the sand will not bring the tower any closer, in fact.', expression: 'annoyed' }],
  },
  {
    id: 'tf.idle_jackals',
    trigger: { on: 'idle', area: 'tower_foot', after: 35 },
    lines: [{ speaker: 'meili', text: 'Hey, hey. If we stand still too long, the jackals start thinking we’re dinner.', expression: 'happy' }],
  },
  {
    id: 'tf.patrasche',
    trigger: { on: 'idle', area: 'tower_foot', after: 28 },
    lines: [
      { speaker: 'patrasche', text: '(Patrasche nudges Subaru\u2019s shoulder with her snout.)', expression: 'happy', seconds: 2.6 },
      { speaker: 'subaru', text: "Yeah, yeah. I know. You're the best girl, Patrasche.", expression: 'happy' },
    ],
  },
  {
    id: 'tf.stars',
    trigger: { on: 'idle', area: 'tower_foot', after: 50 },
    lines: [
      { speaker: 'julius', text: 'The stars are remarkably clear out here.' },
      { speaker: 'subaru', text: "Yeah. Weirdly familiar, too. Can't put my finger on why.", expression: 'thinking' },
    ],
  },

  {
    id: 'tf.plaza_watch',
    trigger: { on: 'zone', zone: 'tf.plaza' },
    condition: { all: ['story.opening_done', '!tf.plaza_cleared'] },
    lines: [
      { speaker: 'meili', text: 'Onii-san... there are witchbeasts sleeping on the stones. A lot of them.', expression: 'thinking' },
      { speaker: 'julius', text: 'Then let them wake to steel. Stay behind us, Subaru.', expression: 'determined' },
    ],
  },
  {
    id: 'tf.bell',
    trigger: { on: 'event', id: 'bell.rung' },
    condition: { all: ['tf.worm_seen', '!tf.worm_dead'] },
    lines: [
      { speaker: 'subaru', text: 'Okay. Now stand still. Be a rock. Rocks don’t get eaten.' },
      { speaker: 'beatrice', text: 'The whole desert heard that, I suppose.', expression: 'annoyed' },
    ],
  },

  // ------------------------------------------------------------ Celaeno
  {
    id: 'cel.arrival',
    trigger: { on: 'areaEnter', area: 'celaeno', delay: 2.5 },
    condition: 'cel.met_shaula',
    lines: [
      { speaker: 'emilia', text: "It's so quiet in here...", expression: 'thinking' },
      { speaker: 'ram', text: 'Quiet is good. Quiet means nothing is chewing on Barusu yet.' },
    ],
  },
  {
    id: 'cel.armillary',
    trigger: { on: 'interact', id: 'cel.armillary' },
    lines: [
      { speaker: 'anastasia', text: 'Seven rings... no, seven stars. The Pleiades. How very fitting.' },
      { speaker: 'subaru', text: "The Seven Sisters. Bet every floor's named after one of them." },
    ],
  },
  {
    id: 'cel.statue',
    trigger: { on: 'interact', id: 'cel.statue' },
    lines: [{ speaker: 'julius', text: 'Whoever this was, they were revered. The stone is worn smooth where hands have touched it.' }],
  },

  // ------------------------------------------------------------ Alcyone
  {
    id: 'alc.arrival',
    trigger: { on: 'areaEnter', area: 'alcyone', delay: 2 },
    lines: [
      { speaker: 'meili', text: 'It’s warm up here! And it smells like wood and old blankets!', expression: 'joy' },
      { speaker: 'beatrice', text: 'Someone lived here. For a very long time, I suppose.', expression: 'thinking' },
    ],
  },
  {
    id: 'alc.table',
    trigger: { on: 'interact', id: 'alc.table' },
    lines: [
      { speaker: 'emilia', text: 'When all this is over, let’s have dinner here. All of us. Rem too.', expression: 'happy' },
      { speaker: 'subaru', text: 'It’s a date. A big, crowded, twelve-chair date.' },
    ],
  },
  {
    id: 'alc.tallies',
    trigger: { on: 'interact', id: 'alc.tallies' },
    lines: [
      { speaker: 'ram', text: 'Four hundred years of counting. Whoever did this was very patient, or very stubborn.', expression: 'thinking' },
      { speaker: 'subaru', text: 'Or waiting for somebody who said he’d come back.', expression: 'sad' },
    ],
  },
  {
    id: 'alc.journal',
    trigger: { on: 'interact', id: 'alc.journal' },
    lines: [{ speaker: 'anastasia', text: '“What a true visitor could know.” A lock that only opens for the right stranger. I do like this tower more and more, Natsuki-kun.', expression: 'smug' }],
  },

  // ------------------------------------------------------------ Taygeta
  {
    id: 'tay.idle',
    trigger: { on: 'idle', area: 'taygeta', after: 40 },
    condition: { all: ['tay.trial_started', '!tay.trial_cleared'] },
    lines: [
      { speaker: 'emilia', text: 'So many stars... Do any of them look familiar to you, Subaru?', expression: 'thinking' },
      { speaker: 'beatrice', text: 'Staring at them won’t make them answer, I suppose.', expression: 'annoyed' },
    ],
  },
  {
    id: 'tay.idle2',
    trigger: { on: 'idle', area: 'taygeta', after: 100 },
    condition: { all: ['tay.trial_started', '!tay.trial_cleared', 'tay.fails >= 1'] },
    lines: [{ speaker: 'julius', text: 'Every one of these could be the answer, or a trap. I confess, Subaru, I am of little use to you here.', expression: 'sad' }],
  },
];
