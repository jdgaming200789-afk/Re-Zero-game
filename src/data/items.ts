/**
 * Items. Counts live in world flags (`inv.<id>`), so the inventory rewinds
 * with Return by Death like everything else Subaru owns.
 */
export interface ItemDef {
  id: string;
  name: string;
  kind: 'consumable' | 'key' | 'document';
  description: string;
  /** Documents: the text read from the journal. */
  text?: string;
  /** What "Use" does; see Inventory.use(). */
  use?: 'heal' | 'ring';
  /** Verb on the use prompt. */
  verb?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  tonic: {
    id: 'tonic',
    name: 'Healing Tonic',
    kind: 'consumable',
    description: 'A bitter herbal draught from the capital. Mends cuts and bruises. Does nothing at all for the soul.',
    use: 'heal',
    verb: 'Drink',
  },
  carriage_bell: {
    id: 'carriage_bell',
    name: 'Carriage Bell',
    kind: 'key',
    description: 'The brass bell from the dragon carriage’s harness. Loud enough to wake the dead — or whatever sleeps under the sand.',
    use: 'ring',
    verb: 'Ring',
  },
  journal_page: {
    id: 'journal_page',
    name: 'Faded Journal Page',
    kind: 'document',
    description: 'Found in a half-buried pack near the ruins. The ink has run; some lines are still legible.',
    text: '…third day since the sand stopped moving in circles. The tower is so close. Hadrian says we cross the glass at first light. I told him about the star at the top, how it blinks when you run. He laughed. …The glass was so bright. Do not run on the glass. Do not run on the',
  },
};

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS[id];
}
