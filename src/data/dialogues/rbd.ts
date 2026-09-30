import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Waking up after Return by Death. Subaru knows; nobody else does. What he
 * thinks depends on how he died (`meta.last_death`); the people around him
 * only see him turn pale. Meili and Patrasche, closest to the beasts, catch
 * the Witch's scent that clings to him.
 */
export const RBD_DIALOGUES: DialogueDef[] = [
  {
    id: 'rbd.return',
    cast: ['subaru', 'emilia', 'meili', 'patrasche'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'White. Everything went white — and then nothing. It came from the top of the tower the moment I ran out onto the glass.', thought: true, if: "meta.last_death == 'heliosphere'", shot: 'keep' },
          { speaker: 'subaru', text: 'She smiled. She said sorry. And then that same white light, from arm’s length.', thought: true, if: "meta.last_death == 'shaula'", shot: 'keep' },
          { speaker: 'subaru', text: 'The stars. Every wrong one burned hotter than the last — and the last one didn’t stop burning.', thought: true, if: "meta.last_death == 'taygeta'", shot: 'keep' },
          { speaker: 'subaru', text: 'The crack of the whip between the shelves — and then white. Shaula’s light, all the way up here. “Don’t damage the books.” She meant every word.', thought: true, if: "meta.last_death == 'library'", shot: 'keep' },
          { speaker: 'subaru', text: 'Chopsticks. I never even saw them move. One flick, and I was on the stone with my ribs caved in.', thought: true, if: "meta.last_death == 'combat.reid'", shot: 'keep' },
          { speaker: 'subaru', text: 'The ground opened under me. Teeth, all the way down. It felt every step I took.', thought: true, if: "meta.last_death == 'combat.sand_earthworm'", shot: 'keep' },
          { speaker: 'subaru', text: 'Teeth. Claws. The sand going red... I died. Again.', thought: true, if: { all: ["meta.last_death != 'heliosphere'", "meta.last_death != 'shaula'", "meta.last_death != 'taygeta'", "meta.last_death != 'library'", "meta.last_death != 'combat.sand_earthworm'", "meta.last_death != 'combat.reid'"] }, shot: 'keep' },
          { speaker: 'subaru', text: 'The fire. The carriage. The same night. ...I’m back.', thought: true, if: "meta.checkpoint == 'camp_night'", shot: 'keep' },
          { speaker: 'subaru', text: 'The edge of the plaza. The glass behind me, the jackals still asleep on the stones. ...Okay. This time I know how many there are.', thought: true, if: "meta.checkpoint == 'plaza_edge'", shot: 'keep' },
          { speaker: 'subaru', text: 'The plaza. The jackals dead at my feet — and under the sand, it’s still down there. Waiting.', thought: true, if: "meta.checkpoint == 'plaza'", shot: 'keep' },
          { speaker: 'subaru', text: 'Celaeno. The gate behind me, Shaula humming by the dais like nothing happened. For her, nothing did.', thought: true, if: "meta.checkpoint == 'celaeno'", shot: 'keep' },
          { speaker: 'subaru', text: 'Wind. Stars. Reid on his stone with his bowl, like he never moved. For him, he didn’t.', thought: true, if: "meta.checkpoint == 'electra'", shot: 'keep' },
          { speaker: 'subaru', text: 'Paper and old leather. Taygeta’s library, the lectern in front of me. The trial’s still solved — at least the tower lets me keep that.', thought: true, if: "meta.checkpoint == 'library'", shot: 'keep' },
          { speaker: 'subaru', text: 'Leaves. Green light. Rem, asleep right where I left her. ...I’m back. Of course I came back here.', thought: true, if: "meta.checkpoint == 'alcyone'", shot: 'keep' },
          { speaker: 'emilia', text: 'Subaru? You went pale all of a sudden. Are you all right?', expression: 'thinking', to: 'subaru' },
          { speaker: 'meili', text: 'Onii-san smells funny all of a sudden. Like something really, really old.', expression: 'thinking' },
          { speaker: 'patrasche', text: '(Patrasche presses against Subaru’s back, snorting at a scent only she can smell.)' },
        ],
        choices: [
          { text: 'I’m fine. Just... a bad dream.', goto: 'fine' },
          { text: 'Listen. I died just now. There’s a light on that tower that—', goto: 'taboo', effects: [{ witch: 'punish' }] },
        ],
      },
      taboo: {
        lines: [
          { speaker: 'subaru', text: 'Her hand. Around my heart. Every time I try to say it...', thought: true, expression: 'pain' },
          { speaker: 'emilia', text: 'Subaru!', expression: 'surprised', to: 'subaru' },
          { speaker: 'subaru', text: 'It’s — it’s nothing. Let’s just... be careful tomorrow. Really careful.', expression: 'pain', anim: 'sigh' },
        ],
        next: 'fine',
      },
      fine: {
        lines: [
          { speaker: 'emilia', text: '...If you say so. But you don’t have to carry everything by yourself, okay?', expression: 'sad', to: 'subaru' },
          { speaker: 'subaru', text: 'I know what’s out there now. That has to count for something.', thought: true, expression: 'determined' },
        ],
      },
    },
  },
];
