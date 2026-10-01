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
  'plaza.pack_waves': {
    title: 'More than we could see',
    text: 'The jackals sleeping on the plaza aren’t the whole pack. When the first of them fall, four more come howling in off the eastern dunes. Save something for them.',
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
  'people.shaula': {
    title: 'Shaula, the Star Guardian',
    text: 'She calls me “Master” and says she waited four hundred years for me. She keeps the tower’s rules — and says she’ll kill anyone who breaks them. Even me. With a smile.',
    category: 'people',
  },
  'tower.rules': {
    title: 'The rules of the tower',
    text: 'Don’t leave before the trials are cleared. Clear the trials. Don’t damage the books in the library. Don’t damage the tower. Break one, and Shaula comes for you.',
    category: 'lore',
  },
  'people.shaula_rules': {
    title: 'She keeps her word',
    text: 'I took one step toward the gate before the trials were cleared. Shaula said sorry, smiled, and the world went white. “Master” or not, the rules come first.',
    category: 'people',
  },
  'tower.green_room': {
    title: 'The Green Room',
    text: 'A room in Alcyone overgrown with green, thick with mana. Whoever sleeps there needs no food or water. Rem sleeps there now.',
    category: 'lore',
  },
  'sky.orion_myth': {
    title: 'Orion and the scorpion',
    text: 'Back home, Orion the hunter was stung to death by a scorpion the gods sent after him. They hang on opposite sides of the sky. Orion’s brightest star is Rigel, blue-white at his foot — brighter than red Betelgeuse at his shoulder.',
    category: 'lore',
  },
  'tower.light_stair': {
    title: 'The stair of light',
    text: 'When Emilia made Reid take a step, a stair of light came down out of the sky to Electra — to the floor above, and the Divine Dragon Volcanica. Only she can climb it. We decided she shouldn’t go alone. Not yet.',
    category: 'lore',
  },
  'people.gluttony_book': {
    title: 'What was in Reid’s book',
    text: 'Opening the Sword Saint’s Book of the Dead, something of Gluttony’s was reading with me. It ate. I woke up on the library floor remembering nothing since the night I walked home from the convenience store.',
    category: 'people',
  },
  'sky.taygeta_answer': {
    title: 'Taygeta’s answer',
    text: 'Shaula is the stinger at the tip of the scorpion’s tail; the hero the scorpion killed is Orion; his greatest splendour is his brightest star, Rigel — blue-white at the hunter’s foot. Find the three stars of his belt, then go down to his foot.',
    category: 'lore',
  },
  'sky.shaula_star': {
    title: 'The scorpion’s stinger',
    text: 'In my world, the star at the tip of the scorpion’s tail — the stinger that killed Orion — is called Shaula. The same name as the Star Guardian. A coincidence. Probably.',
    category: 'lore',
  },
  'tower.taygeta_riddle': {
    title: 'Taygeta’s question',
    text: 'The black monolith in Taygeta asks: “Touch upon the greatest splendour of the hero destroyed by Shaula.” Then the white room became a sky full of stars within reach.',
    category: 'lore',
  },
  'tower.taygeta_burns': {
    title: 'Wrong stars burn',
    text: 'In Taygeta, every star that isn’t the answer burns like the real thing. Guess wrong enough times and there’s nothing left of you. The tower doesn’t forgive guesses.',
    category: 'danger',
  },
  'people.julius_name': {
    title: 'Julius’s name',
    text: 'Gluttony ate Julius’s name. The whole world forgot him. He walks with us anyway, and he never complains about it — which is somehow worse.',
    category: 'people',
  },
  'flats.hadrian': {
    title: 'Someone crossed before us',
    text: 'A pack half-buried by the ruins, and a journal page: two travellers reached the tower before us. “Hadrian says we cross the glass at first light.” The page ends in the middle of a warning.',
    category: 'people',
  },
  'library.books': {
    title: 'The Books of the Dead',
    text: 'Every book in Taygeta’s library is somebody’s life — somebody dead. Open one and you don’t read it: you live it, their memories pouring into yours until you forget where you end.',
    category: 'lore',
  },
  'library.rem_alive': {
    title: 'No book for Rem',
    text: 'I looked for Rem’s book. There isn’t one. The library only keeps the dead — so Rem, asleep in the Green Room, is still alive. Still waiting. I’ve never been so glad to fail at something.',
    category: 'people',
  },
  'library.hadrian': {
    title: 'Hadrian’s last morning',
    text: 'I read Hadrian’s book. He crossed the glass at first light, running, laughing at the star that blinked. The light found him halfway. He wasn’t afraid until the very end — and then he thought of Maren.',
    category: 'people',
  },
  'library.rule': {
    title: 'Not in the library',
    text: 'Swinging a whip between the shelves of the dead counts as “damaging the books.” Shaula doesn’t care about intentions. Neither does her light.',
    category: 'danger',
  },
  'people.reid': {
    title: 'Reid Astrea',
    text: 'The first Sword Saint — or the shade of him this tower keeps on Electra. Loud, rude, bored, and so far beyond everyone that he fights with a pair of chopsticks.',
    category: 'people',
  },
  'reid.attention': {
    title: 'He watches one of us at a time',
    text: 'Reid gives his attention to whoever came at him last — usually Julius, the other swordsman — and flicks away anyone in front of him. Nobody touches him head-on. But he isn’t watching behind him.',
    category: 'danger',
  },
  'people.rem': {
    title: 'Rem',
    text: 'Rem has been asleep since Gluttony took her name and memories. Nobody but me remembers her. Not even her sister. I came here to wake her up.',
    category: 'people',
  },
};
