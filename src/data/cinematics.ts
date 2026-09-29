import type { CinematicDef } from '../story/cinematic/Cinematic';
import type { Effect } from '../story/Effects';

const JOIN_ALL: Effect[] = ['emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'].map((id) => ({ join: id }));

/**
 * Authored scenes. Positions refer to area markers ('@camp.fire') so the
 * data stays independent of level geometry.
 */
export const CINEMATICS: CinematicDef[] = [
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
    onEnd: [...JOIN_ALL, { quest: 'watchtower' }, { set: 'story.opening_done' }],
  },
];
