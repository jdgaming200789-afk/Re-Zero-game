import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * Alcyone: laying Rem down in the Green Room (Ram feels the hole where her
 * sister was without knowing why; Julius, whom the world forgot, is the one
 * who says it best), Subaru's quiet visits to her bedside, and a night on
 * the balcony with Emilia where he finds his own sky — and the story of the
 * hunter the scorpion killed.
 */
export const ALCYONE_DIALOGUES: DialogueDef[] = [
  {
    id: 'alc.rem',
    cast: ['subaru', 'emilia', 'beatrice', 'ram', 'meili', 'julius', 'anastasia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'meili', text: 'It smells like after the rain in here, Onii-san!', expression: 'joy', anim: 'wave' },
          { speaker: 'anastasia', text: 'Mana pools in this room like water in a basin. Whoever sleeps here will want for nothing — not food, not even water. Remarkable work.', expression: 'thinking', to: 'subaru', effects: [{ learn: 'tower.green_room' }] },
          { speaker: 'emilia', text: 'Then this is the best place for her. She’ll be comfortable here. I just know it.', expression: 'happy', to: 'subaru' },
          { speaker: 'subaru', text: 'Yeah. Yeah, it is.', expression: 'sad', anim: 'nod' },
          { speaker: 'ram', text: '...Barusu.', expression: 'thinking', to: 'subaru' },
          { speaker: 'ram', text: 'Ram does not know this girl. Ram has never seen her face before in her life.', expression: 'neutral' },
          { speaker: 'ram', text: 'So why does looking at her feel like reaching for something that should be there — and isn’t?', expression: 'sad', anim: 'lookDown' },
          { speaker: 'subaru', text: 'Because she’s your sister. Because you loved her more than anyone in the world. And Gluttony took even that.', thought: true, expression: 'pain' },
        ],
        choices: [
          { text: 'She’s someone important. To both of us.', goto: 'important' },
          { text: '(Say nothing.)', goto: 'silent' },
        ],
      },
      important: {
        lines: [
          { speaker: 'ram', text: '...Both of us. Barusu says the strangest things.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'ram', text: 'Ram will allow it. Just this once.', expression: 'neutral', effects: [{ set: 'alc.ram_told' }] },
        ],
        next: 'rest',
      },
      silent: {
        lines: [{ speaker: 'subaru', text: 'Not yet. When I tell her, I want Rem awake to hear it.', thought: true, expression: 'determined' }],
        next: 'rest',
      },
      rest: {
        lines: [
          { speaker: 'beatrice', text: 'Betty will keep an eye on the mana in this room. For your sake, not hers, I suppose.', expression: 'annoyed', to: 'subaru' },
          { speaker: 'julius', text: 'Whoever she is to you, Subaru, she is fortunate to be remembered so fiercely.', expression: 'sad', anim: 'handOnChest', to: 'subaru' },
          { speaker: 'subaru', text: 'Julius, of all people. The guy the whole world forgot.', thought: true },
          { speaker: 'emilia', text: 'Everyone — let’s give them a little time.', expression: 'happy', anim: 'nod' },
        ],
      },
    },
  },
  {
    id: 'alc.rem_alone',
    cast: ['subaru'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'Hey, Rem. We made it. The Pleiades Watchtower. Took us long enough, huh?', expression: 'happy', shot: 'keep' },
          { speaker: 'subaru', text: 'There’s a library upstairs that’s supposed to know everything. Everything. So somewhere up there is the way to wake you up.', shot: 'keep' },
          { speaker: null, text: 'Rem breathes, slow and even. Nothing else.', shot: 'keep' },
          { speaker: 'subaru', text: 'So sleep a little longer, okay? I’ll get your name back. Your memories. All of it. That’s a promise.', expression: 'determined', shot: 'keep', effects: [{ set: 'alc.promised' }] },
        ],
      },
    },
  },
  {
    id: 'alc.vigil',
    cast: ['subaru'],
    start: 'start',
    nodes: {
      start: {
        lines: [
          { speaker: 'subaru', text: 'The first trial’s done, Rem. Turns out knowing the stars of a world nobody else remembers is good for something.', expression: 'happy', shot: 'keep', if: 'tay.trial_cleared' },
          { speaker: 'subaru', text: 'I died again. ...You’d be so mad at me. You’d cry, and then you’d be mad at me.', expression: 'sad', shot: 'keep', if: { all: ['meta.deaths > 0', '!tay.trial_cleared'] } },
          { speaker: 'subaru', text: 'Still asleep. Still here. Some days that has to be enough.', shot: 'keep', if: { all: ['meta.deaths == 0', '!tay.trial_cleared'] } },
          { speaker: null, text: 'Her hand is warm. The leaves overhead stir without any wind.', shot: 'keep' },
        ],
        choices: [
          { text: '“I’ll be back soon.”', goto: 'bye' },
          { text: 'Stay a little longer.', goto: 'longer' },
        ],
      },
      longer: {
        lines: [
          { speaker: 'subaru', text: 'You know what Beako said? That this room keeps you alive all by itself. So you’re not allowed to go anywhere. Doctor’s orders.', expression: 'happy', shot: 'keep' },
          { speaker: 'subaru', text: 'Okay. Now I’ll go.', shot: 'keep' },
        ],
      },
      bye: {},
    },
  },
  {
    id: 'alc.balcony',
    cast: ['subaru', 'emilia'],
    start: 'start',
    letterbox: true,
    nodes: {
      start: {
        lines: [
          { speaker: 'emilia', text: 'Subaru? I thought I might find you out here.', expression: 'happy', to: 'subaru' },
          { speaker: 'subaru', text: 'Couldn’t sleep. Too many stars.', anim: 'shrug' },
          { speaker: 'emilia', text: 'They’re so bright here. There isn’t a single light for miles and miles.', expression: 'surprised' },
          { speaker: 'subaru', text: 'And there it is again. Orion. My sky, hanging over a world that isn’t mine.', thought: true, if: 'tf.saw_orion' },
          { speaker: 'subaru', text: 'Wait — three in a row, a bright one down at the corner... That’s Orion. I know that one. From home.', expression: 'surprised', if: '!tf.saw_orion', effects: [{ set: 'tf.saw_orion' }] },
          { speaker: 'emilia', text: 'Orion? Is that one of the constellations from your country?', expression: 'thinking', to: 'subaru' },
          { speaker: 'subaru', text: 'Orion the hunter. The story goes he bragged he could kill any beast alive — so the gods sent a scorpion, and it stung him dead.', anim: 'explain', to: 'emilia' },
          { speaker: 'subaru', text: 'They put them both in the sky afterwards, on opposite sides. The scorpion rises when Orion sets. He’s still running from it.' },
          { speaker: 'emilia', text: 'That’s so sad... but kind of sweet, too. They never have to meet again.', expression: 'sad' },
          { speaker: 'subaru', text: 'See the blue-white one at his foot? That’s Rigel. Brightest star in the whole constellation — outshines red Betelgeuse up at his shoulder.', anim: 'explain', effects: [{ learn: 'sky.orion_myth' }] },
          { speaker: 'subaru', text: 'And the scorpion’s stinger, the star at the tip of its tail... that one’s called—', expression: 'thinking' },
          { speaker: 'subaru', text: '...Shaula.', thought: true, expression: 'surprised', effects: [{ learn: 'sky.shaula_star' }] },
          { speaker: 'emilia', text: 'Subaru? What’s wrong?', expression: 'thinking', to: 'subaru' },
        ],
        choices: [
          { text: 'Nothing. Just remembered something.', goto: 'nothing' },
          { text: 'Emilia-tan. What do you see up there?', goto: 'see' },
        ],
      },
      nothing: {
        lines: [{ speaker: 'emilia', text: 'Then remember it tomorrow. Tonight, just rest. Okay?', expression: 'happy', anim: 'nod' }],
      },
      see: {
        lines: [
          { speaker: 'emilia', text: 'Hmm... I see a lot of little lights that were there long before any of us. And they’re still shining.', expression: 'happy' },
          { speaker: 'emilia', text: 'So whatever’s at the top of this tower, we’ll still be here tomorrow too. All of us. Okay?', expression: 'determined', to: 'subaru' },
          { speaker: 'subaru', text: '...Okay.', expression: 'happy', effects: [{ add: 'bond.emilia' }] },
        ],
      },
    },
  },
];
