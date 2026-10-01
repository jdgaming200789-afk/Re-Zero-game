import { Group, Mesh, MeshStandardMaterial, PointLight, BoxGeometry, type Material, type Object3D } from 'three';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';
import { Interactable } from '../../interaction/Interactable';
import { polar } from '../../scene/procedural/RoundHall';

const log = createLogger('Library');
const DEG = Math.PI / 180;

const SHELF_RADIUS = 20 - 0.4;

/** The Books of the Dead the story needs, where they wait once found. */
interface BookDef {
  id: string;
  label: string;
  /** Around the room (radians) and how high on the shelf. */
  angle: number;
  height: number;
  cover: number;
  found: string;
  read: string;
  event: string;
  cinematic: string;
}

const BOOKS: BookDef[] = [
  // A low shelf just left of the stair down.
  { id: 'hadrian', label: 'Hadrian’s book', angle: 10.4 * DEG, height: 0.83, cover: 0x2a1a12, found: 'lib.hadrian_found', read: 'lib.read_hadrian', event: 'lib.hadrian_found', cinematic: 'lib.hadrian' },
  // Shelved high, as if put out of reach (Ram fetched it down to the reading desk).
  { id: 'reid', label: 'Reid Astrea’s book', angle: -32 * DEG, height: 1.02, cover: 0x7a1a14, found: 'lib.reid_found', read: 'lib.read_reid', event: 'lib.reid_found', cinematic: 'lib.reid_book' },
];

/** Where Hadrian's book waits (the memory staging uses it). */
export const HADRIAN_ANGLE = BOOKS[0]!.angle;
export const REID_ANGLE = BOOKS[1]!.angle;

/**
 * Taygeta's library once the trial is cleared: the Books of the Dead.
 *
 * - The black book on the lectern opens the conversation about what these
 *   books are, and lets Subaru search for a name (`lib.lectern`): Rem has no
 *   book — she isn't dead; Hadrian, whose name was on a journal page in the
 *   pack by the ruins, does.
 * - Once found, Hadrian's book glows on its shelf; reading it is his last
 *   morning, lived (`lib.hadrian`).
 * - Shaula's rule: "Don't damage the books." Violence between the shelves
 *   earns a warning, and then her light.
 *
 * - After Electra, Ram finds Reid Astrea's book, shelved out of reach.
 *   Reading it is where something of Gluttony's is waiting
 *   (`lib.reid_book`): Subaru wakes up remembering no one.
 *
 * State (world flags, so it rewinds): lib.searched_rem, lib.hadrian_found,
 * lib.read_hadrian, lib.reid_found, lib.read_reid, lib.warned.
 */
export class Library {
  private readonly offs: Array<() => void> = [];
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly books = new Map<string, { def: BookDef; group: Group; glow: PointLight; mat: MeshStandardMaterial | null }>();
  private pulse = 0;

  constructor(
    private readonly game: GameContext,
    private readonly scope: string,
    private readonly root: Object3D,
    /** Is the library standing (and not being dreamed away by a memory)? */
    private readonly open: () => boolean,
  ) {
    // Each book's glow exists from the start (dark): adding a light later
    // would make every material recompile mid-scene.
    for (const def of BOOKS) {
      const light = new PointLight(0xffd9a0, 0, 2.6, 2);
      light.position.copy(polar(SHELF_RADIUS - 0.7, def.angle, def.height + 0.1));
      root.add(light);
      this.books.set(def.id, { def, group: new Group(), glow: light, mat: null });
    }
    const ev = game.events;
    this.offs.push(
      ev.on('story:event', ({ id }) => {
        for (const def of BOOKS) if (id === def.event) this.showBook(def);
      }),
      ev.on('combat:playerAction', () => this.violence()),
    );
  }

  /** Put the library into the state the flags describe (entry, the library rising). */
  populate(): void {
    for (const def of BOOKS) if (this.game.state.bool(def.found)) this.showBook(def);
  }

  private showBook(def: BookDef): void {
    const entry = this.books.get(def.id)!;
    if (entry.mat) return;
    const g = this.game;
    const grp = entry.group;
    grp.name = `${def.id[0]!.toUpperCase()}${def.id.slice(1)}Book`;
    grp.position.copy(polar(SHELF_RADIUS - 0.34, def.angle, def.height));
    // Facing into the room, the spine towards the reader.
    grp.rotation.y = def.angle + Math.PI;
    const cover = new MeshStandardMaterial({ color: def.cover, roughness: 0.6, emissive: 0xffd9a0, emissiveIntensity: 0 });
    entry.mat = cover;
    const pages = new MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
    const body = new Mesh(new BoxGeometry(0.05, 0.3, 0.22), [cover, cover, cover, cover, cover, pages] as Material[]);
    // Pulled half out of the row, tilted, as if someone had just touched it.
    body.position.z = 0.06;
    body.rotation.z = 0.12;
    body.castShadow = true;
    grp.add(body);
    this.root.add(grp);
    this.owned.push(body.geometry, cover, pages);

    const e = g.world.spawn(`lib.${def.id}_book`, this.scope, { parent: grp });
    e.add(
      new Interactable({
        id: `lib.${def.id}_book`,
        kind: 'read',
        verb: 'Read',
        label: def.label,
        range: 2.2,
        angle: 70,
        condition: (game) => this.open() && !game.cinematics.playing && !game.state.bool(def.read),
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.cinematics.play(def.cinematic);
        },
      }),
    );
    log.info(`${def.label} is on its shelf`);
  }

  /** "Don't damage the books." Beatrice warns once a loop; Shaula doesn't. */
  private violence(): void {
    const g = this.game;
    if (!this.open() || g.cinematics.playing || g.rbd.dying) return;
    if (!g.state.bool('lib.warned')) {
      g.state.set('lib.warned', true);
      g.events.emit('bark:play', { speakerId: 'beatrice', text: 'Not in here, you fool! “Don’t damage the books” — or have you forgotten Shaula already?', duration: 3.4 });
      return;
    }
    log.info('Violence in the library: the rule is broken');
    g.rbd.die('library');
  }

  update(dt: number): void {
    // They belong to the shelves: gone while a memory dreams them away.
    const here = this.open();
    this.pulse += dt;
    for (const { def, group, glow, mat } of this.books.values()) {
      if (!mat) continue;
      group.visible = here;
      // Unread, a book breathes a warm light; read, it's just a book again.
      const unread = here && !this.game.state.bool(def.read);
      const target = unread ? 0.9 + Math.sin(this.pulse * 2.2) * 0.35 : 0;
      glow.intensity += (target * 1.6 - glow.intensity) * Math.min(1, dt * 4);
      mat.emissiveIntensity += (target * 0.9 - mat.emissiveIntensity) * Math.min(1, dt * 4);
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const o of this.owned.splice(0)) o.dispose();
    for (const b of this.books.values()) {
      b.glow.removeFromParent();
      b.group.removeFromParent();
    }
    this.books.clear();
  }
}
