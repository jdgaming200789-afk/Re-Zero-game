import type { CinematicDef } from '../story/cinematic/Cinematic';
import type { Effect } from '../story/Effects';

const JOIN_ALL: Effect[] = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'].map((id) => ({ join: id }));

/**
 * Authored scenes. Positions refer to area markers ('@camp.fire') so the
 * data stays independent of level geometry.
 */
const PARTY = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'];

export const CINEMATICS: CinematicDef[] = [
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
