import {
  CanvasTexture,
  CircleGeometry,
  Color,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Area, type AreaMap, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { KitBatch } from '../../scene/kit/KitBatch';
import { colonnade, dome, galleryRing, helicalStair, polar, ringWalls, tiledFloor } from '../../scene/procedural/RoundHall';
import { FollowShadowLight } from '../../render/lighting/FollowShadowLight';
import { Fire } from '../../vfx/Fire';
import { LightShaft } from '../../vfx/LightShaft';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { Interactable, type InteractableOptions } from '../../interaction/Interactable';
import { SHADOW_MAP_SIZE } from '../../settings/Settings';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';
import { Rng } from '../../core/math/MathUtil';
import { Layer } from '../../physics/Physics';

const R = 20; // inner wall radius
const SEG = 32;
const GALLERY_Y = 12;
const DEG = Math.PI / 180;
const STAIR = { start: 95 * DEG, sweep: 175 * DEG };

export const CELAENO_GRADE: ColorGrade = {
  lift: [0.012, 0.016, 0.024],
  gamma: [1.0, 1.01, 1.03],
  gain: [0.98, 1.0, 1.03],
  saturation: 0.88,
  contrast: 1.12,
  temperature: -0.18,
  tint: 0.02,
};

/**
 * Celaeno — the fifth floor, the tower's ground level. A vast round hall
 * that has been sealed for four hundred years: sand drifts in from the
 * gate, moonlight falls through the upper windows, and a stair winds up
 * the wall toward the living quarters of Alcyone.
 */
class CelaenoArea extends Area {
  readonly id = 'celaeno';
  readonly displayName = 'Celaeno';
  readonly subtitle = 'The Fifth Floor — where the tower begins.';
  private env: Texture | null = null;
  private moon!: FollowShadowLight;
  private batch!: KitBatch;

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const mats = g.environment.materials;
    const [kit, stone, limestone, marble, sandMat] = await Promise.all([
      g.environment.kit(),
      mats.get('sandstone_ashlar'),
      mats.get('limestone_smooth'),
      mats.get('marble_tiles'),
      mats.get('sand'),
    ]);
    onProgress(0.3);

    const b = new KitBatch(kit, g.physics, 24);
    this.batch = b;
    tiledFloor(b, R + 1, 0);
    // Lower tier: gate (south), basement door (SE), collapsed passage (W).
    ringWalls(b, {
      radius: R,
      baseY: 0,
      segments: SEG,
      pieceAt: (i) => (i === 0 ? 'Wall_4x6_Door' : i === 5 || i === 24 ? 'Wall_4x6_Door' : 'Wall_4x6'),
    });
    // Middle tier: windows all around (moonlight on the west side).
    ringWalls(b, { radius: R, baseY: 6, segments: SEG, pieceAt: (i) => (i % 2 === 0 ? 'Wall_4x6_Window' : 'Wall_4x6') });
    // Upper tier above the gallery: the way on to Alcyone above the gate.
    ringWalls(b, { radius: R, baseY: 12, segments: SEG, pieceAt: (i) => (i === 0 ? 'Wall_4x6_Door' : 'Wall_4x6') });
    colonnade(b, 11, 16, 0, true);
    onProgress(0.45);

    // Helical stair along the north wall, arriving at the gallery.
    this.trackCollider(
      helicalStair(
        b,
        g.physics,
        this.root,
        { innerRadius: 16.6, outerRadius: 19.5, startAngle: STAIR.start, sweep: STAIR.sweep, startY: 0, rise: GALLERY_Y, steps: 64 },
        stone,
      ),
    );
    // Gallery over the southern half (from the stair's arrival round to the east).
    this.trackCollider(galleryRing(g.physics, this.root, 16.4, R + 0.05, GALLERY_Y, marble, limestone, STAIR.start + STAIR.sweep, 2 * Math.PI - STAIR.sweep - 1 * DEG));
    // Balustrade on the gallery's open edge.
    const galStart = STAIR.start + STAIR.sweep + 3 * DEG;
    const galLen = 2 * Math.PI - STAIR.sweep - 6 * DEG;
    const nBal = Math.floor((galLen * 16.55) / 2);
    for (let i = 0; i < nBal; i++) {
      const a = galStart + ((i + 0.5) / nBal) * galLen;
      const p = polar(16.55, a, GALLERY_Y);
      b.place('Balustrade_2', p.x, p.y, p.z, { rotY: a + Math.PI });
    }
    // Keep the player from walking off the gallery's ends into the void.
    for (const a of [STAIR.start - 1 * DEG]) {
      const p = polar(18.2, a, GALLERY_Y + 1);
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a);
      this.trackCollider(g.physics.addBox(p, new Vector3(1.9, 1.2, 0.2), q, Layer.CharacterOnly, { kind: 'static' }));
    }

    // Dome with an oculus, above the third tier.
    dome(this.root, R + 0.6, 18, 11, 2.4, stone);
    onProgress(0.6);

    this.placeDais(b, limestone);
    this.placeProps(b);
    b.build(this.root);
    this.trackCollider(b.colliders);
    this.placeSand(sandMat);
    onProgress(0.75);

    this.light(stone);
    this.addInteractables();

    this.addSpawn('default', 0, 0, 15, 180);
    this.addSpawn('gate', 0, 0, 16.5, 180);
    this.addSpawn('gallery', polar(18, 0).x, GALLERY_Y, polar(18, 0).z - 0.5, 180);
    this.addSpawn('dais', 0, 0.45, 5, 180);
    onProgress(1);
  }

  private placeDais(b: KitBatch, limestone: import('three').Material): void {
    const g = this.game;
    // Raised circular dais (stepped lathe) with collision as stacked cylinders.
    const dais = new Mesh(
      new LatheGeometry([new Vector2(0, 0), new Vector2(5.45, 0), new Vector2(5.4, 0.15), new Vector2(4.85, 0.15), new Vector2(4.8, 0.3), new Vector2(4.25, 0.3), new Vector2(4.2, 0.45), new Vector2(0, 0.45)], 96),
      limestone,
    );
    dais.receiveShadow = true;
    dais.castShadow = true;
    this.root.add(dais);
    this.trackCollider(g.physics.addCylinder(new Vector3(0, 0.075, 0), 0.075, 5.4));
    this.trackCollider(g.physics.addCylinder(new Vector3(0, 0.225, 0), 0.075, 4.8));
    this.trackCollider(g.physics.addCylinder(new Vector3(0, 0.375, 0), 0.075, 4.2));
    // Star map inlaid in the dais: gold constellations on dark stone.
    const map = new Mesh(new CircleGeometry(4.1, 96), new MeshStandardMaterial({ map: starMapTexture(), roughness: 0.35, metalness: 0.4, emissiveMap: starMapTexture(true), emissive: new Color(0xffe2a8), emissiveIntensity: 0.9 }));
    map.rotation.x = -Math.PI / 2;
    map.position.y = 0.455;
    map.receiveShadow = true;
    this.root.add(map);
    b.place('Armillary', 0, 0.45, 0, { scale: 2.2 });
  }

  private placeProps(b: KitBatch): void {
    const rng = new Rng(55);
    // The Sage's statue watches the gate from the north alcove.
    b.place('Pedestal', 0, 0, -17.2, { scale: 1.3 });
    b.place('Statue_Sage', 0, 1.56, -17.2, { rotY: 0, scale: 1.45 });
    // Ambulatory furniture and debris between colonnade and wall.
    const ring: Array<[string, number, number, number?]> = [
      ['Bench', 14.5, 40],
      ['Bench', 14.5, 140],
      ['Bench', 14.5, 220],
      ['Urn', 17.8, 30],
      ['Urn', 18.1, 34],
      ['Urn', 17.9, 150],
      ['Crate', 17.5, 200, 0.4],
      ['Crate', 18.2, 205, 1.2],
      ['Chest', 17.8, 210],
      ['Rubble_B', 17.2, 272],
      ['Rubble_A', 15.8, 262],
      ['Rubble_Small', 13.5, 250],
      ['ColumnDrum', 13.2, 300],
      ['Rubble_Small', 9, 320],
      ['Rubble_Small', 8, 20],
    ];
    for (const [name, r, deg, rot] of ring) {
      const p = polar(r, deg * DEG);
      b.place(name, p.x, 0, p.z, { rotY: rot ?? deg * DEG + Math.PI });
    }
    // Wall sconces (cold for centuries) around the lower tier.
    for (let i = 0; i < SEG; i += 2) {
      if (i === 0 || i === 24 || i === 4 || i === 6) continue;
      const a = ((i + 0.5) / SEG) * Math.PI * 2;
      const p = polar(R - 0.05, a, 3.1);
      b.place('WallTorch', p.x, p.y, p.z, { rotY: a + Math.PI, collide: false });
    }
    // Banners hanging from the gallery balustrade.
    for (const deg of [300, 330, 30, 60]) {
      const a = deg * DEG;
      const p = polar(16.35, a, GALLERY_Y + 0.9);
      b.place('Banner', p.x, p.y, p.z, { rotY: a + Math.PI, collide: false, scale: new Vector3(1.4, 1.8, 1) });
    }
    // Braziers at the foot of the stair (lit in light()).
    for (const off of [-4, 4]) {
      const p = polar(15.2, STAIR.start + off * DEG);
      b.place('Brazier', p.x, 0, p.z);
    }
    // Rubble fallen from the collapsed western passage.
    for (let i = 0; i < 6; i++) {
      const a = (270 + rng.range(-8, 8)) * DEG;
      const p = polar(rng.range(16.5, 19), a);
      b.place(rng.pick(['Rubble_A', 'Rubble_Small', 'Rubble_B']), p.x, 0, p.z, { rotY: rng.range(0, 6.28) });
    }
  }

  /** Sand that has blown in through the gate over the centuries. */
  private placeSand(sandMat: import('three').Material): void {
    const rng = new Rng(9);
    const drifts: Array<[number, number, number, number]> = [
      [0, 17.5, 3.6, 0.55],
      [-2.8, 16.2, 2.2, 0.35],
      [2.6, 15.6, 2.8, 0.4],
      [1.2, 12.5, 2.0, 0.2],
      [-15.5, 9, 2.4, 0.3],
    ];
    for (const [x, z, r, h] of drifts) {
      const pts: Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new Vector2(r * t, h * (1 - t * t) * (0.9 + rng.range(0, 0.2))));
      }
      pts.reverse();
      const m = new Mesh(new LatheGeometry(pts, 32), sandMat);
      m.position.set(x, 0, z);
      m.scale.set(1, 1, rng.range(0.7, 1.3));
      m.rotation.y = rng.range(0, 6.28);
      m.receiveShadow = true;
      this.root.add(m);
    }
  }

  private light(stone: import('three').Material): void {
    const g = this.game;
    void stone;
    const shadow = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality];
    // Moonlight through the western windows (same moon as outside).
    const moonDir = new Vector3(-0.78, 0.46, 0.22);
    this.moon = new FollowShadowLight(0xb8c4e6, 2.1, moonDir, 26, shadow, 60);
    this.moon.addTo(this.root);
    this.moon.update(new Vector3(0, 0, 0));
    this.root.add(new HemisphereLight(0x161d2e, 0x1d160f, 0.16));

    // Visible shafts from the west windows toward the east floor.
    const toward = moonDir.clone().normalize().negate();
    for (const deg of [247.5, 270, 292.5]) {
      const a = deg * DEG;
      const from = polar(R - 0.2, a, 9.2);
      const to = from.clone().addScaledVector(toward, 19);
      const shaft = g.vfx.add(new LightShaft(from, to, 0.55, 1.6, new Color(0.7, 0.8, 1.0), 0.1), this.scope);
      this.root.add(shaft);
    }
    // Starlight through the oculus onto the dais.
    const spot = new SpotLight(0xa9c2ff, 60, 32, 0.16, 0.6, 1.4);
    spot.position.set(0, 28, 0);
    spot.target.position.set(0, 0, 0);
    this.root.add(spot, spot.target);
    const beam = g.vfx.add(new LightShaft(new Vector3(0, 28.5, 0), new Vector3(0, 0.5, 0), 2.2, 3.2, new Color(0.65, 0.78, 1.0), 0.05), this.scope);
    this.root.add(beam);

    // Braziers at the stair's foot: the only warm light — they lead you up.
    for (const off of [-4, 4]) {
      const a = STAIR.start + off * DEG;
      const p = polar(15.2, a);
      const fire = g.vfx.add(new Fire({ scale: 0.7, lightIntensity: 18, lightDistance: 14 }), this.scope);
      fire.position.set(p.x, 1.08, p.z);
      this.root.add(fire);
    }
    // Dust hanging in the still air.
    const dust = g.vfx.addEmitter(new ParticleEmitter(ParticlePresets.dustMotes(new Vector3(34, 14, 34), 700)), this.scope);
    dust.anchor.set(0, 7, 0);
    this.root.add(dust);

    const pmrem = new PMREMGenerator(g.render.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  private addInteractables(): void {
    const g = this.game;
    const add = (pos: Vector3, opts: InteractableOptions) => {
      const e = g.world.spawn(opts.id, this.scope, { parent: this.root });
      e.object3D.position.copy(pos);
      e.add(new Interactable(opts));
    };
    add(new Vector3(0, 2.2, -15.6), {
      id: 'cel.statue',
      kind: 'lore',
      verb: 'Examine',
      label: 'Statue of the Sage',
      range: 3.2,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'The Sage',
          'A robed figure with a staff, face lost under the hood. Whoever carved it wanted you to feel small walking in. ...Mission accomplished, Sage. Now, where are you?',
        );
      },
    });
    add(new Vector3(0, 2.4, 2.6), {
      id: 'cel.armillary',
      kind: 'inspect',
      label: 'Armillary sphere',
      range: 3.4,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Armillary Sphere',
          'Brass rings nested around a golden core, set to a sky I don’t recognise. Except... that little cluster of seven stars on the dais. Back home we’d call that the Pleiades. The name of this tower. Coincidence. Totally a coincidence.',
        );
        ctx.game.state.set('know.pleiades_cluster', true);
      },
    });
    const bd = polar(R - 0.8, ((5 + 0.5) / SEG) * Math.PI * 2, 1.6);
    add(bd, {
      id: 'cel.basement',
      kind: 'door',
      label: 'Stair down',
      range: 2.6,
      condition: () => false,
      lockedText: () => 'Stairs going down into pitch black, and a draft that smells like old stone. ...Nope. Not without a very good reason.',
      handler: () => undefined,
    });
    const wp = polar(R - 1.6, ((24 + 0.5) / SEG) * Math.PI * 2, 1.4);
    add(wp, {
      id: 'cel.collapse',
      kind: 'clue',
      label: 'Collapsed passage',
      range: 3,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Collapsed Passage',
          'The ceiling came down here a long time ago. The break is clean, like something heavy hit it from the other side. I decide not to think about what.',
        );
      },
    });
    add(new Vector3(0, 1.6, R - 1.2), {
      id: 'cel.gate',
      kind: 'door',
      verb: 'Leave',
      label: 'The great gate',
      range: 2.6,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.scenes.goto('tower_foot', 'gate_out', { fadeSeconds: 0.7, loadingScreen: true });
      },
    });
    const gd = polar(R - 1.0, ((0 + 0.5) / SEG) * Math.PI * 2, GALLERY_Y + 1.6);
    add(gd, {
      id: 'cel.to_alcyone',
      kind: 'door',
      verb: 'Climb',
      label: 'Stair to Alcyone',
      range: 2.6,
      handler: async (ctx) => {
        await ctx.contact;
        if (ctx.game.scenes.knownAreas().includes('alcyone')) await ctx.game.scenes.goto('alcyone', 'default', { loadingScreen: true });
        else ctx.game.ui.notify('The way to Alcyone is not open yet.', 'info');
      },
    });
  }

  override update(dt: number): void {
    this.batch.update(dt, this.game.render.camera.position);
  }

  override map(): AreaMap {
    return {
      bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
      paint(ctx) {
        ctx.fillStyle = '#12151f';
        ctx.fillRect(-26, -26, 52, 52);
        ctx.fillStyle = '#5c5648';
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(243, 226, 176, 0.75)';
        ctx.lineWidth = 0.35;
        ctx.stroke();
        // The helical stair up to the gallery.
        ctx.strokeStyle = 'rgba(200, 190, 170, 0.6)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, 18, STAIR.start - Math.PI / 2, STAIR.start + STAIR.sweep - Math.PI / 2);
        ctx.stroke();
        // The dais and the great gate.
        ctx.fillStyle = '#8a8272';
        ctx.beginPath();
        ctx.arc(0, 3, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(243, 226, 176, 0.9)';
        ctx.fillRect(-3, R - 0.6, 6, 1.4);
      },
      labels: [
        { text: 'Celaeno', x: 0, z: -8, size: 1.2 },
        { text: 'Gate', x: 0, z: R + 3 },
      ],
    };
  }

  atmosphere(): AtmosphereProfile {
    return {
      background: new Color(0x05070c),
      environment: this.env,
      environmentIntensity: 0.12,
      fog: {
        color: new Color(0x0b0f18),
        glowColor: new Color(0x1a2338),
        lightDir: new Vector3(0.78, -0.46, -0.22),
        density: 0.028,
        heightFalloff: 0.06,
        baseHeight: 0,
        glowPower: 6,
        skyHaze: 0,
        maxOpacity: 0.75,
      },
      grade: CELAENO_GRADE,
      exposure: 1.5,
      music: 'mystery',
      tension: 0.2,
      keyLight: new Vector3(-0.78, 0.46, 0.22),
      rim: { color: new Color(0.95, 0.62, 0.36), strength: 0.4 },
    };
  }

  override dispose(): void {
    this.batch?.dispose();
    this.env?.dispose();
    super.dispose();
  }
}

/** Gold constellations on dark stone for the dais inlay (with a glow mask). */
function starMapTexture(emissive = false): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = emissive ? '#000' : '#1b1d24';
  g.fillRect(0, 0, 1024, 1024);
  const rng = new Rng(1234);
  const gold = emissive ? '#6b5a30' : '#c9a55a';
  g.strokeStyle = gold;
  g.lineWidth = 3;
  // Concentric rings and zodiac-like segments.
  for (const r of [500, 470, 300]) {
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(512 + Math.cos(a) * 470, 512 + Math.sin(a) * 470);
    g.lineTo(512 + Math.cos(a) * 500, 512 + Math.sin(a) * 500);
    g.stroke();
  }
  // Scattered stars
  for (let i = 0; i < 220; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 460;
    const s = rng.range(1.5, 4.5);
    g.fillStyle = emissive ? `rgba(255,220,150,${rng.range(0.2, 0.7)})` : gold;
    g.beginPath();
    g.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, s, 0, Math.PI * 2);
    g.fill();
  }
  // Constellation lines (a few invented asterisms)
  g.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    const cx = 512 + rng.range(-330, 330);
    const cy = 512 + rng.range(-330, 330);
    g.beginPath();
    let px = cx;
    let py = cy;
    g.moveTo(px, py);
    for (let j = 0; j < 5; j++) {
      px += rng.range(-70, 70);
      py += rng.range(-70, 70);
      g.lineTo(px, py);
      g.fillStyle = gold;
      g.fillRect(px - 4, py - 4, 8, 8);
    }
    g.strokeStyle = emissive ? '#3a3020' : '#8c7440';
    g.stroke();
  }
  // The seven sisters, bright at the centre.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const r = i === 0 ? 0 : rng.range(18, 44);
    g.fillStyle = emissive ? '#ffe6b0' : '#f3dca0';
    g.beginPath();
    g.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, i === 0 ? 9 : 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export default (game: GameContext) => new CelaenoArea(game);
