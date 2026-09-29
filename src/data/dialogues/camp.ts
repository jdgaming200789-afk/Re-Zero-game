import type { DialogueDef } from '../../story/dialogue/Dialogue';

/**
 * The first night at the foot of the Pleiades Watchtower.
 *
 * Voices: Emilia is earnest and a little formal ("Mm."), Beatrice calls
 * herself Betty and ends lines with "I suppose" / "in fact", Ram calls
 * Subaru "Barusu", Meili calls him "Onii-san", Echidna — speaking through
 * Anastasia — calls him "Natsuki-kun", Julius is courtly. Rem sleeps in the
 * carriage; no one but Subaru remembers her, not even Ram.
 */
export const CAMP_OPENING: DialogueDef = {
  id: 'camp.opening',
  cast: ['subaru', 'emilia', 'beatrice', 'julius', 'ram', 'anastasia', 'meili', 'patrasche'],
  start: 'start',
  letterbox: true,
  nodes: {
    start: {
      lines: [
        { speaker: 'emilia', text: 'We really made it... Subaru, look. The tower is still there. It didn’t disappear again.', expression: 'happy', to: 'subaru' },
        { speaker: 'subaru', text: 'Yeah. Three days of the Sand Time walking us in circles, and now it’s just... standing there. Like it was waiting for us.', anim: 'shrug' },
        { speaker: 'beatrice', text: 'Betty has sand in places sand has no business being, in fact. If the tower is waiting, it can wait until morning, I suppose.', expression: 'annoyed' },
        { speaker: 'meili', text: 'The beasties are all tucked in for the night, Onii-san. Mostly. The big one under the dunes doesn’t listen to anybody.', expression: 'happy' },
        { speaker: 'subaru', text: 'The big *what* under the dunes?', expression: 'surprised', to: 'meili' },
        { speaker: 'meili', text: 'Hehe. You’ll see.', expression: 'smug', anim: 'laugh' },
        { speaker: 'ram', text: 'Ram checked the carriage. The girl is still asleep. Her hands are warm.', to: 'subaru' },
        { speaker: 'subaru', text: 'Rem. Her own sister doesn’t remember her name... and still checks on her every single night.', thought: true },
        { speaker: 'julius', text: 'The Sage of the Pleiades Watchtower. If anyone in this world can undo what Gluttony devoured, it is the Sage. Rem’s sleep. The memories of those who were taken.', anim: 'handOnChest', effects: [{ learn: 'people.rem' }] },
        { speaker: 'julius', text: '...And, perhaps, a name that no one remembers.', expression: 'sad', anim: 'lookDown' },
        { speaker: 'subaru', text: 'We’ll get it back, Julius. Your name too. I’m not letting the whole world forget you.', expression: 'determined', to: 'julius', effects: [{ learn: 'people.julius_name' }] },
        { speaker: 'julius', text: 'Then I shall hold you to it, Subaru.', expression: 'happy', anim: 'nod' },
        {
          speaker: 'anastasia',
          text: 'The stories say the Sage has watched these dunes for four hundred years, Natsuki-kun. Four hundred years guarding one door means someone is very particular about who opens it.',
          expression: 'smug',
          anim: 'explain',
          effects: [{ learn: 'tower.sage' }],
        },
        { speaker: 'emilia', text: 'Then we’ll just have to ask very, very politely.', expression: 'determined', anim: 'fist' },
        { speaker: 'beatrice', text: 'Asking politely has never once worked for Subaru, I suppose.', expression: 'smug' },
        { speaker: 'subaru', text: 'Hey! It works like... thirty percent of the time.', anim: 'facepalm' },
      ],
      next: 'plan',
    },
    plan: {
      lines: [{ speaker: 'emilia', text: 'So... what do we do now, Subaru?', expression: 'thinking', to: 'subaru', shot: 'single' }],
      choices: [
        {
          text: 'Nobody crosses the glass out in the open. Stay behind the ruins. ...Trust me.',
          goto: 'warn',
          if: 'know.heliosphere.movement',
          insight: true,
          effects: [{ set: 'tf.warned_party' }],
        },
        { text: 'We rest tonight. Tomorrow we walk up and knock.', goto: 'rest', effects: [{ set: 'tf.plan', to: 'rest' }] },
        { text: 'Let’s scout the ruins first. I want to see what we’re walking into.', goto: 'scout', effects: [{ set: 'tf.plan', to: 'scout' }] },
        { text: '(Look at the carriage.)', goto: 'rem', once: true },
      ],
    },
    rem: {
      lines: [
        { speaker: 'subaru', text: 'Hang in there, Rem. Just a little longer. We’re at the tower. I promised I’d wake you up, and I meant it.', thought: true },
        { speaker: 'emilia', text: 'Subaru? You were somewhere far away just now.', expression: 'sad', to: 'subaru' },
        { speaker: 'subaru', text: 'Sorry. Just... thinking about who’s waiting on us.', anim: 'sigh' },
      ],
      next: 'plan',
    },
    rest: {
      lines: [
        { speaker: 'emilia', text: 'Mm. That sounds nice. Everyone’s been so tired.', expression: 'happy', anim: 'nod' },
        { speaker: 'julius', text: 'I will take the first watch.', anim: 'handOnChest' },
        { speaker: 'ram', text: 'Barusu can take the second. And the third.', expression: 'smug' },
        { speaker: 'subaru', text: 'The third watch is literally just sunrise.' },
      ],
      next: 'close',
    },
    scout: {
      lines: [
        { speaker: 'julius', text: 'A sensible precaution. The ruins between here and the gate have not been walked in centuries.', anim: 'nod' },
        { speaker: 'meili', text: 'Don’t go on the shiny part, Onii-san.', expression: 'happy', to: 'subaru' },
        { speaker: 'subaru', text: 'The shiny part?', expression: 'thinking', to: 'meili' },
        { speaker: 'meili', text: 'The shiny part.', expression: 'smug' },
      ],
      next: 'close',
    },
    warn: {
      lines: [
        { speaker: 'julius', text: 'You say that as though you have already seen it.', expression: 'surprised', to: 'subaru' },
        { speaker: 'subaru', text: 'I have. I watched that light burn me into a shadow on the glass.', thought: true },
        { speaker: 'subaru', text: 'Call it a hunch. A very, very strong hunch.', anim: 'shrug' },
        { speaker: 'emilia', text: '...Okay. I believe you, Subaru.', expression: 'determined', anim: 'nod' },
        { speaker: 'ram', text: 'Ram will pretend that made sense.', expression: 'annoyed' },
      ],
      next: 'close',
    },
    close: {
      lines: [
        { speaker: 'anastasia', text: 'Then it’s settled. Tomorrow, the Watchtower.', expression: 'smug' },
        { speaker: 'patrasche', text: '(Patrasche lowers her head beside Subaru and huffs, warm and dusty.)', expression: 'happy' },
        { speaker: 'subaru', text: 'Yeah, yeah. You too, Patrasche. Best girl.', expression: 'happy', to: 'patrasche', effects: [{ quest: 'watchtower' }] },
      ],
    },
  },
};
