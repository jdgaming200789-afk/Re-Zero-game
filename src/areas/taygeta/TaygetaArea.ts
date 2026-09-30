import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  PointLight,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Area, type AreaMap, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { KitBatch } from '../../scene/kit/KitBatch';
import type { KitLibrary } from '../../scene/kit/KitLibrary';
import { doorRecess, polar } from '../../scene/procedural/RoundHall';
import { Library } from './Library';
import { NightSky } from '../../render/sky/NightSky';
import { Interactable, type InteractableOptions } from '../../interaction/Interactable';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { Rng, damp } from '../../core/math/MathUtil';
import { createLogger } from '../../core/Log';
import { TRIAL_ANSWER } from '../../data/constellations';
import { StarTrial, type TrialStar } from './StarTrial';

const log = createLogger('Taygeta');

const R = 20;
const HEIGHT = 12;
const DEG = Math.PI / 180;
const DOOR_HALF = Math.asin(1.3 / R);
/** Damage a wrong star does (Subaru has 100): the fourth guess kills. */
const BURN = 30;

/** 'memory': a Book of the Dead is being lived — the library dreams away into night. */
type Look = 'white' | 'sky' | 'library' | 'memory';

const GRADES: Record<Look, ColorGrade> = {
  white: { lift: [0.04, 0.04, 0.045], gamma: [1, 1, 1], gain: [1, 1, 1.02], saturation: 0.7, contrast: 0.92, temperature: -0.05, tint: 0 },
  sky: { lift: [0.0, 0.004, 0.012], gamma: [1, 1, 1.03], gain: [0.98, 1, 1.05], saturation: 0.95, contrast: 1.12, temperature: -0.25, tint: 0.02 },
  library: { lift: [0.02, 0.014, 0.008], gamma: [1, 1, 1], gain: [1.04, 1.0, 0.94], saturation: 1.0, contrast: 1.06, temperature: 0.15, tint: 0 },
  // Someone else's memory: faded, warm at the edges, like an old photograph.
  memory: { lift: [0.012, 0.009, 0.004], gamma: [1.02, 1, 0.98], gain: [1.04, 0.99, 0.9], saturation: 0.5, contrast: 1.02, temperature: 0.3, tint: 0.02 },
};

/** Surface colours per look: [floor, walls]. */
const SURFACES: Record<Look, { floor: Color; floorEmissive: number; wall: Color; wallEmissive: number; wallOpacity: number; rough: number; metal: number }> = {
  white: { floor: new Color(0xf1f3f7), floorEmissive: 0.5, wall: new Color(0xf4f6fa), wallEmissive: 0.62, wallOpacity: 1, rough: 0.6, metal: 0 },
  sky: { floor: new Color(0x070a12), floorEmissive: 0, wall: new Color(0x070a12), wallEmissive: 0, wallOpacity: 0, rough: 0.14, metal: 0.55 },
  library: { floor: new Color(0x5a3f2b), floorEmissive: 0, wall: new Color(0x3b2a1e), wallEmissive: 0, wallOpacity: 1, rough: 0.55, metal: 0.05 },
  memory: { floor: new Color(0x0d0b08), floorEmissive: 0, wall: new Color(0x0d0b08), wallEmissive: 0, wallOpacity: 0, rough: 0.2, metal: 0.5 },
};

/**
 * Taygeta — the first trial. A white room with nothing in it but a black
 * monolith and a question. Reading it turns the room into night: the walls
 * dissolve, the stars come down within reach, and Subaru has to touch the
 * right one. Wrong stars burn. The right one turns the white room into the
 * library the Sage promised.
 */
class TaygetaArea extends Area {
  readonly id = 'taygeta';
  readonly displayName = 'Taygeta';
  readonly subtitle = 'The Third Floor — the first trial.';
  private look: Look = 'white';
  private kit!: KitLibrary;
  private floorMat!: MeshStandardMaterial;
  private wallMat!: MeshStandardMaterial;
  private sky!: NightSky;
  private skyEnv: Texture | null = null;
  private roomEnv: Texture | null = null;
  private trial!: StarTrial;
  private hemi!: HemisphereLight;
  private fill!: DirectionalLight;
  private monolith!: Group;
  private library: Group | null = null;
  private libraryBatch: KitBatch | null = null;
  private libraryRise = 1;
  private books: Library | null = null;
  private busy = false;
  private readonly owned: Array<{ dispose(): void }> = [];

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const mats = g.environment.materials;
    const [kit, stone] = await Promise.all([g.environment.kit(), mats.get('limestone_smooth')]);
    this.kit = kit;
    onProgress(0.3);

    const s = SURFACES.white;
    this.floorMat = new MeshStandardMaterial({ color: s.floor.clone(), emissive: new Color(0xe6eaf2), emissiveIntensity: s.floorEmissive, roughness: s.rough, metalness: s.metal });
    this.wallMat = new MeshStandardMaterial({ color: s.wall.clone(), emissive: new Color(0xe9edf5), emissiveIntensity: s.wallEmissive, roughness: 0.95, transparent: true, opacity: 1, side: BackSide });
    this.owned.push(this.floorMat, this.wallMat);

    // Floor, walls (with the stairwell gap at the south), ceiling.
    const floor = new Mesh(new CircleGeometry(R + 0.6, 96), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    this.trackCollider(g.physics.addDisc(new Vector3(0, 0, 0), R + 0.6));
    const wall = new Mesh(new CylinderGeometry(R, R, HEIGHT, 128, 1, true, DOOR_HALF, Math.PI * 2 - 2 * DOOR_HALF), this.wallMat);
    wall.position.y = HEIGHT / 2;
    const lintel = new Mesh(new CylinderGeometry(R, R, HEIGHT - 3.8, 8, 1, true, -DOOR_HALF, 2 * DOOR_HALF), this.wallMat);
    lintel.position.y = 3.8 + (HEIGHT - 3.8) / 2;
    // Faces up: the (back-sided) wall material shows it from below.
    const ceiling = new Mesh(new CircleGeometry(R + 0.1, 96), this.wallMat);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = HEIGHT;
    this.root.add(wall, lintel, ceiling);
    for (let i = 0; i < 48; i++) {
      const a = ((i + 0.5) / 48) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 5 * DEG) continue;
      const p = polar(R + 0.25, a, HEIGHT / 2);
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a);
      this.trackCollider(g.physics.addBox(p, new Vector3(1.4, HEIGHT / 2, 0.25), q));
    }
    this.trackCollider(doorRecess(this.root, g.physics, { angle: 0, radius: R + 0.02, baseY: 0, dir: 'down', mat: stone }));
    onProgress(0.5);

    this.buildMonolith();
    this.trial = new StarTrial();
    this.root.add(this.trial.root);
    this.sky = new NightSky({ moonDir: new Vector3(-0.3, -0.4, 0.9), orionDir: new Vector3(0, 0.62, -0.78), starBrightness: 2.8, milkyWay: 1.3 });
    this.sky.mesh.visible = false;
    this.root.add(this.sky.mesh);
    this.skyEnv = this.sky.buildEnvironment(g.render.renderer);
    const pmrem = new PMREMGenerator(g.render.renderer);
    this.roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    onProgress(0.7);

    this.hemi = new HemisphereLight(0xffffff, 0xdfe3ea, 1.6);
    this.fill = new DirectionalLight(0x9fb4ff, 0);
    this.fill.position.set(2, 10, 4);
    this.root.add(this.hemi, this.fill);
    const motes = g.vfx.addEmitter(new ParticleEmitter({ ...ParticlePresets.dustMotes(new Vector3(30, 8, 30), 300), colorA: new Color(0.8, 0.85, 1.0), colorB: new Color(1, 1, 1) }), this.scope);
    motes.anchor.set(0, 4, 0);
    this.root.add(motes);

    this.addInteractables();
    this.addSpawn('default', 0, 0, 15.6, 180);
    this.addSpawn('arrive', 0, 0, 15.6, 180);
    this.addMarkers();
    this.listen('story:event', ({ id }) => {
      if (id === 'tay.sky') this.setLook('sky', 2.8);
      else if (id === 'tay.library' && !this.library) {
        this.raiseLibrary(false);
        this.setLook('library', 0);
      } else if (id === 'lib.memory_begin') this.setLook('memory', 0);
      else if (id === 'lib.memory_end') this.setLook(this.library ? 'library' : 'white', 0);
    });
    const rigel = this.trial.star(TRIAL_ANSWER)!;
    this.addSpawn('tay.rigel', rigel.home.x, rigel.home.y, rigel.home.z, 0);
    onProgress(1);
  }

  private buildMonolith(): void {
    const tex = inscriptionTexture();
    const face = new MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.22, metalness: 0.35, emissiveMap: tex, emissive: new Color(0xffd9a0), emissiveIntensity: 1.6 });
    const body = new MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.22, metalness: 0.35 });
    this.owned.push(tex, face, body);
    const grp = new Group();
    // Front (+Z) carries the inscription.
    const slab = new Mesh(new BoxGeometry(1.3, 3.4, 0.42), [body, body, body, body, face, body]);
    slab.position.y = 1.7 + 0.25;
    slab.castShadow = true;
    const plinth = new Mesh(new BoxGeometry(1.9, 0.25, 1.0), body);
    plinth.position.y = 0.125;
    grp.add(slab, plinth);
    this.root.add(grp);
    this.monolith = grp;
    this.trackCollider(this.game.physics.addBox(new Vector3(0, 1.8, 0), new Vector3(0.95, 1.8, 0.5), null));
  }

  private addMarkers(): void {
    const mark = (id: string, x: number, y: number, z: number, yaw = 0) => this.addSpawn(id, x, y, z, yaw);
    mark('tay.read', 0, 0, 1.6, 180);
    mark('tay.cam_monolith', 1.9, 1.8, 3.6);
    mark('tay.monolith_face', 0, 2.3, 0.2);
    mark('tay.cam_sky', 0, 1.4, 6.5);
    mark('tay.sky_look', 0, 7, -14);
    mark('tay.cam_high', 9, 7.5, 9);
    mark('tay.center', 0, 1.2, 0);
    // Hadrian's book: the reader stands before the shelf by the stair.
    const hb = polar(17.6, 10.4 * DEG);
    mark('lib.hadrian_read', hb.x, 0, hb.z, 10.4);
    // His memory: low over the dark mirror of a floor, towards Orion.
    mark('lib.mem_cam', 0, 0.9, 4);
    mark('lib.mem_look', 0, 6.5, -14);
    mark('lib.mem_cam_up', 0, 0.5, -2);
    mark('lib.mem_up', 0, 12, -10);
    const party: Array<[string, number, number]> = [
      ['emilia', -1.4, 3.1],
      ['beatrice', 1.2, 2.9],
      ['julius', -2.5, 4.0],
      ['ram', 2.4, 4.1],
      ['anastasia', -0.6, 4.6],
      ['meili', 1.1, 4.8],
      ['patrasche', 3.6, 5.2],
    ];
    for (const [id, x, z] of party) mark(`tay.${id}`, x, 0, z, 180);
  }

  // ------------------------------------------------------------------ looks

  private setLook(look: Look, seconds: number): void {
    this.look = look;
    this.trial.targetPresence = look === 'sky' ? 1 : 0;
    this.trial.live = look === 'sky';
    if (seconds <= 0) this.trial.presence = this.trial.targetPresence;
    this.lookBlend = seconds;
    if (this.library) this.library.visible = look !== 'memory';
    if (seconds <= 0) this.applySurfaces(1);
    this.game.scenes.applyAtmosphere(this, seconds);
  }

  private lookBlend = 0;

  private applySurfaces(k: number): void {
    const s = SURFACES[this.look];
    this.floorMat.color.lerp(s.floor, k);
    this.floorMat.emissiveIntensity += (s.floorEmissive - this.floorMat.emissiveIntensity) * k;
    this.floorMat.roughness += (s.rough - this.floorMat.roughness) * k;
    this.floorMat.metalness += (s.metal - this.floorMat.metalness) * k;
    this.wallMat.color.lerp(s.wall, k);
    this.wallMat.emissiveIntensity += (s.wallEmissive - this.wallMat.emissiveIntensity) * k;
    this.wallMat.opacity += (s.wallOpacity - this.wallMat.opacity) * k;
    this.wallMat.depthWrite = this.wallMat.opacity > 0.98;
    this.sky.mesh.visible = this.look === 'sky' || this.look === 'memory' || this.wallMat.opacity < 0.99;
    // Under the stars, a cool starlight fill keeps faces readable.
    const night = this.look === 'sky' || this.look === 'memory';
    const hemiTarget = this.look === 'white' ? 1.6 : night ? 0.4 : 0.55;
    this.hemi.intensity += (hemiTarget - this.hemi.intensity) * k;
    this.hemi.color.lerp(this.look === 'library' ? _warm : night ? _blue : _white, k);
    this.fill.intensity += ((night ? 1.3 : 0) - this.fill.intensity) * k;
  }

  override onEnter(): void {
    const g = this.game;
    if (g.state.bool('tay.trial_cleared')) {
      this.raiseLibrary(true);
      this.setLook('library', 0);
    } else if (g.state.bool('tay.trial_started')) this.setLook('sky', 0);
    else this.setLook('white', 0);
  }

  // ------------------------------------------------------------------ the trial

  private async touch(s: TrialStar): Promise<void> {
    const g = this.game;
    if (this.busy || !this.trial.live) return;
    this.busy = true;
    try {
      g.events.emit('story:event', { id: `tay.touch.${s.key}` });
      if (s.key === TRIAL_ANSWER) {
        log.info('Rigel');
        this.trial.live = false;
        this.trial.flareStar(s, 3);
        await g.cinematics.play('tay.solved');
        return;
      }
      await this.burn(s);
    } finally {
      this.busy = false;
    }
  }

  /** A wrong star: it flares white-hot and burns him. */
  private async burn(s: TrialStar): Promise<void> {
    const g = this.game;
    this.trial.flareStar(s, 2.6);
    const fails = g.state.add('tay.fails', 1);
    log.info(`Wrong star ${s.key} (${fails})`);
    g.events.emit('audio:stinger', { id: 'star_burn' });
    void g.ui.fade(0.6, 0.05, '#fff1d8').then(() => g.ui.fade(0, 0.6, '#fff1d8'));
    const player = g.player;
    const h = player ? g.combat.get(player.entity.id) : undefined;
    if (player && h) {
      const dir = new Vector3().subVectors(player.entity.object3D.position, s.home).setY(0).normalize();
      g.combat.damage(h, { amount: BURN, type: 'light', sourceId: null, point: s.home.clone(), direction: dir, stagger: 40, knockback: 2.4, hitStop: 0.08, tags: ['cause:taygeta'] });
    }
    await g.scheduler.wait(1.1, false);
    if (g.rbd.dying) return;
    await g.dialogue.play('tay.fail');
  }

  // ------------------------------------------------------------------ the library

  /** The shelves rise out of the floor (or are simply there, `instant`). */
  private raiseLibrary(instant: boolean): void {
    if (this.library) return;
    const g = this.game;
    const lib = new Group();
    lib.name = 'Library';
    const b = new KitBatch(this.kit, g.physics, 30);
    this.libraryBatch = b;
    const spines: BufferGeometry[] = [];
    const rng = new Rng(19);
    const shelf = (x: number, z: number, rotY: number, y = 0, collide = true) => {
      b.place('Bookshelf', x, y, z, { rotY, collide });
      for (const hgt of [0.155, 0.655, 1.155, 1.655, 2.155]) {
        if (rng.chance(0.12)) continue;
        const w = rng.range(1.2, 1.84);
        const off = rng.range(-(1.84 - w) / 2, (1.84 - w) / 2);
        const geo = new BoxGeometry(w, rng.range(0.28, 0.36), 0.3);
        const row = rng.int(0, 7);
        const u0 = rng.range(0, 0.4);
        const uv = geo.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * w * 0.28, (row + uv.getY(i)) / 8);
        geo.translate(off, hgt + geo.parameters.height / 2, 0.02);
        geo.rotateY(rotY);
        geo.translate(x, y, z);
        spines.push(geo.toNonIndexed());
        geo.dispose();
      }
    };
    // Shelves line the wall in three tiers, all the way round.
    const n = 58;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 4.5 * DEG) continue;
      const p = polar(R - 0.4, a);
      for (const tier of [0, 3.15, 6.3]) shelf(p.x, p.z, a + Math.PI, tier, tier === 0);
    }
    // Freestanding stacks radiating from the centre.
    for (let k = 0; k < 10; k++) {
      const a = ((k + 0.5) / 10) * Math.PI * 2;
      for (const r of [9.2, 11.4, 13.6]) {
        const c = polar(r, a);
        const t = new Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.24);
        shelf(c.x + t.x, c.z + t.z, a + Math.PI / 2);
        shelf(c.x - t.x, c.z - t.z, a - Math.PI / 2);
      }
    }
    // The great lectern where the monolith stood, with a black book on it.
    b.place('Lectern', 0, 0, 0.3, { rotY: 0 });
    b.place('Book', 0.02, 1.08, 0.36, { rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2 + 0.35), collide: false });
    b.build(lib);
    const spineTex = spineTexture();
    const spineMat = new MeshStandardMaterial({ map: spineTex, roughness: 0.75 });
    this.owned.push(spineTex, spineMat);
    const books = new Mesh(mergeGeometries(spines), spineMat);
    spines.forEach((s) => s.dispose());
    books.receiveShadow = true;
    lib.add(books);
    // Warm reading lights floating among the stacks.
    const lampMat = new MeshStandardMaterial({ color: 0x302010, emissive: 0xffc27a, emissiveIntensity: 3.2 });
    this.owned.push(lampMat);
    for (let k = 0; k < 6; k++) {
      const p = polar(k % 2 ? 6 : 15.5, ((k + 0.5) / 6) * Math.PI * 2, 4.6);
      const orb = new Mesh(new SphereGeometry(0.16, 12, 8), lampMat);
      orb.position.copy(p);
      const l = new PointLight(0xffb870, 36, 16, 2);
      l.position.copy(p);
      lib.add(orb, l);
    }
    this.root.add(lib);
    this.library = lib;
    this.libraryRise = instant ? 1 : 0;
    lib.position.y = instant ? 0 : -9.5;
    this.monolith.visible = false;
    // Colliders exist at their final places from the start (the scene is a cinematic).
    this.trackCollider(b.colliders);
    this.addLibraryInteractables();
    this.books = new Library(g, this.scope, this.root, () => this.library !== null && this.look === 'library');
    this.books.populate();
  }

  // ------------------------------------------------------------------ interactions

  private addInteractables(): void {
    const g = this.game;
    const add = (pos: Vector3 | null, opts: InteractableOptions) => {
      const e = g.world.spawn(opts.id, this.scope, { parent: this.root });
      if (pos) e.object3D.position.copy(pos);
      e.add(new Interactable(opts));
    };
    add(new Vector3(0, 2.0, 0.5), {
      id: 'tay.monolith',
      kind: 'read',
      verb: 'Read',
      label: 'Black monolith',
      range: 2.6,
      condition: (game) => !game.state.bool('tay.trial_cleared'),
      handler: async (ctx) => {
        await ctx.contact;
        if (ctx.game.state.bool('tay.trial_started')) await ctx.game.dialogue.play('tay.monolith_again');
        else await ctx.game.cinematics.play('tay.monolith');
      },
    });
    add(null, {
      id: 'tay.star',
      kind: 'use',
      verb: 'Touch',
      label: 'Star',
      range: 3.2,
      angle: 180,
      anchor: this.trial.pointer,
      requiresLineOfSight: false,
      animation: 'touch',
      priority: 2,
      condition: () => this.trial.live && this.trial.aimed !== null && !this.busy,
      handler: async (ctx) => {
        const s = this.trial.aimed;
        if (!s) return;
        await ctx.contact;
        await this.touch(s);
      },
    });
    add(polar(R - 0.6, 0, 1.6), {
      id: 'tay.to_alcyone',
      kind: 'door',
      verb: 'Descend',
      label: 'Stairs down — Alcyone',
      range: 2.6,
      angle: 80,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.scenes.goto('alcyone', 'from_taygeta', { loadingScreen: true, fadeSeconds: 0.8 });
      },
    });
  }

  private addLibraryInteractables(): void {
    const g = this.game;
    const e = g.world.spawn('tay.black_book', this.scope, { parent: this.root });
    e.object3D.position.set(0, 1.2, 0.4);
    e.add(
      new Interactable({
        id: 'tay.black_book',
        kind: 'read',
        verb: 'Open',
        label: 'Black book',
        range: 2.4,
        handler: async (ctx) => {
          await ctx.contact;
          ctx.game.state.set('tay.touched_book', true);
          // What these books are, and a name to look for.
          await ctx.game.dialogue.play('lib.lectern');
        },
      }),
    );
  }

  override update(dt: number): void {
    const g = this.game;
    const t = g.time.elapsed;
    if (this.lookBlend > 0) this.applySurfaces(1 - Math.pow(2, -dt / (this.lookBlend * 0.3)));
    const player = g.player ? { position: g.player.entity.object3D.position } : null;
    this.trial.update(dt, g.render.camera, player);
    this.sky.update(t, g.render.camera.position);
    if (this.library && this.libraryRise < 1) {
      this.libraryRise = Math.min(1, this.libraryRise + dt / 4.5);
      const u = this.libraryRise;
      this.library.position.y = -9.5 * Math.pow(1 - u, 3);
      if (u >= 1) g.camera.shake.add(0.15);
    }
    this.libraryBatch?.update(dt, g.render.camera.position);
    this.books?.update(dt);
    void damp;
  }

  override surfaceAt(): 'soft' | 'glass' | 'wood' {
    // The white room swallows sound; the night sky's floor is a mirror.
    return this.look === 'white' ? 'soft' : this.look === 'library' ? 'wood' : 'glass';
  }

  override map(): AreaMap {
    return {
      bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
      paint(ctx) {
        ctx.fillStyle = '#10131b';
        ctx.fillRect(-24, -24, 48, 48);
        ctx.fillStyle = '#d9dde6';
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16181f';
        ctx.fillRect(-0.65, -0.21, 1.3, 0.42);
      },
      labels: [
        { text: 'Taygeta', x: 0, z: -6, size: 1.1 },
        { text: 'Monolith', x: 0, z: 2 },
        { text: 'Down — Alcyone', x: 0, z: R + 2.5 },
      ],
    };
  }

  atmosphere(): AtmosphereProfile {
    const look = this.look;
    if (look === 'sky' || look === 'memory') {
      return {
        background: new Color(0x02030a),
        environment: this.skyEnv,
        environmentIntensity: 0.6,
        fog: { density: 0 },
        grade: GRADES[look],
        exposure: 1.45,
        music: look === 'memory' ? 'cinematic' : 'mystery',
        tension: 0.25,
        keyLight: new Vector3(0.2, 0.9, 0.3),
        rim: { color: new Color(0.6, 0.72, 1.0), strength: 0.7 },
      };
    }
    if (look === 'library') {
      return {
        background: new Color(0x0c0906),
        environment: this.roomEnv,
        environmentIntensity: 0.25,
        fog: { color: new Color(0x1a120c), glowColor: new Color(0x3a2616), density: 0.01, heightFalloff: 0.05, baseHeight: 0, glowPower: 5, maxOpacity: 0.5 },
        grade: GRADES.library,
        exposure: 1.3,
        music: 'safe',
        tension: 0,
        keyLight: new Vector3(0.3, 0.8, 0.4),
        rim: { color: new Color(1.0, 0.72, 0.45), strength: 0.45 },
      };
    }
    return {
      background: new Color(0xe9edf5),
      environment: this.roomEnv,
      environmentIntensity: 0.9,
      fog: { color: new Color(0xeef1f7), glowColor: new Color(0xffffff), density: 0.018, heightFalloff: 0.02, baseHeight: 0, glowPower: 2, maxOpacity: 0.55 },
      grade: GRADES.white,
      exposure: 1.0,
      music: 'mystery',
      tension: 0.1,
      keyLight: new Vector3(0, 1, 0.2),
      rim: { color: new Color(0.9, 0.93, 1.0), strength: 0.25 },
    };
  }

  override dispose(): void {
    this.trial?.dispose();
    this.books?.dispose();
    this.libraryBatch?.dispose();
    this.sky?.dispose();
    this.skyEnv?.dispose();
    this.roomEnv?.dispose();
    for (const o of this.owned) o.dispose();
    super.dispose();
  }
}

const _warm = new Color(0xffd9b0);
const _blue = new Color(0x8fa6ff);
const _white = new Color(0xffffff);

/** Gold letters cut into the monolith's face (also its glow mask). */
function inscriptionTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1280;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c9a55a';
  g.strokeStyle = '#c9a55a';
  g.lineWidth = 3;
  g.strokeRect(40, 60, 432, 1160);
  g.strokeRect(54, 74, 404, 1132);
  // An unknown script: rows of angular glyphs Subaru can somehow read.
  const rng = new Rng(8);
  for (let row = 0; row < 14; row++) {
    let x = 90;
    const y = 170 + row * 72;
    while (x < 420) {
      const w = rng.range(18, 34);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x + rng.range(0, w), y - rng.range(0, 40));
      g.stroke();
      x += w + rng.range(8, 16);
    }
  }
  // The seven sisters above the text.
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(256 + Math.cos(i * 0.9) * (i ? 40 : 0), 118 + Math.sin(i * 1.7) * (i ? 18 : 0), i ? 5 : 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Eight rows of book spines in leather colours with gilt bands. */
function spineTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const rng = new Rng(4);
  const leathers = ['#5b1d22', '#1f2c4c', '#344a2c', '#5a3a24', '#6b4a2a', '#3a2a4a', '#7a5a2a', '#2a3a3a', '#8a2a2a', '#4a4a52'];
  for (let row = 0; row < 8; row++) {
    let x = 0;
    const y0 = row * 64;
    g.fillStyle = '#120c08';
    g.fillRect(0, y0, 1024, 64);
    while (x < 1024) {
      const w = rng.range(9, 22);
      const h = rng.range(40, 64);
      g.fillStyle = rng.pick(leathers);
      g.fillRect(x, y0 + 64 - h, w - 1, h);
      g.fillStyle = 'rgba(214, 180, 110, 0.75)';
      g.fillRect(x + 1, y0 + 64 - h + 5, w - 3, 2);
      g.fillRect(x + 1, y0 + 64 - 9, w - 3, 2);
      if (rng.chance(0.5)) g.fillRect(x + w / 2 - 2, y0 + 64 - h / 2 - 5, 3, 10);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + w - 2, y0 + 64 - h, 1, h);
      x += w;
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export default (game: GameContext) => new TaygetaArea(game);
