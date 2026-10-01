import type { CinematicDef } from '../story/cinematic/Cinematic';
import type { Effect } from '../story/Effects';

const JOIN_ALL: Effect[] = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'].map((id) => ({ join: id }));

/**
 * Authored scenes. Positions refer to area markers ('@camp.fire') so the
 * data stays independent of level geometry.
 */
const PARTY = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'];

/** Subaru sits down at Rem's bedside (behind a fade) — the shared start of her scenes. */
const SIT_WITH_REM: CinematicDef['steps'] = [
  { do: 'place', who: 'subaru', at: '@alc.subaru_seat' },
  { do: 'anim', who: 'subaru', clip: 'sitVigil', hold: true },
  // The others give them the room.
  ...['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'].map((id, i) => ({ do: 'place' as const, who: id, at: i % 2 ? '@alc.leave_1' : '@alc.leave_2' })),
  { do: 'shot', shot: { from: '@alc.cam_vigil', at: '@alc.vigil_look', fov: 42, drift: [0.02, 0, -0.02] } },
];
/** ...and gets up again, behind a fade. */
const STAND_FROM_REM: CinematicDef['steps'] = [
  { do: 'fade', to: 1, seconds: 0.6 },
  { do: 'anim', who: 'subaru', clip: 'none' },
  { do: 'place', who: 'subaru', at: '@alc.subaru', face: '@alc.door' },
  { do: 'follow', blend: 0 },
  { do: 'fade', to: 0, seconds: 0.8 },
];

export const CINEMATICS: CinematicDef[] = [
  {
    // The gate plaza: the fight woke the Sand Earthworm.
    id: 'tf.worm',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@tf.plaza_subaru' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@tf.plaza_${id}` })),
      { do: 'music', state: 'tension' },
      { do: 'shot', shot: { from: '@tf.cam_party', at: '@tf.party_look', fov: 44, drift: [0.02, 0, -0.03] } },
      { do: 'say', lines: [{ speaker: 'emilia', text: 'Is everyone all right? ...Subaru, the ground —', expression: 'thinking' }] },
      { do: 'effects', effects: [{ event: 'tf.worm_rise' }, { set: 'tf.worm_seen' }] },
      { do: 'shake', strength: 0.5, seconds: 1.4 },
      { do: 'shot', shot: { from: '@tf.cam_worm', at: '@tf.worm_look', fov: 44, drift: [0, 0.03, -0.08] }, blend: 1.2, ease: 'inOutSine' },
      { do: 'wait', seconds: 5 },
      { do: 'say', lines: [{ speaker: 'subaru', text: 'That’s not a worm. That’s a train. With teeth.', expression: 'fear' }] },
      { do: 'dialogue', id: 'tf.worm', camera: 'auto' },
      { do: 'follow', blend: 1.2 },
    ],
    // Dying to it brings him back here, to the plaza, not all the way to camp.
    onEnd: [{ set: 'tf.worm_seen' }, { checkpoint: 'plaza' }],
  },
  {
    // Taygeta: a white room and one black stone.
    id: 'tay.arrive',
    letterbox: true,
    steps: [
      { do: 'shot', shot: { from: '@tay.cam_high', at: '@tay.center', fov: 50, drift: [0.05, 0, -0.05] } },
      { do: 'wait', seconds: 2.2 },
      { do: 'dialogue', id: 'tay.arrive', camera: 'auto' },
      { do: 'follow', blend: 1.2 },
    ],
  },
  {
    // Reading the question. Subaru thinks it through in his mind's eye —
    // the scorpion, its stinger, the hunter it killed, the hunter's
    // brightest star — then touches the stone and the room becomes the sky.
    id: 'tay.monolith',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@tay.read' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@tay.${id}`, face: '@tay.center' })),
      { do: 'shot', shot: { from: '@tay.cam_monolith', at: '@tay.monolith_face', fov: 36, drift: [0, 0.02, -0.04] } },
      { do: 'wait', seconds: 1 },
      { do: 'dialogue', id: 'tay.monolith', camera: 'auto' },
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.55, 0.05, 1.5], socket: 'head' }, at: { of: 'subaru', socket: 'head' }, fov: 30, drift: [0, 0, -0.03] }, blend: 0.8, ease: 'inOutSine' },
      {
        // The first time he works it out: the whole sky, in his mind's eye.
        // In a later loop he already knows, and simply says so.
        do: 'if',
        cond: '!know.sky.taygeta_answer',
        then: [
          { do: 'expr', who: 'subaru', expression: 'thinking' },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'Shaula. I know that name — not from her. From home.', thought: true }] },
          { do: 'music', state: 'mystery' },
          { do: 'effects', effects: [{ event: 'vision.open' }] },
          { do: 'wait', seconds: 1.0 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'My name is a star cluster. Subaru — the Pleiades. Of course I learned the sky around it.', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.scorpius' }] },
          { do: 'wait', seconds: 2.4 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'Scorpius. Antares burning red at its heart, and the tail curling down and round, all the way to—', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.shaula' }, { learn: 'sky.shaula_star' }] },
          { do: 'wait', seconds: 0.8 },
          {
            do: 'say',
            lines: [
              { speaker: 'subaru', text: '—the stinger. Shaula: the star at the very tip of the scorpion’s tail.', thought: true },
              { speaker: 'subaru', text: 'A girl with a braid that ends in a hook, named after a stinger. Whoever named her knew exactly what he was doing.', thought: true },
            ],
          },
          { do: 'effects', effects: [{ event: 'vision.orion' }] },
          { do: 'wait', seconds: 2.2 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'And the scorpion is famous for one kill. Orion, the hunter who boasted no beast on earth could ever bring him down — so the earth sent a scorpion.', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.myth' }, { learn: 'sky.orion_myth' }] },
          { do: 'wait', seconds: 2.6 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'They were hung on opposite sides of the sky. Even now, the hunter sinks in the west the moment the scorpion rises in the east.', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.myth_end' }, { event: 'vision.focus_orion' }] },
          { do: 'wait', seconds: 1.4 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'The hero destroyed by Shaula is Orion. And his greatest splendour — his brightest star...', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.betelgeuse' }] },
          { do: 'wait', seconds: 0.8 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'Not Betelgeuse. It got the alpha, but it’s a red giant that flickers and fades — and one Betelgeuse in my life was plenty.', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.not_betelgeuse' }, { event: 'vision.rigel' }] },
          { do: 'wait', seconds: 1.0 },
          { do: 'say', lines: [{ speaker: 'subaru', text: 'Rigel. The blue-white one at his foot — outshining everything else in the hunter.', thought: true }] },
          { do: 'effects', effects: [{ event: 'vision.close' }] },
          { do: 'wait', seconds: 0.7 },
          { do: 'effects', effects: [{ learn: 'sky.taygeta_answer' }] },
        ],
        else: [
          { do: 'expr', who: 'subaru', expression: 'determined' },
          {
            do: 'say',
            lines: [
              { speaker: 'subaru', text: 'I’ve been here before. Shaula, the stinger. The scorpion killed Orion. His brightest star is Rigel — at his foot.', thought: true },
              { speaker: 'subaru', text: 'And not Betelgeuse. Never Betelgeuse.', thought: true },
            ],
          },
        ],
      },
      { do: 'expr', who: 'subaru', expression: 'determined' },
      { do: 'dialogue', id: 'tay.answer', camera: 'auto' },
      { do: 'shot', shot: { from: '@tay.cam_sky', at: '@tay.sky_look', fov: 62, drift: [0, 0.05, 0] }, blend: 2.5, ease: 'inOutSine' },
      { do: 'wait', seconds: 3.4 },
      {
        do: 'say',
        lines: [
          { speaker: 'subaru', text: 'The walls are gone. It’s the night sky — all of it — and the stars are coming down. Close enough to touch.', thought: true },
          { speaker: 'subaru', text: 'Find the hunter. Three stars in a row for his belt — then down to his foot.', thought: true },
        ],
      },
      { do: 'follow', blend: 1.5 },
    ],
    // Watched or skipped: the vision is closed, he knows the answer, and the sky is up.
    onEnd: [
      { event: 'vision.close' },
      { learn: 'sky.shaula_star' },
      { learn: 'sky.orion_myth' },
      { learn: 'sky.taygeta_answer' },
      { set: 'tay.trial_started' },
      { event: 'tay.sky' },
    ],
  },
  {
    // Rigel. The trial ends and the library rises.
    id: 'tay.solved',
    letterbox: true,
    steps: [
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.7, 0.25, -1.3], socket: 'head' }, at: '@tay.rigel', fov: 40 } },
      { do: 'say', lines: [{ speaker: 'subaru', text: 'Rigel.', expression: 'determined' }] },
      { do: 'wait', seconds: 0.5 },
      { do: 'fade', to: 1, seconds: 1.4, color: '#ffffff' },
      { do: 'effects', effects: [{ event: 'tay.library' }] },
      { do: 'place', who: 'subaru', at: '@tay.read', face: '@tay.center' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@tay.${id}`, face: '@tay.center' })),
      { do: 'music', state: 'safe' },
      { do: 'shot', shot: { from: '@tay.cam_high', at: '@tay.center', fov: 56, drift: [0.06, -0.02, -0.05] } },
      { do: 'fade', to: 0, seconds: 2.2, color: '#ffffff', wait: false },
      { do: 'wait', seconds: 5 },
      { do: 'dialogue', id: 'tay.solved', camera: 'auto' },
      // End of the chapter: the library of the dead is open.
      { do: 'shot', shot: { from: '@tay.cam_high', at: '@tay.center', fov: 60, drift: [0.04, 0.02, 0.05] }, blend: 2.5, ease: 'inOutSine' },
      // Let the camera settle high over the stacks before the card.
      { do: 'wait', seconds: 2.4 },
      { do: 'title', kicker: 'Re:Zero · Pleiades', title: 'The Watchtower in the Sand', sub: 'End of the chapter — the Taygeta Library is open.', seconds: 3.6 },
      { do: 'follow', blend: 1.5 },
    ],
    onEnd: [{ set: 'tay.trial_cleared' }, { event: 'tay.library' }, { set: 'story.chapter_done' }, { checkpoint: 'library' }, { quest: 'the_sword_saint' }],
  },
  {
    // Electra: the floor with no ceiling, and a dead man eating lunch.
    id: 'ele.arrive',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@ele.subaru' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@ele.${id}` })),
      { do: 'music', state: 'mystery' },
      { do: 'shot', shot: { from: '@ele.cam_wide', at: '@ele.wide_look', fov: 50, drift: [-0.08, 0.02, -0.05] } },
      { do: 'wait', seconds: 1.6 },
      { do: 'say', lines: [{ speaker: 'subaru', text: 'No ceiling. Just sky and wind — and a guy sitting in the middle of it all, eating.', thought: true }] },
      { do: 'shot', shot: { from: '@ele.cam_reid', at: '@ele.reid_look', fov: 34, drift: [0, 0, -0.02] }, blend: 1.4, ease: 'inOutSine' },
      { do: 'wait', seconds: 0.8 },
      { do: 'say', lines: [{ speaker: 'reid', text: 'Took you long enough. I was about to finish lunch.', expression: 'smug' }] },
      { do: 'dialogue', id: 'ele.reid', camera: 'auto' },
      { do: 'follow', blend: 1.0 },
    ],
    // The duel itself starts once control is back (ElectraArea).
    onEnd: [{ set: 'ele.met_reid' }, { learn: 'people.reid' }, { checkpoint: 'electra' }],
  },
  {
    // Electra: Subaru's snare drops a chopstick — not a step. Emilia makes
    // Reid move; she alone passes, and a stair of light comes down for her.
    id: 'ele.cleared',
    letterbox: true,
    steps: [
      { do: 'wait', seconds: 0.9 },
      { do: 'shot', shot: { from: { of: 'reid', offset: [0.6, 0.15, 1.8], socket: 'head' }, at: { of: 'reid', socket: 'chest' }, fov: 38 }, blend: 0.6, ease: 'outCubic' },
      { do: 'say', lines: [{ speaker: 'reid', text: '...Ha. Hahaha! Look at that — made me drop one!', expression: 'joy' }] },
      { do: 'dialogue', id: 'ele.not_a_step', camera: 'auto' },
      // Everyone regroups; Emilia walks out to face him.
      { do: 'place', who: 'subaru', at: '@ele.subaru_watch', face: '@ele.reid_seat' },
      ...PARTY.filter((id) => id !== 'emilia').map((id) => ({ do: 'place' as const, who: id, at: `@ele.watch_${id}`, face: '@ele.reid_seat' })),
      { do: 'shot', shot: { from: '@ele.cam_ice', at: '@ele.ice_look', fov: 44, drift: [0.03, 0, -0.03] }, blend: 1.0, ease: 'inOutSine' },
      { do: 'place', who: 'emilia', at: '@ele.emilia_step_out', face: '@ele.reid_seat' },
      { do: 'move', who: 'emilia', to: '@ele.emilia_try', speed: 'walk' },
      { do: 'face', who: 'emilia', to: '@ele.reid_seat' },
      { do: 'dialogue', id: 'ele.emilia_turn', camera: 'auto' },
      { do: 'music', state: 'tension' },
      { do: 'shot', shot: { from: '@ele.cam_ice', at: '@ele.ice_look', fov: 46, drift: [0.02, 0.01, -0.05] }, blend: 0.5, ease: 'outCubic' },
      { do: 'anim', who: 'emilia', clip: 'castForward' },
      { do: 'effects', effects: [{ event: 'ele.ice' }] },
      { do: 'wait', seconds: 1.8 },
      { do: 'shot', shot: { from: '@ele.cam_feet', at: '@ele.feet_look', fov: 40, drift: [0, 0, -0.02] } },
      { do: 'say', lines: [{ speaker: 'reid', text: 'Oh, now that’s nasty. Freezing a man’s footing right out from under his—', expression: 'surprised' }] },
      { do: 'effects', effects: [{ event: 'ele.reid_step' }] },
      { do: 'wait', seconds: 0.9 },
      { do: 'shot', shot: { from: { of: 'reid', offset: [-0.8, 0.1, 2.0], socket: 'head' }, at: { of: 'reid', socket: 'chest' }, fov: 40 }, blend: 0.4, ease: 'outCubic' },
      { do: 'say', lines: [{ speaker: 'reid', text: '—whoa! ...Ha! HAHAHA! Look at that. A step!', expression: 'joy', anim: 'laugh' }] },
      { do: 'dialogue', id: 'ele.emilia_passed', camera: 'auto' },
      // The sky answers: a stair of light winds down to her (7.2 s, cut to it).
      { do: 'music', state: 'cinematic' },
      { do: 'shake', strength: 0.25, seconds: 1.4 },
      // Her face first, turned up to something we haven't seen yet.
      { do: 'look', who: 'emilia', at: '@ele.stair_top' },
      // (From the side she turns to — the stair's side — and below her eyes.)
      { do: 'shot', shot: { from: { of: 'emilia', offset: [-0.75, -0.38, 1.05], socket: 'head' }, at: { of: 'emilia', socket: 'head' }, fov: 34, drift: [0, 0, -0.03] }, blend: 0.5, ease: 'outCubic' },
      { do: 'effects', effects: [{ event: 'ele.stair' }] },
      { do: 'wait', seconds: 1.3 },
      // Her eyeline: far overhead, treads of light forming one after
      // another — and the camera rides the leading one down.
      { do: 'shot', shot: { from: '@ele.cam_up', at: '@ele.stair_head', fov: 60, follow: true } },
      { do: 'wait', seconds: 3.4 },
      // The whole of it: a helix out of the sky, everyone small beneath it.
      { do: 'shot', shot: { from: '@ele.cam_stair_wide', at: '@ele.stair_head', fov: 52, follow: true, drift: [0.04, 0.02, -0.03] }, blend: 1.2, ease: 'inOutSine' },
      { do: 'wait', seconds: 1.6 },
      // Touchdown, over her shoulder: she turns to it as it lands.
      { do: 'look', who: 'emilia', at: '@ele.stair_foot' },
      { do: 'face', who: 'emilia', to: '@ele.stair_foot', wait: false },
      { do: 'shot', shot: { from: '@ele.cam_landing', at: '@ele.landing_look', fov: 46, drift: [0, 0.01, -0.04] } },
      { do: 'wait', seconds: 2.4 },
      { do: 'look', who: 'emilia', at: null },
      { do: 'dialogue', id: 'ele.stair', camera: 'auto' },
      { do: 'music', state: 'safe' },
      { do: 'fade', to: 1, seconds: 0.6 },
      { do: 'effects', effects: [{ event: 'ele.sit' }] },
      { do: 'follow', blend: 0 },
      { do: 'fade', to: 0, seconds: 0.8 },
    ],
    onEnd: [{ set: 'ele.emilia_passed' }, { set: 'ele.trial_cleared' }, { event: 'ele.sit' }, { event: 'ele.stair_full' }, { event: 'ele.ice_clear' }, { learn: 'tower.light_stair' }, { quest: 'the_book_of_reid' }],
  },
  {
    // Reid Astrea's Book of the Dead. A swaggering life — and then the
    // pages turn on their own, and something else is reading too.
    id: 'lib.reid_book',
    letterbox: true,
    steps: [
      { do: 'fade', to: 1, seconds: 0.9, color: '#f1d9b8' },
      { do: 'effects', effects: [{ event: 'lib.memory_begin' }] },
      { do: 'music', state: 'cinematic' },
      { do: 'shot', shot: { from: '@lib.mem_cam', at: '@lib.mem_look', fov: 50, drift: [0, 0.03, -0.1] } },
      { do: 'fade', to: 0, seconds: 2.0, color: '#f1d9b8', wait: false },
      { do: 'wait', seconds: 1.2 },
      {
        do: 'say',
        lines: [
          { speaker: null, text: 'A wooden sword first. Then a borrowed one. Then mine. Nobody ever taught me a thing — I just hit stuff until it stopped hitting back.' },
          { speaker: null, text: 'A sage who never stopped smiling. A dragon too big for the sky. A girl with a tail who wouldn’t stop following him around. And a shadow at the end of the world.' },
        ],
      },
      { do: 'shot', shot: { from: '@lib.mem_cam_up', at: '@lib.mem_up', fov: 58, drift: [0, 0.02, -0.05] }, blend: 2.6, ease: 'inOutSine' },
      { do: 'say', lines: [{ speaker: null, text: 'Wait. The pages are turning by themselves. Faster. Faster than I can—' }] },
      { do: 'music', state: 'silence' },
      { do: 'fade', to: 0.85, seconds: 1.4, color: '#000000' },
      {
        do: 'say',
        lines: [
          { speaker: null, text: '“Ahaha. Found you, Onii-san.”' },
          { speaker: null, text: '“You taste like so many yesterdays. A silver-haired girl. A blue-haired maid. A little spirit in a library. Mmm.”' },
          { speaker: 'subaru', text: 'Stop— those are mine — Emilia — Rem — Beako — give them BACK—', expression: 'fear' },
          { speaker: null, text: '“Itadakimasu.”' },
        ],
      },
      { do: 'effects', effects: [{ event: 'lib.memory_eaten' }] },
      { do: 'fade', to: 1, seconds: 0.1, color: '#000000' },
      { do: 'shake', strength: 0.5, seconds: 0.5 },
      { do: 'wait', seconds: 2.4 },
      { do: 'effects', effects: [{ event: 'lib.memory_end' }, { set: 'subaru.amnesia' }] },
      { do: 'place', who: 'subaru', at: '@lib.reid_read' },
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.5, 0.1, 1.4], socket: 'head' }, at: { of: 'subaru', socket: 'head' }, fov: 34 } },
      { do: 'expr', who: 'subaru', expression: 'surprised' },
      { do: 'fade', to: 0, seconds: 2.2, color: '#000000' },
      { do: 'music', state: 'mystery' },
      { do: 'dialogue', id: 'lib.amnesia', camera: 'auto' },
      { do: 'shot', shot: { from: '@tay.cam_high', at: '@tay.center', fov: 56, drift: [0.04, 0.02, 0.05] }, blend: 2.5, ease: 'inOutSine' },
      { do: 'wait', seconds: 2.0 },
      { do: 'title', kicker: 'Re:Zero · Pleiades', title: 'Natsuki Subaru, Who Remembers No One', sub: 'End of the slice — the Watchtower’s story continues.', seconds: 4.2 },
      { do: 'follow', blend: 1.5 },
    ],
    onEnd: [{ set: 'lib.read_reid' }, { set: 'subaru.amnesia' }, { learn: 'people.gluttony_book' }, { event: 'lib.memory_end' }, { checkpoint: 'library_amnesia' }],
  },
  {
    // A Book of the Dead: Hadrian's last morning, lived. The library dreams
    // away into the night before the crossing; his thoughts, in his words.
    id: 'lib.hadrian',
    letterbox: true,
    steps: [
      { do: 'fade', to: 1, seconds: 0.9, color: '#e8dcc0' },
      { do: 'effects', effects: [{ event: 'lib.memory_begin' }] },
      { do: 'music', state: 'cinematic' },
      { do: 'shot', shot: { from: '@lib.mem_cam', at: '@lib.mem_look', fov: 50, drift: [0, 0.03, -0.1] } },
      { do: 'fade', to: 0, seconds: 2.2, color: '#e8dcc0', wait: false },
      { do: 'wait', seconds: 1.4 },
      {
        do: 'say',
        lines: [
          { speaker: null, text: 'Third morning. The sand has stopped moving in circles. Maren is still asleep against the pack, her hat over her face.' },
          { speaker: null, text: 'The tower is right there. Close enough to touch. There’s a star at the very top that blinks when you move — Maren says it’s watching us. I told her stars don’t watch anybody.' },
        ],
      },
      { do: 'shot', shot: { from: '@lib.mem_cam_up', at: '@lib.mem_up', fov: 58, drift: [0, 0.02, -0.05] }, blend: 3, ease: 'inOutSine' },
      {
        do: 'say',
        lines: [
          { speaker: null, text: 'First light. The glass goes gold under my boots. I run — I can’t help it, it’s right there — and I’m laughing.' },
          { speaker: null, text: 'The star blinks.' },
          { speaker: null, text: 'Maren is shouting something behind me. I turn around to hear what it is.' },
        ],
      },
      { do: 'effects', effects: [{ event: 'lib.memory_light' }] },
      { do: 'fade', to: 1, seconds: 0.12, color: '#ffffff' },
      { do: 'shake', strength: 0.6, seconds: 0.4 },
      { do: 'wait', seconds: 1.2 },
      { do: 'effects', effects: [{ event: 'lib.memory_end' }] },
      { do: 'place', who: 'subaru', at: '@lib.hadrian_read' },
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.45, 0.05, 1.25], socket: 'head' }, at: { of: 'subaru', socket: 'head' }, fov: 32 } },
      { do: 'anim', who: 'subaru', clip: 'gasp' },
      { do: 'expr', who: 'subaru', expression: 'fear' },
      { do: 'fade', to: 0, seconds: 1.4, color: '#ffffff' },
      { do: 'music', state: 'safe' },
      { do: 'dialogue', id: 'lib.after_hadrian', camera: 'auto' },
      { do: 'follow', blend: 1.2 },
    ],
    onEnd: [{ set: 'lib.read_hadrian' }, { learn: 'library.hadrian' }, { event: 'lib.memory_end' }],
  },
  {
    // Up the stair into Alcyone, Rem in Subaru's arms: the first warm room in days.
    id: 'alc.arrive',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@alc.arrive_subaru' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@alc.arrive_${id}` })),
      { do: 'carry', who: 'subaru', whom: 'rem' },
      { do: 'music', state: 'safe' },
      { do: 'shot', shot: { from: '@alc.cam_hall', at: '@alc.hall_look', fov: 52, drift: [0.05, 0, 0.04] } },
      { do: 'wait', seconds: 2.2 },
      { do: 'shot', shot: { from: '@alc.cam_arrive', at: '@alc.arrive_look', fov: 44, drift: [0, 0, -0.04] }, blend: 1.8, ease: 'inOutSine' },
      { do: 'wait', seconds: 0.8 },
      { do: 'dialogue', id: 'alc.arrive', camera: 'keep' },
      { do: 'fade', to: 1, seconds: 0.6 },
      { do: 'carry', who: 'subaru', whom: null },
      { do: 'follow', blend: 0 },
      { do: 'fade', to: 0, seconds: 0.8 },
    ],
  },
  {
    // Alcyone: Rem is laid down in the Green Room.
    id: 'alc.rem',
    letterbox: true,
    steps: [
      { do: 'fade', to: 1, seconds: 0.6 },
      { do: 'spawn', who: 'rem', at: '@alc.rem_bed', lying: true },
      { do: 'effects', effects: [{ event: 'alc.rem_laid' }] },
      { do: 'place', who: 'subaru', at: '@alc.subaru', face: '@alc.rem_head' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@alc.${id}`, face: '@alc.rem_head' })),
      { do: 'music', state: 'safe' },
      { do: 'shot', shot: { from: '@alc.cam_door', at: '@alc.rem_head', fov: 46, drift: [0.03, 0, -0.05] } },
      { do: 'fade', to: 0, seconds: 1.6, wait: false },
      { do: 'wait', seconds: 1.2 },
      {
        do: 'say',
        lines: [{ speaker: 'subaru', text: 'Green. Everywhere. Leaves on the walls, flowers in the cracks, light like a forest morning — in a tower in the middle of a desert.', thought: true }],
      },
      { do: 'shot', shot: { from: '@alc.cam_bed', at: '@alc.rem_head', fov: 34, drift: [0, 0, -0.03] }, blend: 1.6, ease: 'inOutSine' },
      { do: 'wait', seconds: 1.2 },
      { do: 'dialogue', id: 'alc.rem', camera: 'auto' },
      // Everyone else steps out and leaves him with her.
      ...PARTY.map((id, i) => ({ do: 'move' as const, who: id, to: i % 2 ? '@alc.leave_1' : '@alc.leave_2', speed: 'walk' as const, wait: false })),
      { do: 'shot', shot: { from: '@alc.cam_door', at: '@alc.rem_head', fov: 40, drift: [0.02, 0, -0.03] }, blend: 1.2 },
      { do: 'wait', seconds: 2.4 },
      { do: 'fade', to: 1, seconds: 0.6 },
      ...SIT_WITH_REM,
      { do: 'wait', seconds: 1.3 },
      { do: 'fade', to: 0, seconds: 1.0 },
      { do: 'dialogue', id: 'alc.rem_alone', camera: 'keep' },
      { do: 'wait', seconds: 0.8 },
      ...STAND_FROM_REM,
    ],
    // Every return from here on starts beside her.
    onEnd: [{ set: 'alc.rem_settled' }, { event: 'alc.rem_laid' }, { checkpoint: 'alcyone' }],
  },
  {
    // "Sit with Rem" at her bedside.
    id: 'alc.vigil',
    letterbox: true,
    steps: [
      { do: 'fade', to: 1, seconds: 0.4 },
      ...SIT_WITH_REM,
      { do: 'wait', seconds: 1.3 },
      { do: 'fade', to: 0, seconds: 0.8 },
      { do: 'dialogue', id: 'alc.vigil', camera: 'keep' },
      ...STAND_FROM_REM,
    ],
  },
  {
    // The balcony at night: Emilia, the stars, and Orion.
    id: 'alc.balcony',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@alc.balcony_subaru' },
      { do: 'place', who: 'emilia', at: '@alc.balcony_door', face: '@alc.balcony_emilia' },
      // Everyone else is asleep by now.
      ...PARTY.filter((id) => id !== 'emilia').map((id, i) => ({ do: 'place' as const, who: id, at: i % 2 ? '@alc.leave_1' : '@alc.leave_2' })),
      { do: 'music', state: 'safe' },
      { do: 'shot', shot: { from: '@alc.balcony_cam', at: '@alc.balcony_sky', fov: 52, drift: [0.03, 0.01, 0] } },
      { do: 'wait', seconds: 2.2 },
      { do: 'move', who: 'emilia', to: '@alc.balcony_emilia', speed: 'walk' },
      { do: 'face', who: 'emilia', to: 'subaru', wait: false },
      { do: 'face', who: 'subaru', to: 'emilia' },
      { do: 'shot', shot: { from: '@alc.balcony_two', at: '@alc.balcony_two_look', fov: 46, drift: [0.02, 0, -0.02] }, blend: 1.2, ease: 'inOutSine' },
      { do: 'dialogue', id: 'alc.balcony', camera: 'keep' },
      { do: 'face', who: 'subaru', to: '@alc.balcony_sky', wait: false },
      { do: 'face', who: 'emilia', to: '@alc.balcony_sky' },
      { do: 'shot', shot: { from: '@alc.balcony_cam', at: '@alc.balcony_sky', fov: 52, drift: [0.03, 0.01, 0] }, blend: 1.5, ease: 'inOutSine' },
      { do: 'wait', seconds: 2.5 },
      { do: 'follow', blend: 1.4 },
    ],
  },
  {
    // Into the tower: a voice from above, and the Star Guardian drops in.
    id: 'cel.shaula',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@cel.subaru', face: '@cel.center' },
      ...PARTY.map((id) => ({ do: 'place' as const, who: id, at: `@cel.${id}`, face: '@cel.center' })),
      { do: 'music', state: 'mystery' },
      { do: 'shot', shot: { from: '@cel.cam_wide', at: '@cel.cam_hall_look', fov: 50, drift: [0, 0.02, -0.08] } },
      { do: 'wait', seconds: 1.2 },
      { do: 'say', lines: [{ speaker: 'subaru', text: 'So this is the inside of the Watchtower. ...It’s quiet. Way too quiet.', thought: true }] },
      { do: 'spawn', who: 'shaula', at: '@cel.shaula_gallery', face: '@cel.center' },
      { do: 'say', lines: [{ speaker: 'shaula', text: 'Maaaaaster!!', expression: 'joy' }] },
      ...(['subaru', ...PARTY] as const).map((id) => ({ do: 'look' as const, who: id, at: { of: 'shaula', socket: 'head' as const } })),
      { do: 'face', who: 'subaru', to: 'shaula' },
      { do: 'shot', shot: { from: '@cel.cam_up', at: { of: 'shaula', socket: 'chest' }, fov: 17, drift: [0, 0.03, 0] }, blend: 0.8, ease: 'outCubic' },
      { do: 'anim', who: 'shaula', clip: 'wave' },
      { do: 'say', lines: [{ speaker: 'shaula', text: 'Master! Master, Master, *Master*!', expression: 'joy' }] },
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.35, 0.05, 1.3], socket: 'head' }, at: { of: 'subaru', socket: 'head' }, fov: 32 } },
      { do: 'expr', who: 'subaru', expression: 'surprised' },
      { do: 'say', lines: [{ speaker: 'subaru', text: 'Wait. Is she going to — she’s going to jump. She’s jumping!', expression: 'fear' }] },
      { do: 'place', who: 'shaula', at: '@cel.shaula_land', face: 'subaru' },
      { do: 'face', who: 'subaru', to: 'shaula' },
      { do: 'shot', shot: { from: '@cel.cam_side', at: { of: 'shaula', socket: 'chest' }, fov: 40 } },
      { do: 'shake', strength: 0.7, seconds: 0.5 },
      { do: 'anim', who: 'shaula', clip: 'landHard', wait: true },
      { do: 'dialogue', id: 'cel.shaula', camera: 'auto' },
      { do: 'music', state: 'safe' },
      { do: 'follow', blend: 1.4 },
    ],
    onEnd: [{ set: 'cel.met_shaula' }, { quest: 'the_trials' }, { checkpoint: 'celaeno' }],
  },
  {
    // Walking out before the trials are cleared: Shaula is suddenly there.
    id: 'cel.gate_rule',
    letterbox: true,
    steps: [
      { do: 'place', who: 'subaru', at: '@cel.gate_subaru', face: '@cel.gate_look' },
      { do: 'place', who: 'shaula', at: '@cel.gate_shaula', face: 'subaru' },
      { do: 'music', state: 'tension' },
      { do: 'shot', shot: { from: { of: 'subaru', offset: [0.5, 0.1, 1.2], socket: 'head' }, at: { of: 'subaru', socket: 'head' }, fov: 34 } },
      { do: 'wait', seconds: 0.5 },
      { do: 'face', who: 'subaru', to: 'shaula', wait: true },
      { do: 'dialogue', id: 'cel.gate_rule', camera: 'auto' },
      { do: 'if', cond: '!cel.leave_anyway', then: [{ do: 'music', state: 'safe' }, { do: 'follow', blend: 1 }] },
    ],
  },
  {
    id: 'tf.opening',
    letterbox: true,
    steps: [
      { do: 'fade', to: 1, seconds: 0 },
      { do: 'effects', effects: JOIN_ALL },
      { do: 'party' },
      { do: 'place', who: 'subaru', at: '@camp.subaru', face: '@camp.fire' },
      { do: 'place', who: 'emilia', at: '@camp.emilia', face: '@camp.fire' },
      { do: 'place', who: 'beatrice', at: '@camp.beatrice', face: '@camp.fire' },
      { do: 'place', who: 'meili', at: '@camp.meili', face: '@camp.fire' },
      { do: 'place', who: 'julius', at: '@camp.julius', face: '@camp.fire' },
      { do: 'place', who: 'anastasia', at: '@camp.anastasia', face: '@camp.fire' },
      { do: 'place', who: 'ram', at: '@camp.ram', face: '@camp.fire' },
      { do: 'place', who: 'patrasche', at: '@camp.patrasche', face: 'subaru' },
      { do: 'music', state: 'cinematic' },
      // The tower, at last, over the dunes.
      { do: 'shot', shot: { from: '@camp.cam_est', at: [0, 58, -170], fov: 52, drift: [0, 0.05, 0] } },
      { do: 'wait', seconds: 0.4 },
      {
        do: 'parallel',
        steps: [
          { do: 'fade', to: 0, seconds: 3 },
          { do: 'title', kicker: 'Re:Zero · Pleiades', title: 'The Watchtower in the Sand', sub: 'Augria Sand Dunes — the night we finally arrived', seconds: 3 },
        ],
      },
      // Down to the fire.
      { do: 'shot', shot: { from: '@camp.cam_fire', at: '@camp.fire_look', fov: 40, drift: [0.05, 0, -0.03] }, blend: 4, ease: 'inOutSine' },
      { do: 'wait', seconds: 3.6 },
      {
        do: 'say',
        lines: [
          { speaker: 'subaru', text: 'The Pleiades Watchtower. Home of the Sage — the one who supposedly knows everything.', thought: true },
          { speaker: 'subaru', text: 'If anyone can tell me how to wake Rem up... it’s whoever is waiting at the top of that thing.', thought: true },
        ],
      },
      { do: 'dialogue', id: 'camp.opening', camera: 'auto' },
      { do: 'shot', shot: { from: '@camp.cam_end', at: [0, 70, -170], fov: 46, drift: [0, 0.05, 0.04] }, blend: 2.5, ease: 'inOutSine' },
      { do: 'wait', seconds: 2.4 },
      { do: 'music', state: 'exploration' },
      { do: 'follow', blend: 1.6 },
    ],
    // The Witch sets Subaru's return point here: the first night at the tower.
    onEnd: [...JOIN_ALL, { quest: 'watchtower' }, { set: 'story.opening_done' }, { checkpoint: 'camp_night' }],
  },
];
