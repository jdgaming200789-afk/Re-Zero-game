import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Area, type AreaMap, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { KitBatch } from '../../scene/kit/KitBatch';
import { doorRecess, polar, ringWalls } from '../../scene/procedural/RoundHall';
import { Foliage } from '../../scene/procedural/Foliage';
import { FollowShadowLight } from '../../render/lighting/FollowShadowLight';
import { NightSky } from '../../render/sky/NightSky';
import { Fire } from '../../vfx/Fire';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { Interactable, type InteractableOptions } from '../../interaction/Interactable';
import { SHADOW_MAP_SIZE } from '../../settings/Settings';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';
import { Rng } from '../../core/math/MathUtil';

const R = 20;
const SEG = 32;
const CEIL = 6;
const DEG = Math.PI / 180;
/** Radius where the sector partitions end, each capped by a column. */
const INNER = 11.5;
/** Partitions between the six sectors (degrees). */
const RADIALS = [30, 90, 150, 210, 270, 330];
/** Ring-wall segments (of 32) that are doors. */
const DOOR_DOWN = 0;
const DOOR_BALCONY = 16;
const DOOR_UP = 18;
const WINDOWS = new Set([9, 11, 13, 14, 20, 22, 24, 26, 28]);
const OUTER = R / Math.cos(Math.PI / SEG) + 0.8;
/** Rem's bed in the Green Room, headboard to the outer wall. */
const BED_ANGLE = 128 * DEG;
const BED = polar(18.85, BED_ANGLE);
const BED_YAW = BED_ANGLE + Math.PI;

export const ALCYONE_GRADE: ColorGrade = {
  lift: [0.02, 0.012, 0.008],
  gamma: [1.0, 1.0, 1.02],
  gain: [1.03, 0.99, 0.94],
  saturation: 1.0,
  contrast: 1.08,
  temperature: 0.12,
  tint: 0.0,
};

const segAngle = (i: number) => (i / SEG) * Math.PI * 2;

/**
 * Alcyone — the floor above Celaeno, where the tower's keepers once lived.
 * Six rooms open off a round hall with a long dining table under a lantern
 * ring: the entry by the stair from Celaeno, a hearth and pantry, the Green
 * Room (walled off, overgrown, where Rem sleeps), the way up to Taygeta and
 * a balcony over the moonlit dunes, the bedrooms, and a small study.
 * After Celaeno's cold stone this is the first warm place in the tower.
 */
class AlcyoneArea extends Area {
  readonly id = 'alcyone';
  readonly displayName = 'Alcyone';
  readonly subtitle = 'The Fourth Floor — the keepers’ quarters.';
  private env: Texture | null = null;
  private moon!: FollowShadowLight;
  private batch!: KitBatch;
  private foliage!: Foliage;
  private sky!: NightSky;
  private readonly owned: Array<{ dispose(): void }> = [];

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const mats = g.environment.materials;
    const [kit, stone, limestone, wood, sandMat, linen, azure, crimson, emerald, gold] = await Promise.all([
      g.environment.kit(),
      mats.get('sandstone_ashlar'),
      mats.get('limestone_smooth'),
      mats.get('wood_dark'),
      mats.get('sand'),
      mats.get('fabric__linen'),
      mats.get('fabric__azure'),
      mats.get('fabric__crimson'),
      mats.get('fabric__emerald'),
      mats.get('gold'),
    ]);
    void gold;
    onProgress(0.3);

    const b = new KitBatch(kit, g.physics, 24);
    this.batch = b;
    this.buildShell(b, stone, wood);
    onProgress(0.45);
    this.placeHall(b, crimson, gold as Material);
    this.placeSectors(b, crimson, emerald);
    this.buildGreenRoom(b, limestone, linen, azure);
    this.buildBalcony(b, limestone, sandMat);
    b.build(this.root);
    this.trackCollider(b.colliders);
    onProgress(0.75);

    this.light();
    this.addInteractables();
    this.addZone('alc.green_room', polar(16, 120 * DEG, 1.5), new Vector3(3.2, 1.5, 3.2));
    this.addZone('alc.balcony', polar(23, Math.PI, 1.5), new Vector3(3.6, 1.5, 1.8));
    this.addZone('alc.hall', new Vector3(0, 1.5, 0), new Vector3(6, 1.5, 6));
    this.listen('story:event', ({ id }) => {
      if (id === 'alc.rem_laid') this.setQuilt(true);
    });

    this.addSpawn('default', 0, 0, 14, 180);
    this.addSpawn('stairs', 0, 0, 16.8, 180);
    this.addSpawn('from_taygeta', polar(18.4, segAngle(DOOR_UP)).x, 0, polar(18.4, segAngle(DOOR_UP)).z, (segAngle(DOOR_UP) + Math.PI) / DEG);
    const gr = polar(15.2, 122 * DEG);
    this.addSpawn('green_room', gr.x, 0, gr.z, 128 + 180 - 360);
    this.addStageMarkers();
    onProgress(1);
  }

  // ------------------------------------------------------------------ structure

  private buildShell(b: KitBatch, stone: Material, wood: Material): void {
    const g = this.game;
    ringWalls(b, {
      radius: R,
      baseY: 0,
      segments: SEG,
      pieceAt: (i) => (i === DOOR_DOWN || i === DOOR_BALCONY || i === DOOR_UP ? 'Wall_4x6_Door' : WINDOWS.has(i) ? 'Wall_4x6_Window' : 'Wall_4x6'),
    });
    // Partitions between the rooms, each ending in a column at the hall.
    for (const deg of RADIALS) {
      const a = deg * DEG;
      const len = (R + 0.1 - INNER) / 2;
      for (const k of [0, 1]) {
        const p = polar(INNER + len * (k + 0.5), a);
        b.place('Wall_4x6', p.x, 0, p.z, { rotY: a + Math.PI / 2, scale: new Vector3(len / 4, 1, 0.55) });
      }
      const c = polar(INNER, a);
      b.place('Column_6', c.x, 0, c.z, { rotY: a });
    }
    // Stairwells behind the doors (down to Celaeno, up to Taygeta's white).
    const glowTex = verticalGlow();
    const glowUp = new MeshBasicMaterial({ map: glowTex, color: new Color(0.9, 0.93, 1.0) });
    this.owned.push(glowUp, glowTex);
    const stairLight = new PointLight(0xdfe8ff, 10, 7, 2);
    stairLight.position.copy(polar(OUTER + 1.4, segAngle(DOOR_UP), 3));
    this.root.add(stairLight);
    this.trackCollider(doorRecess(this.root, g.physics, { angle: segAngle(DOOR_DOWN), radius: OUTER, baseY: 0, dir: 'down', mat: stone }));
    this.trackCollider(doorRecess(this.root, g.physics, { angle: segAngle(DOOR_UP), radius: OUTER, baseY: 0, dir: 'up', mat: stone, glow: glowUp }));

    // Plank floor and a beamed ceiling (UVs in metres for the tiling wood).
    const floor = new Mesh(metreUVs(new CircleGeometry(R + 0.6, 72)), wood);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    this.trackCollider(g.physics.addCylinder(new Vector3(0, -0.15, 0), 0.15, R + 0.6));
    const ceiling = new Mesh(metreUVs(new CircleGeometry(R + 0.9, 72)), wood);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = CEIL;
    ceiling.receiveShadow = true;
    ceiling.castShadow = true;
    this.root.add(ceiling);
    const beams: BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 15 * DEG;
      const bg = new BoxGeometry(0.28, 0.34, R - 1.2);
      bg.translate(0, CEIL - 0.17, (R - 1.2) / 2 + 1.2);
      bg.rotateY(a);
      beams.push(bg);
    }
    const hub = new CylinderGeometry(1.3, 1.3, 0.4, 24);
    hub.translate(0, CEIL - 0.2, 0);
    beams.push(hub);
    for (let i = 0; i < 36; i++) {
      const a = ((i + 0.5) / 36) * Math.PI * 2;
      const len = 2 * INNER * Math.sin(Math.PI / 36) + 0.05;
      const rg = new BoxGeometry(len, 0.4, 0.34);
      rg.translate(0, CEIL - 0.2, INNER * Math.cos(Math.PI / 36));
      rg.rotateY(a);
      beams.push(rg);
    }
    const beamMesh = new Mesh(mergeGeometries(beams.map((x) => x.toNonIndexed())), wood);
    beams.forEach((x) => x.dispose());
    beamMesh.castShadow = true;
    beamMesh.receiveShadow = true;
    this.root.add(beamMesh);
  }

  private placeHall(b: KitBatch, crimson: Material, gold: Material): void {
    // The long table: somewhere to eat together, finally.
    for (const x of [-1.1, 1.1]) b.place('Table', x, 0, 0);
    for (const x of [-1.5, 0, 1.5]) {
      b.place('Chair', x, 0, -0.9, { rotY: 0 });
      b.place('Chair', x, 0, 0.9, { rotY: Math.PI });
    }
    b.place('Chair', -2.65, 0, 0, { rotY: Math.PI / 2 });
    b.place('Chair', 2.65, 0, 0, { rotY: -Math.PI / 2 });
    b.place('Urn', -0.6, 0.82, 0.1, { scale: 0.45, collide: false });
    b.place('Book', 0.9, 0.82, -0.2, { rotY: 0.4, collide: false });
    this.rug(new Vector3(0, 0.012, 0), 9.4, 9.4, 'round', crimson);
    // Runner from the stair door into the hall.
    this.rug(new Vector3(0, 0.011, 13.6), 2.2, 9, 'runner', crimson);
    void gold;
  }

  private placeSectors(b: KitBatch, crimson: Material, emerald: Material): void {
    const at = (name: string, r: number, deg: number, opts: { rot?: number; y?: number; scale?: number | Vector3; collide?: boolean } = {}) => {
      const p = polar(r, deg * DEG);
      b.place(name, p.x, opts.y ?? 0, p.z, { rotY: opts.rot ?? deg * DEG + Math.PI, scale: opts.scale, collide: opts.collide });
    };
    // South: the entry by the stair from Celaeno.
    at('Bench', 18.6, 342);
    at('Bench', 18.6, 18);
    at('Urn', 19.1, 330.5);
    at('Urn', 19.1, 29.5);
    for (const deg of [348.75, 11.25]) at('Banner', 20.05, deg, { y: 2.2, collide: false, scale: new Vector3(1.1, 1.3, 1) });

    // South-east: hearth and pantry.
    at('Bench', 15.4, 60, { rot: 60 * DEG });
    at('Chair', 16.4, 46, { rot: 60 * DEG + 0.5 });
    at('Chair', 16.4, 74, { rot: 60 * DEG - 0.5 });
    at('Crate', 18.4, 84, { rot: 0.3 });
    at('Crate', 18.7, 80, { rot: 1.1, y: 0 });
    at('Crate', 18.5, 83, { rot: 0.7, y: 0.7, scale: 0.8 });
    at('Urn', 17.2, 86);
    at('Urn', 17.7, 88.5);
    at('Chest', 18.6, 36);
    this.rug(polar(15.8, 60 * DEG, 0.012), 3.2, 4.6, 'rect', crimson, 60 * DEG);

    // North: the way up and the balcony.
    at('Bench', 18.2, 165);
    at('Urn', 19.0, 172);
    at('Urn', 19.0, 188);
    at('Banner', 20.05, 202.5 - 11.25, { y: 2.2, collide: false, scale: new Vector3(1.1, 1.3, 1) });

    // North-west: the bedrooms.
    for (const deg of [219, 237, 255]) {
      at('Bed', 18.9, deg);
      at('Chest', 17.25, deg, { rot: deg * DEG + Math.PI, scale: 0.9 });
    }
    this.rug(polar(15.6, 240 * DEG, 0.012), 3.6, 7.5, 'rect', emerald, 240 * DEG + Math.PI / 2);

    // South-west: the study.
    for (const deg of [284, 300, 316]) at('Bookshelf', 19.35, deg);
    at('Table', 15.8, 300, { rot: 300 * DEG + Math.PI / 2 });
    at('Chair', 14.8, 300, { rot: 300 * DEG + Math.PI });
    at('Lectern', 16.8, 322, { rot: 322 * DEG + Math.PI });
    const rng = new Rng(41);
    for (let i = 0; i < 6; i++) at('Book', rng.range(15.2, 16.4), 300 + rng.range(-8, 8), { y: 0.82, rot: rng.range(0, 6.28), collide: false });
    for (let i = 0; i < 4; i++) at('Book', rng.range(17, 18.5), 290 + rng.range(-10, 22), { rot: rng.range(0, 6.28), collide: false });
  }

  /** Rem's room: walled off from the hall, overgrown and softly lit. */
  private buildGreenRoom(b: KitBatch, limestone: Material, linen: Material, azure: Material): void {
    // The wall between the hall and the Green Room, with a door in the middle.
    for (const [deg, piece] of [
      [100, 'Wall_4x6'],
      [120, 'Wall_4x6_Door'],
      [140, 'Wall_4x6'],
    ] as const) {
      const a = deg * DEG;
      const p = polar(INNER * Math.cos(10 * DEG), a);
      b.place(piece, p.x, 0, p.z, { rotY: a + Math.PI, scale: new Vector3(1.0, 1, 0.55) });
    }
    b.place('Bed', BED.x, 0, BED.z, { rotY: BED_YAW });
    const chair = this.bedLocal(0.98, 0.15);
    b.place('Chair', chair.x, 0, chair.z, { rotY: BED_YAW - Math.PI / 2 });
    const stand = this.bedLocal(-0.95, -0.55);
    b.place('Crate', stand.x, 0, stand.z, { rotY: BED_YAW, scale: new Vector3(0.7, 0.85, 0.7) });
    b.place('Urn', stand.x, 0.6, stand.z, { scale: 0.42, collide: false });

    // A quilt tucked over the sleeper (under it: the kit bed's own blanket).
    const quilt = new Mesh(roundedBox(1.02, 0.36, 1.36, 0.14), linen);
    const qp = this.bedLocal(0, 0.34, 0.83);
    quilt.position.copy(qp);
    quilt.rotation.y = BED_YAW;
    quilt.castShadow = true;
    quilt.receiveShadow = true;
    const fold = new Mesh(roundedBox(1.04, 0.07, 0.24, 0.03), azure);
    fold.position.copy(this.bedLocal(0, -0.26, 0.99));
    fold.rotation.y = BED_YAW;
    fold.receiveShadow = true;
    this.root.add(quilt, fold);
    this.quiltMeshes = [quilt, fold];
    this.setQuilt(false);

    // Stone planters along both partitions.
    const planterMat = limestone;
    const soil = new MeshStandardMaterial({ color: 0x2b1d14, roughness: 1 });
    this.owned.push(soil);
    const planters: Array<[number, number]> = [
      [90, 1],
      [150, -1],
    ];
    const fol = new Foliage(31, { wind: 0.8, flowerGlow: 0.55 });
    this.foliage = fol;
    const leafA = new Color(0x3f8a45);
    const leafB = new Color(0x2f6e3e);
    const blooms = [new Color(0xfff4f8), new Color(0xffc9dc), new Color(0xd9ecff), new Color(0xfff0b8)];
    for (const [deg, side] of planters) {
      const a = deg * DEG;
      const along = new Vector3(Math.sin(a), 0, Math.cos(a));
      const off = new Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(side * 0.95);
      for (const r of [13.6, 17.4]) {
        const c = along.clone().multiplyScalar(r).add(off);
        const box = new Mesh(new BoxGeometry(0.9, 0.55, 3.2), planterMat);
        box.position.set(c.x, 0.275, c.z);
        box.rotation.y = a;
        box.castShadow = true;
        box.receiveShadow = true;
        const dirt = new Mesh(new BoxGeometry(0.76, 0.02, 3.06), soil);
        dirt.position.set(c.x, 0.54, c.z);
        dirt.rotation.y = a;
        this.root.add(box, dirt);
        this.trackCollider(this.game.physics.addBox(new Vector3(c.x, 0.3, c.z), new Vector3(0.45, 0.3, 1.6), box.quaternion.clone()));
        for (let k = -1; k <= 1; k++) {
          const p = c.clone().addScaledVector(along, k * 1.0).setY(0.55);
          if (k === 0) fol.fern(p, 0.95, leafA, 16);
          else fol.bush(p.clone().setY(0.62), 0.45, k < 0 ? leafB : leafA, 1.2);
        }
        fol.flowers(c.clone().setY(0.55).addScaledVector(along, 0.5), 0.3, 8, blooms, undefined, 0.3);
        fol.flowers(c.clone().setY(0.55).addScaledVector(along, -0.5), 0.3, 6, blooms, undefined, 0.3);
        // Ivy climbing the partition behind the planter.
        fol.ivy(c.clone().addScaledVector(off, 0.1 / 0.95).setY(2.4), off.clone().normalize(), 3.4, 3.6, leafB, 0.8);
      }
    }
    // Ivy and vines over the outer wall and ceiling.
    for (const deg of [101.25, 112.5, 135, 146.25]) {
      const a = deg * DEG;
      const p = polar(R - 0.05, a, 3.2);
      fol.ivy(p, new Vector3(-Math.sin(a), 0, -Math.cos(a)), 3.6, 5.4, leafB, 0.9);
    }
    const rng = new Rng(77);
    for (let i = 0; i < 46; i++) {
      const deg = rng.range(94, 146);
      const r = rng.range(12.4, 19.4);
      const p = polar(r, deg * DEG, CEIL - 0.05);
      // Keep the bed and the space over the chair clear.
      if (p.distanceTo(new Vector3(BED.x, CEIL, BED.z)) < 1.9) continue;
      fol.vine(p, rng.range(0.8, 2.6), rng.chance(0.5) ? leafA : leafB, rng.range(0.11, 0.16));
    }
    // A young tree by the windows, and flowers underfoot along the walls.
    const treeAt = polar(17.2, 105 * DEG);
    const trunk = new Mesh(new CylinderGeometry(0.1, 0.2, 3.3, 10), this.bark());
    trunk.position.set(treeAt.x, 1.65, treeAt.z);
    trunk.castShadow = true;
    this.root.add(trunk);
    this.trackCollider(this.game.physics.addCylinder(new Vector3(treeAt.x, 1.2, treeAt.z), 1.2, 0.22));
    for (const [dx, dy, dz, rad] of [
      [0, 3.4, 0, 1.1],
      [0.6, 3.0, 0.3, 0.8],
      [-0.5, 3.1, -0.4, 0.85],
      [0.2, 3.8, -0.3, 0.7],
    ] as const) {
      fol.bush(new Vector3(treeAt.x + dx, dy, treeAt.z + dz), rad, rng.chance(0.5) ? leafA : new Color(0x4c9a4a), 1.3);
    }
    fol.tuft(new Vector3(treeAt.x, 0, treeAt.z), 0.9, 40, new Color(0x4d8f45), 0.28);
    for (const deg of [98, 110, 132, 142]) fol.flowers(polar(19.1, deg * DEG, 0), 0.55, 14, blooms, undefined, 0.28);
    for (let i = 0; i < 10; i++) fol.tuft(polar(rng.range(12.5, 19), rng.range(95, 145) * DEG, 0), 0.35, 14, new Color(0x3f7f3f), 0.22);
    // Flowers in the urn by the bed.
    fol.flowers(new Vector3(stand.x, 0.95, stand.z), 0.08, 7, blooms, undefined, 0.22);
    this.root.add(fol.build());
  }

  private quiltMeshes: Mesh[] = [];

  /** The quilt only makes sense with Rem under it. */
  setQuilt(visible: boolean): void {
    for (const m of this.quiltMeshes) m.visible = visible;
  }

  private barkMat: Material | null = null;
  private bark(): Material {
    if (!this.barkMat) {
      this.barkMat = new MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 });
      this.owned.push(this.barkMat);
    }
    return this.barkMat;
  }

  /** A point in the bed's frame (x across, z from head to foot, y up). */
  bedLocal(x: number, z: number, y = 0): Vector3 {
    const c = Math.cos(BED_YAW);
    const s = Math.sin(BED_YAW);
    return new Vector3(BED.x + x * c + z * s, y, BED.z - x * s + z * c);
  }

  /** The balcony: a stone terrace outside the north door, over the dunes. */
  private buildBalcony(b: KitBatch, limestone: Material, sandMat: Material): void {
    const g = this.game;
    const slab = new Mesh(new BoxGeometry(8.4, 0.5, 4.6), limestone);
    slab.position.set(0, -0.25, -(OUTER + 2.3 - 0.2));
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.trackCollider(g.physics.addBox(slab.position.clone(), new Vector3(4.2, 0.25, 2.3), null));
    for (const x of [-3.2, 0, 3.2]) {
      const corbel = new Mesh(new BoxGeometry(0.5, 1.2, 3.4), limestone);
      corbel.position.set(x, -1.05, -(OUTER + 1.6));
      corbel.castShadow = true;
      this.root.add(corbel);
    }
    const front = -(OUTER + 4.4);
    for (const x of [-3, -1, 1, 3]) b.place('Balustrade_2', x, 0, front, { rotY: Math.PI });
    for (const s of [-1, 1]) for (const z of [-(OUTER + 1.2), -(OUTER + 3.2)]) b.place('Balustrade_2', s * 4.05, 0, z, { rotY: Math.PI / 2 });
    b.place('Urn', -3.5, 0, -(OUTER + 0.6));
    b.place('Urn', 3.5, 0, -(OUTER + 0.6));

    // Far below: the dunes in moonlight, and the sky Subaru knows.
    this.sky = new NightSky({ moonDir: new Vector3(-0.78, 0.46, 0.22) });
    this.root.add(this.sky.mesh);
    const dunes = new PlaneGeometry(2600, 2600, 120, 120);
    dunes.rotateX(-Math.PI / 2);
    const pos = dunes.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = Math.sin(x * 0.011 + Math.sin(z * 0.006) * 2) * 9 + Math.sin(z * 0.017 + x * 0.004) * 6 + Math.sin((x + z) * 0.03) * 2;
      pos.setY(i, h);
      pos.setXYZ(i, x, h, z);
    }
    dunes.computeVertexNormals();
    metreUVs(dunes, 'xz');
    const ground = new Mesh(dunes, sandMat);
    ground.position.y = -46;
    ground.receiveShadow = false;
    this.root.add(ground);
  }

  // ------------------------------------------------------------------ light & life

  private light(): void {
    const g = this.game;
    const shadow = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality];
    // Moonlight through the western windows.
    this.moon = new FollowShadowLight(0xb4c2e8, 1.5, this.sky.moonDirection, 30, shadow, 70);
    this.moon.addTo(this.root);
    this.moon.update(new Vector3(0, 0, 0));
    this.root.add(new HemisphereLight(0x3a2f28, 0x22170f, 0.7));
    this.env = this.sky.buildEnvironment(g.render.renderer);

    // The lantern ring over the table.
    const lanternMat = new MeshStandardMaterial({ color: 0x302010, emissive: 0xffb45e, emissiveIntensity: 3, roughness: 0.4 });
    const frameMat = new MeshStandardMaterial({ color: 0x6b4f2a, metalness: 0.8, roughness: 0.4 });
    this.owned.push(lanternMat, frameMat);
    const lantern = (x: number, y: number, z: number, light: number, dist = 9) => {
      const grp = new Group();
      const core = new Mesh(new CylinderGeometry(0.11, 0.13, 0.3, 10), lanternMat);
      const cap = new Mesh(new CylinderGeometry(0.05, 0.17, 0.12, 10), frameMat);
      cap.position.y = 0.21;
      const base = new Mesh(new CylinderGeometry(0.16, 0.12, 0.06, 10), frameMat);
      base.position.y = -0.18;
      const chain = new Mesh(new CylinderGeometry(0.012, 0.012, CEIL - y - 0.27, 4), frameMat);
      chain.position.y = (CEIL - y) / 2 + 0.13;
      grp.add(core, cap, base, chain);
      grp.position.set(x, y, z);
      this.root.add(grp);
      if (light > 0) {
        const l = new PointLight(0xffa860, light, dist, 2);
        l.position.set(x, y - 0.1, z);
        this.root.add(l);
      }
    };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lantern(Math.sin(a) * 2.1, 3.9, Math.cos(a) * 1.1, 0);
    }
    const hall = new PointLight(0xffa860, 70, 20, 2);
    hall.position.set(0, 3.6, 0);
    hall.castShadow = false;
    this.root.add(hall);
    lantern(0, 3.8, 15.5, 34, 13);
    lantern(...polar(15, 240 * DEG, 3.8).toArray(), 40, 13);
    lantern(...polar(15.5, 300 * DEG, 3.8).toArray(), 40, 13);
    lantern(...polar(16, 180 * DEG, 3.8).toArray(), 30, 13);

    // The hearth, and its fire.
    const hp = polar(19.1, 60 * DEG);
    this.hearth(hp, 60 * DEG);
    const fire = g.vfx.add(new Fire({ scale: 0.8, lightIntensity: 22, lightDistance: 13 }), this.scope);
    const fp = polar(18.9, 60 * DEG, 0.25);
    fire.position.copy(fp);
    this.root.add(fire);

    // The Green Room: a soft, living light of its own.
    const glowMat = new MeshStandardMaterial({ color: 0x1a2a18, emissive: 0xd8ffc8, emissiveIntensity: 2.4, roughness: 0.8 });
    this.owned.push(glowMat);
    for (const [r, deg] of [
      [14.2, 108],
      [14.6, 134],
      [17.6, 118],
    ] as const) {
      const p = polar(r, deg * DEG, CEIL - 1.5);
      const orb = new Mesh(new SphereGeometry(0.22, 14, 10), glowMat);
      orb.position.copy(p);
      this.root.add(orb);
      const l = new PointLight(0xd8ffd0, 30, 13, 2);
      l.position.copy(p).y -= 0.3;
      this.root.add(l);
    }
    const spores = g.vfx.addEmitter(
      new ParticleEmitter({
        ...ParticlePresets.dustMotes(new Vector3(6, 4.5, 6), 260),
        colorA: new Color(0.85, 1.0, 0.7),
        colorB: new Color(1.0, 0.95, 0.7),
        velocityMin: new Vector3(-0.03, 0.01, -0.03),
        velocityMax: new Vector3(0.03, 0.06, 0.03),
        size: [0.015, 0.035],
        intensity: 1.8,
      }),
      this.scope,
    );
    spores.anchor.copy(polar(15.8, 120 * DEG, 2.4));
    this.root.add(spores);
    const dust = g.vfx.addEmitter(new ParticleEmitter(ParticlePresets.dustMotes(new Vector3(30, 5, 30), 400)), this.scope);
    dust.anchor.set(0, 2.6, 0);
    this.root.add(dust);
  }

  /** A stone hearth against the outer wall. */
  private hearth(at: Vector3, angle: number): void {
    const stone = new MeshStandardMaterial({ color: 0x8a7d6a, roughness: 0.9 });
    const soot = new MeshStandardMaterial({ color: 0x120c08, roughness: 1 });
    this.owned.push(stone, soot);
    const grp = new Group();
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material = stone) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
    };
    // Local frame: +Z faces into the room.
    box(2.6, 1.3, 0.2, 0, 0.65, -0.55, soot);
    box(0.45, 1.3, 1.1, -1.1, 0.65, 0);
    box(0.45, 1.3, 1.1, 1.1, 0.65, 0);
    box(2.9, 0.22, 1.25, 0, 1.4, 0.02);
    box(2.2, 3.4, 0.9, 0, 3.2, -0.25);
    box(2.0, 0.1, 1.0, 0, 0.05, 0.05, soot);
    grp.position.copy(at);
    grp.rotation.y = angle + Math.PI;
    this.root.add(grp);
    grp.updateMatrixWorld(true);
    this.trackCollider(this.game.physics.addBox(new Vector3(0, 1.0, -0.1).applyMatrix4(grp.matrixWorld), new Vector3(1.4, 1.0, 0.6), grp.quaternion.clone()));
  }

  /** A woven rug: 'round', 'rect' or a long 'runner'. */
  private rug(at: Vector3, w: number, d: number, kind: 'round' | 'rect' | 'runner', base: Material, rotY = 0): void {
    const tex = rugTexture(kind, (base as MeshStandardMaterial).color);
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.95 });
    this.owned.push(mat, tex);
    const geo = kind === 'round' ? new CircleGeometry(w / 2, 64) : new PlaneGeometry(w, d);
    const m = new Mesh(geo, mat);
    m.rotation.set(-Math.PI / 2, 0, rotY);
    m.position.copy(at);
    m.receiveShadow = true;
    this.root.add(m);
  }

  // ------------------------------------------------------------------ people & places

  private addStageMarkers(): void {
    const mark = (id: string, p: Vector3, yawDeg: number) => this.addSpawn(id, p.x, p.y, p.z, yawDeg);
    const rem = this.bedLocal(0, 0.72, 0.9);
    mark('alc.rem_bed', rem, BED_YAW / DEG);
    // Subaru seated: feet just in front of the chair seat, facing the bed.
    const sitYaw = BED_YAW - Math.PI / 2;
    const seat = this.bedLocal(0.98, 0.15).add(new Vector3(Math.sin(sitYaw), 0, Math.cos(sitYaw)).multiplyScalar(0.1));
    mark('alc.subaru_seat', seat, (BED_YAW - Math.PI / 2) / DEG);
    mark('alc.subaru', this.bedLocal(1.15, -0.25), (BED_YAW - Math.PI / 2) / DEG);
    mark('alc.emilia', this.bedLocal(1.3, 0.75), 0);
    mark('alc.beatrice', this.bedLocal(0.95, 1.35), 0);
    mark('alc.ram', this.bedLocal(-0.2, 1.75), 0);
    mark('alc.meili', this.bedLocal(-1.1, 0.95), 0);
    mark('alc.julius', this.bedLocal(0.9, 2.55), 0);
    mark('alc.anastasia', this.bedLocal(-0.4, 2.8), 0);
    mark('alc.patrasche', polar(13.2, 116 * DEG), 0);
    mark('alc.door', polar(10.2, 120 * DEG), 0);
    mark('alc.rem_head', this.bedLocal(0, -0.7, 0.85), 0);
    mark('alc.cam_door', polar(12.6, 124 * DEG, 1.75), 0);
    mark('alc.cam_bed', this.bedLocal(-1.35, 0.9, 1.35), 0);
    // Across the pillow from the far side: Rem's face near, Subaru's beyond it.
    mark('alc.cam_vigil', this.bedLocal(-1.45, 0.05, 1.38), 0);
    mark('alc.vigil_look', this.bedLocal(0.45, -0.2, 1.06), 0);
    mark('alc.leave_1', polar(9.2, 118 * DEG), 0);
    mark('alc.leave_2', polar(9.0, 126 * DEG), 0);
    const bal = polar(OUTER + 3.4, Math.PI);
    mark('alc.balcony_door', polar(R - 0.4, Math.PI), 180);
    mark('alc.balcony_subaru', new Vector3(-0.7, 0, bal.z), 180);
    mark('alc.balcony_emilia', new Vector3(0.7, 0, bal.z), 180);
    mark('alc.balcony_cam', new Vector3(1.6, 1.3, bal.z + 2.4), 0);
    // Behind and beside the two of them, looking out towards Orion.
    mark('alc.balcony_two', new Vector3(-2.7, 1.35, bal.z + 1.7), 0);
    mark('alc.balcony_two_look', new Vector3(0.5, 1.75, bal.z - 1.3), 0);
    mark('alc.balcony_sky', new Vector3(18, 26, bal.z - 40), 0);
  }

  override onEnter(): void {
    const g = this.game;
    const settled = g.state.bool('alc.rem_settled');
    this.setQuilt(settled);
    if (settled && !g.actors.has('rem')) {
      const s = this.spawns.get('alc.rem_bed')!;
      void g.actors.spawn('rem', { position: s.position.clone(), yaw: s.yaw, scope: this.scope, physics: false }).then((a) => a.setLying(true, 0.06));
    }
  }

  private addInteractables(): void {
    const g = this.game;
    const add = (pos: Vector3, opts: InteractableOptions) => {
      const e = g.world.spawn(opts.id, this.scope, { parent: this.root });
      e.object3D.position.copy(pos);
      e.add(new Interactable(opts));
    };
    add(polar(R - 0.4, segAngle(DOOR_DOWN), 1.6), {
      id: 'alc.to_celaeno',
      kind: 'door',
      verb: 'Descend',
      label: 'Stairs down — Celaeno',
      range: 2.8,
      angle: 80,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.scenes.goto('celaeno', 'from_alcyone', { loadingScreen: true, fadeSeconds: 0.8 });
      },
    });
    add(polar(R - 0.4, segAngle(DOOR_UP), 1.6), {
      id: 'alc.to_taygeta',
      kind: 'door',
      verb: 'Climb',
      label: 'Stairs up — Taygeta',
      range: 2.8,
      angle: 80,
      condition: (game) => game.state.bool('alc.rem_settled'),
      lockedText: () => 'Rem first. The trial can wait five more minutes.',
      handler: async (ctx) => {
        await ctx.contact;
        if (ctx.game.scenes.knownAreas().includes('taygeta')) await ctx.game.scenes.goto('taygeta', 'arrive', { loadingScreen: true, fadeSeconds: 0.8 });
        else ctx.game.ui.notify('The stair climbs into white light... and stops.', 'info');
      },
    });
    add(this.bedLocal(0.55, 0.1, 1.0), {
      id: 'alc.rem',
      kind: 'talk',
      verb: 'Sit with',
      label: 'Rem',
      range: 2.4,
      angle: 120,
      condition: (game) => game.state.bool('alc.rem_settled'),
      lockedText: () => '',
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.cinematics.play('alc.vigil');
      },
    });
    add(polar(18.8, 237 * DEG, 1.6), {
      id: 'alc.bed',
      kind: 'rest',
      verb: 'Rest',
      label: 'Bed',
      range: 2.4,
      handler: async (ctx) => {
        await ctx.contact;
        ctx.game.screens.show('saves');
      },
    });
    add(polar(19.6, 226 * DEG, 1.9), {
      id: 'alc.tallies',
      kind: 'clue',
      label: 'Marks in the wall',
      range: 2.6,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Tally Marks',
          'Thousands of them, cut into the stone in neat groups of five, floor to ceiling. Someone counted days here for a very long time. Near the top the groups get messy, like whoever made them stopped caring how they looked — but didn’t stop counting.',
        );
        ctx.game.state.set('alc.saw_tallies', true);
      },
    });
    add(polar(16.8, 322 * DEG, 1.3), {
      id: 'alc.journal',
      kind: 'lore',
      verb: 'Read',
      label: 'Open book on the lectern',
      range: 2.4,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'A Keeper’s Notes',
          '“The floors are named for the sisters of the Pleiades. Alcyone rests; Taygeta asks. The one who would climb must answer what the tower asks of them, and the tower asks only what a true visitor could know.” ...A true visitor. Right. No pressure.',
        );
        ctx.game.state.set('alc.read_journal', true);
      },
    });
    add(new Vector3(0, 1.1, 0), {
      id: 'alc.table',
      kind: 'inspect',
      label: 'Long table',
      range: 2.8,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Long Table',
          'Twelve chairs, not a speck of dust. Someone has kept this table ready for guests for a very long time. It’s the first thing in the tower that feels like a home.',
        );
      },
    });
  }

  override update(dt: number): void {
    const t = this.game.time.elapsed;
    this.batch.update(dt, this.game.render.camera.position);
    this.foliage.update(t);
    this.sky.update(t, this.game.render.camera.position);
  }

  override surfaceAt(x: number, z: number): 'wood' | 'stone' {
    // Plank floors inside; the balcony is stone.
    return Math.hypot(x, z) > R + 0.5 ? 'stone' : 'wood';
  }

  override map(): AreaMap {
    return {
      bounds: { minX: -27, maxX: 27, minZ: -27, maxZ: 27 },
      paint(ctx) {
        ctx.fillStyle = '#16120f';
        ctx.fillRect(-27, -27, 54, 54);
        ctx.fillStyle = '#6a5440';
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        // The Green Room.
        ctx.fillStyle = '#3f6a44';
        ctx.beginPath();
        ctx.moveTo(Math.sin(90 * DEG) * INNER, -Math.cos(90 * DEG) * INNER);
        ctx.arc(0, 0, R, 90 * DEG - Math.PI / 2, 150 * DEG - Math.PI / 2);
        ctx.arc(0, 0, INNER, 150 * DEG - Math.PI / 2, 90 * DEG - Math.PI / 2, true);
        ctx.fill();
        ctx.strokeStyle = 'rgba(243, 226, 176, 0.7)';
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        for (const deg of RADIALS) {
          const a = deg * DEG;
          ctx.beginPath();
          ctx.moveTo(Math.sin(a) * INNER, Math.cos(a) * INNER);
          ctx.lineTo(Math.sin(a) * R, Math.cos(a) * R);
          ctx.stroke();
        }
        // The table and the balcony.
        ctx.fillStyle = '#9b7a52';
        ctx.fillRect(-2.2, -0.5, 4.4, 1);
        ctx.fillStyle = '#8a8272';
        ctx.fillRect(-4.2, -(OUTER + 4.6), 8.4, 4.6);
      },
      labels: [
        { text: 'Alcyone', x: 0, z: -4, size: 1.1 },
        { text: 'Green Room', x: Math.sin(120 * DEG) * 15.5, z: Math.cos(120 * DEG) * 15.5 },
        { text: 'Hearth', x: Math.sin(60 * DEG) * 15.5, z: Math.cos(60 * DEG) * 15.5 },
        { text: 'Bedrooms', x: Math.sin(240 * DEG) * 15.5, z: Math.cos(240 * DEG) * 15.5 },
        { text: 'Study', x: Math.sin(300 * DEG) * 15.5, z: Math.cos(300 * DEG) * 15.5 },
        { text: 'Balcony', x: 0, z: -(OUTER + 6) },
        { text: 'Up — Taygeta', x: Math.sin(segAngle(DOOR_UP)) * 23, z: Math.cos(segAngle(DOOR_UP)) * 23 },
        { text: 'Down — Celaeno', x: 0, z: R + 3 },
      ],
    };
  }

  atmosphere(): AtmosphereProfile {
    return {
      background: new Color(0x05070c),
      environment: this.env,
      environmentIntensity: 0.18,
      fog: {
        color: new Color(0x120e0c),
        glowColor: new Color(0x3a2616),
        lightDir: new Vector3(0.78, -0.46, -0.22),
        density: 0.012,
        heightFalloff: 0.05,
        baseHeight: -50,
        glowPower: 5,
        skyHaze: 0,
        maxOpacity: 0.6,
      },
      grade: ALCYONE_GRADE,
      exposure: 1.35,
      music: 'safe',
      tension: 0,
      keyLight: this.sky.moonDirection,
      rim: { color: new Color(1.0, 0.7, 0.42), strength: 0.45 },
    };
  }

  override dispose(): void {
    this.batch?.dispose();
    this.foliage?.dispose();
    this.sky?.dispose();
    this.env?.dispose();
    for (const o of this.owned) o.dispose();
    super.dispose();
  }
}

/** Replace a flat geometry's UVs with world metres (for tiling materials). */
function metreUVs<T extends BufferGeometry>(geo: T, plane: 'xy' | 'xz' = 'xy'): T {
  const p = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), plane === 'xy' ? p.getY(i) : p.getZ(i));
  uv.needsUpdate = true;
  return geo;
}

function roundedBox(w: number, h: number, d: number, r: number): BufferGeometry {
  // A box whose top edges are softened by scaling a sphere-ish lathe; cheap
  // and good enough for cloth seen at a distance.
  const g = new BoxGeometry(w, h, d, 8, 2, 8);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y > 0) {
      const ex = Math.max(0, Math.abs(x) - (w / 2 - r)) / r;
      const ez = Math.max(0, Math.abs(z) - (d / 2 - r)) / r;
      const e = Math.min(1, Math.hypot(ex, ez));
      p.setY(i, y - (1 - Math.sqrt(1 - e * e)) * Math.min(h, r * 1.4));
    }
  }
  g.computeVertexNormals();
  return g;
}

/** White light spilling down a stair from the floor above (bright at the top). */
function verticalGlow(): Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#8c93a6');
  grad.addColorStop(1, '#0b0c10');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Woven rug patterns: border bands and a medallion in the fabric's colour. */
function rugTexture(kind: 'round' | 'rect' | 'runner', base: Color): Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = kind === 'runner' ? 1024 : 512;
  const g = c.getContext('2d')!;
  const col = (k: number, add = 0) => `rgb(${Math.min(255, base.r * 255 * k + add)}, ${Math.min(255, base.g * 255 * k + add * 0.8)}, ${Math.min(255, base.b * 255 * k + add * 0.5)})`;
  const W = c.width;
  const H = c.height;
  g.fillStyle = col(1.0);
  g.fillRect(0, 0, W, H);
  const gold = '#c9a55a';
  const cream = '#e8dcc0';
  if (kind === 'round') {
    const ring = (r: number, w: number, s: string) => {
      g.strokeStyle = s;
      g.lineWidth = w;
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.stroke();
    };
    ring(246, 16, col(0.55));
    ring(228, 6, gold);
    ring(214, 10, cream);
    ring(150, 5, gold);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.save();
      g.translate(W / 2 + Math.cos(a) * 184, H / 2 + Math.sin(a) * 184);
      g.rotate(a);
      g.fillStyle = i % 2 ? gold : cream;
      g.beginPath();
      g.moveTo(-14, 0);
      g.lineTo(0, -10);
      g.lineTo(14, 0);
      g.lineTo(0, 10);
      g.fill();
      g.restore();
    }
    g.fillStyle = col(0.6);
    g.beginPath();
    g.arc(W / 2, H / 2, 90, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle = gold;
      g.beginPath();
      g.ellipse(W / 2 + Math.cos(a) * 52, H / 2 + Math.sin(a) * 52, 26, 10, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = cream;
    g.beginPath();
    g.arc(W / 2, H / 2, 18, 0, Math.PI * 2);
    g.fill();
  } else {
    const inset = (m: number, w: number, s: string) => {
      g.strokeStyle = s;
      g.lineWidth = w;
      g.strokeRect(m, m, W - m * 2, H - m * 2);
    };
    inset(10, 20, col(0.55));
    inset(30, 6, gold);
    inset(44, 10, cream);
    inset(60, 4, gold);
    const n = kind === 'runner' ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const cy = ((i + 0.5) / n) * H;
      g.fillStyle = col(0.62);
      g.beginPath();
      g.moveTo(W / 2, cy - 70);
      g.lineTo(W / 2 + 110, cy);
      g.lineTo(W / 2, cy + 70);
      g.lineTo(W / 2 - 110, cy);
      g.fill();
      g.fillStyle = gold;
      g.beginPath();
      g.moveTo(W / 2, cy - 34);
      g.lineTo(W / 2 + 52, cy);
      g.lineTo(W / 2, cy + 34);
      g.lineTo(W / 2 - 52, cy);
      g.fill();
    }
  }
  // Weave noise.
  const img = g.getImageData(0, 0, W, H);
  const rng = new Rng(3);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.next() - 0.5) * 22 + (((i / 4) % W) % 3 === 0 ? -6 : 0);
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export default (game: GameContext) => new AlcyoneArea(game);
