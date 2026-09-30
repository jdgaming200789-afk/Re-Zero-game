import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * The gate plaza, after the witchbeasts. The fight woke the Sand Earthworm;
 * nobody's blade will get through that hide, and the gate won't open
 * quietly. What Subaru knows about the light on the glass (from dying to
 * it) turns the problem around: make the worm surface out on the flats.
 */
export const TOWERFOOT_DIALOGUES: DialogueDef[] = [
  {
    id: 'tf.worm',
    cast: ['subaru', 'emilia', 'julius', 'beatrice', 'anastasia', 'ram', 'meili'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'julius', text: 'A Sand Earthworm. Our blades would barely mark that hide.', expression: 'determined', anim: 'handOnChest', to: 'subaru' },
          { speaker: 'beatrice', text: 'Betty’s magic won’t do much against something that size either, I suppose.', expression: 'annoyed' },
          { speaker: 'anastasia', text: 'It hunts by feel — every footstep, every clash of steel. Our little fight rang like a dinner bell, Natsuki-kun.', expression: 'thinking', to: 'subaru', effects: [{ learn: 'earthworm.vibration' }] },
          { speaker: 'ram', text: 'And now it lies between us and the gate. How considerate.', expression: 'annoyed' },
        ],
        choices: [
          { text: 'The light. We lure it out onto the glass.', goto: 'light', if: 'know.heliosphere.movement', insight: true },
          { text: 'We sneak past it to the gate.', goto: 'sneak' },
        ],
      },
      light: {
        lines: [
          { speaker: 'subaru', text: 'Anything that moves out on the glass gets burned — the light from the top of the tower. I’ve seen it.', expression: 'determined', anim: 'explain', to: 'emilia' },
          { speaker: 'subaru', text: 'From... a distance. Very much from a distance.', thought: true, expression: 'pain' },
          { speaker: 'emilia', text: 'Then if the worm comes up out there...', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'The light does what our swords can’t. We just need it to follow a noise onto the flats.', anim: 'fist' },
        ],
        next: 'bell',
      },
      sneak: {
        lines: [
          { speaker: 'julius', text: 'The gate is stone and bronze, Subaru. It will not open quietly.', expression: 'sad', to: 'subaru' },
          { speaker: 'ram', text: 'Think, Barusu. It is the one thing you are occasionally good for.', expression: 'smug' },
          { speaker: 'meili', text: 'It follows noise, right? Then make a big noise somewhere else, and let it go there!', expression: 'happy', to: 'subaru' },
          { speaker: 'subaru', text: 'Somewhere else. Somewhere it can’t hurt anyone... somewhere out on the glass.', thought: true, expression: 'thinking' },
        ],
        next: 'bell',
      },
      bell: {
        lines: [
          { speaker: 'meili', text: 'Onii-san has the carriage bell! It’s super loud. Patrasche hates it.', expression: 'joy', anim: 'wave' },
          { speaker: 'subaru', text: 'Ring it out on the flats, then get behind stone and don’t move a muscle. Easy. Totally easy.', expression: 'determined', effects: [{ set: 'tf.worm_plan' }] },
          { speaker: 'emilia', text: 'Please be careful, Subaru.', expression: 'sad', to: 'subaru' },
        ],
      },
    },
  },
  {
    id: 'tf.worm_dead',
    cast: ['subaru', 'emilia', 'beatrice', 'julius'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'emilia', text: 'It’s gone... the light took it.', expression: 'surprised' },
          { speaker: 'beatrice', text: 'Using the tower to fight the desert. Not bad for you, I suppose.', expression: 'smug', to: 'subaru' },
          { speaker: 'julius', text: 'The gate is clear. Shall we?', anim: 'bow' },
        ],
      },
    },
  },
];
