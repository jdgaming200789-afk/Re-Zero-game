import { Group, Mesh, MeshStandardMaterial, PointLight, BoxGeometry, type Material, type Object3D } from 'three';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';
import { Interactable } from '../../interaction/Interactable';
import { polar } from '../../scene/procedural/RoundHall';

const log = createLogger('Library');
const DEG = Math.PI / 180;

/** Where Hadrian's book waits: a low shelf just left of the stair down. */
const HADRIAN_ANGLE = 10.4 * DEG;
const SHELF_RADIUS = 20 - 0.4;

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
 * State (world flags, so it rewinds): lib.searched_rem, lib.hadrian_found,
 * lib.read_hadrian, lib.warned.
 */
export class Library {
  private readonly offs: Array<() => void> = [];
  private readonly owned: Array<{ dispose(): void }> = [];
  private book: Group | null = null;
  private glow: PointLight | null = null;
  private glowMat: MeshStandardMaterial | null = null;
  private pulse = 0;

  constructor(
    private readonly game: GameContext,
    private readonly scope: string,
    private readonly root: Object3D,
    /** Is the library standing (and not being dreamed away by a memory)? */
    private readonly open: () => boolean,
  ) {
    // The glow exists from the start (dark): adding a light later would make
    // every material recompile mid-scene.
    const light = new PointLight(0xffd9a0, 0, 2.6, 2);
    light.position.copy(polar(SHELF_RADIUS - 0.7, HADRIAN_ANGLE, 0.93));
    root.add(light);
    this.glow = light;
    const ev = game.events;
    this.offs.push(
      ev.on('story:event', ({ id }) => {
        if (id === 'lib.hadrian_found') this.showBook();
      }),
      ev.on('combat:playerAction', () => this.violence()),
    );
  }

  /** Put the library into the state the flags describe (entry, the library rising). */
  populate(): void {
    if (this.game.state.bool('lib.hadrian_found')) this.showBook();
  }

  private showBook(): void {
    if (this.book) return;
    const g = this.game;
    const grp = new Group();
    grp.name = 'HadrianBook';
    const p = polar(SHELF_RADIUS - 0.34, HADRIAN_ANGLE, 0.83);
    grp.position.copy(p);
    // Facing into the room, the spine towards the reader.
    grp.rotation.y = HADRIAN_ANGLE + Math.PI;
    const cover = new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.glowMat = cover;
    const pages = new MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
    const body = new Mesh(new BoxGeometry(0.05, 0.3, 0.22), [cover, cover, cover, cover, cover, pages] as Material[]);
    // Pulled half out of the row, tilted, as if someone had just touched it.
    body.position.z = 0.06;
    body.rotation.z = 0.12;
    body.castShadow = true;
    grp.add(body);
    this.root.add(grp);
    this.book = grp;
    this.owned.push(body.geometry, cover, pages);

    const e = g.world.spawn('lib.hadrian_book', this.scope, { parent: grp });
    e.add(
      new Interactable({
        id: 'lib.hadrian_book',
        kind: 'read',
        verb: 'Read',
        label: 'Hadrian’s book',
        range: 2.2,
        angle: 70,
        condition: (game) => this.open() && !game.cinematics.playing,
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.cinematics.play('lib.hadrian');
        },
      }),
    );
    log.info('Hadrian’s book is on its shelf');
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
    if (!this.glow || !this.glowMat || !this.book) return;
    // It belongs to the shelves: gone while a memory dreams them away.
    const here = this.open();
    this.book.visible = here;
    // Unread, it breathes a warm light; read, it's just a book again.
    const unread = here && !this.game.state.bool('lib.read_hadrian');
    this.pulse += dt;
    const target = unread ? 0.9 + Math.sin(this.pulse * 2.2) * 0.35 : 0;
    this.glow.intensity += (target * 1.6 - this.glow.intensity) * Math.min(1, dt * 4);
    this.glowMat.emissiveIntensity += (target * 0.9 - this.glowMat.emissiveIntensity) * Math.min(1, dt * 4);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const o of this.owned.splice(0)) o.dispose();
    this.glow?.removeFromParent();
    this.book?.removeFromParent();
    this.book = null;
  }
}
