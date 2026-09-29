/**
 * What Subaru can learn. Knowledge is stored as `know.<id>` flags, which
 * survive Return by Death: it is the only thing he carries back, and the
 * thing that opens new dialogue options, routes and solutions in the next
 * loop. The journal lists what he knows under "Subaru remembers".
 */
export interface KnowledgeDef {
  title: string;
  text: string;
  category: 'danger' | 'lore' | 'people';
}

export const KNOWLEDGE: Record<string, KnowledgeDef> = {
  'heliosphere.movement': {
    title: 'The light hunts movement',
    text: 'On the Glass Flats, the white light from the tower struck the moment I ran out into the open. Standing still under cover, nothing happened.',
    category: 'danger',
  },
  'heliosphere.glint': {
    title: 'A star glints first',
    text: 'Right before the light, something at the very top of the tower glinted like a star. About a breath of warning. Maybe less.',
    category: 'danger',
  },
  'heliosphere.cover': {
    title: 'Stone blocks its sight',
    text: 'Whatever is watching from the summit can’t see through the ruins. The broken walls on the flats are the only safe ground.',
    category: 'danger',
  },
  'earthworm.vibration': {
    title: 'It hunts by vibration',
    text: 'The Sand Earthworm can’t see. It comes for footsteps, fighting, anything that shakes the sand. Standing still, it loses you.',
    category: 'danger',
  },
  'earthworm.lure': {
    title: 'Lure it into the light',
    text: 'Nothing we have can hurt that worm. But the light from the tower burns anything that moves on the glass. If the worm were out there, following noise...',
    category: 'danger',
  },
  'tower.sage': {
    title: 'The Sage of the tower',
    text: 'The stories say a Sage has watched these dunes from the Pleiades Watchtower for four hundred years, and that the Sage knows everything. Even how to undo what Gluttony did.',
    category: 'lore',
  },
  'people.julius_name': {
    title: 'Julius’s name',
    text: 'Gluttony ate Julius’s name. The whole world forgot him. He walks with us anyway, and he never complains about it — which is somehow worse.',
    category: 'people',
  },
  'people.rem': {
    title: 'Rem',
    text: 'Rem has been asleep since Gluttony took her name and memories. Nobody but me remembers her. Not even her sister. I came here to wake her up.',
    category: 'people',
  },
};
