import { Color, HemisphereLight, PointLight, Quaternion, Vector3, type Texture } from 'three';
import { Area, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { KitBatch } from '../../scene/kit/KitBatch';
import { NightSky } from '../../render/sky/NightSky';
import { FollowShadowLight } from '../../render/lighting/FollowShadowLight';
import { createTerrainMaterial, type TerrainLayer } from '../../world/terrain/TerrainMaterial';
import { DuneTerrain } from '../../world/terrain/DuneTerrain';
import { Fire } from '../../vfx/Fire';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { SandWall } from '../../vfx/SandWall';
import { Rng } from '../../core/math/MathUtil';
import { Layer } from '../../physics/Physics';
import { SHADOW_MAP_SIZE } from '../../settings/Settings';
import { Interactable } from '../../interaction/Interactable';
import { CAMP, FLATS, GATE_FRONT_Z, STAIRS_FOOT_Z, TOWER_CENTER, flatsMask, heightAt, plazaMask, splatAt } from './TowerFootLayout';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';

export const NIGHT_GRADE: ColorGrade = {
  lift: [0.012, 0.014, 0.024],
  gamma: [1.0, 1.0, 1.02],
  gain: [1.0, 0.99, 1.0],
  saturation: 0.92,
  contrast: 1.1,
  temperature: -0.12,
  tint: 0,
};

/**
 * The foot of the Pleiades Watchtower at night: the party's camp, the outer
 * ruins, the Glass Flats and the paved plaza before the great gate.
 */
class TowerFootArea extends Area {
  readonly id = 'tower_foot';
  readonly displayName = 'The Tower’s Foot';
  readonly subtitle = 'Augria Sand Dunes — the Pleiades Watchtower, at last.';
  private sky!: NightSky;
  private env: Texture | null = null;
  private moon!: FollowShadowLight;
  private batches: KitBatch[] = [];
  private terrain!: DuneTerrain;

  constructor(game: GameContext) {
    super(game);
  }

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const [kit, towerKit, sand, glass, stone] = await Promise.all([
      g.environment.kit(),
      g.environment.library('assets/models/tower/watchtower_exterior.glb'),
      g.environment.materials.textureSet('sand'),
      g.environment.materials.textureSet('sandglass'),
      g.environment.materials.textureSet('flagstone'),
    ]);
    onProgress(0.35);

    // ---- Terrain
    const layer = (t: typeof sand): TerrainLayer => ({ albedo: t!.albedo, normal: t!.normal, orm: t!.orm, tileMeters: t!.info.tileMeters });
    const terrainMat = createTerrainMaterial([layer(sand), layer(glass), layer(stone)]);
    this.terrain = new DuneTerrain(
      {
        inner: { minX: -110, maxX: 110, minZ: -250, maxZ: 110, spacing: 1.25 },
        outer: { extent: 1400, spacing: 12 },
        height: heightAt,
        splat: splatAt,
      },
      terrainMat,
    );
    this.root.add(this.terrain.inner, this.terrain.outer);
    this.trackCollider(this.terrain.buildCollider(g.physics));
    onProgress(0.55);

    // ---- Sky, moon, ambient
    this.sky = new NightSky({ moonDir: new Vector3(-0.78, 0.46, 0.22) });
    this.root.add(this.sky.mesh);
    this.env = this.sky.buildEnvironment(g.render.renderer);
    const moonDir = this.sky.moonDirection;
    const shadowSize = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality];
    this.moon = new FollowShadowLight(0xc4cbe0, 1.6, moonDir, 42, shadowSize, 180);
    this.moon.addTo(this.root);
    this.root.add(new HemisphereLight(0x27304a, 0x3a2e22, 0.5));

    // ---- Architecture
    const tower = new KitBatch(towerKit, g.physics, 400);
    tower.place('TowerBase', TOWER_CENTER.x, 0, TOWER_CENTER.z);
    tower.place('TowerUpper', TOWER_CENTER.x, 0, TOWER_CENTER.z, { collide: false });
    tower.place('TowerGlass', TOWER_CENTER.x, 0, TOWER_CENTER.z, { collide: false });
    tower.build(this.root);
    this.addBatch(tower);

    const b = new KitBatch(kit, g.physics, 28);
    this.placeCamp(b);
    this.placeRuins(b);
    this.placeFlatsCover(b);
    this.placePlaza(b);
    b.build(this.root);
    this.addBatch(b);
    onProgress(0.8);

    // ---- Effects
    const fire = g.vfx.add(new Fire({ scale: 1.1, lightIntensity: 32, lightDistance: 20, castShadow: shadowSize >= 2048 }), this.scope);
    fire.position.set(CAMP.x - 3, heightAt(CAMP.x - 3, CAMP.z - 6) + 0.15, CAMP.z - 6);
    this.root.add(fire);
    const lantern = new PointLight(0xffb46b, 4, 7, 2);
    lantern.position.set(CAMP.x + 2 + 0.95, heightAt(CAMP.x + 2, CAMP.z - 2) + 2.05, CAMP.z - 2 + 1.8);
    this.root.add(lantern);
    const drift = g.vfx.addEmitter(new ParticleEmitter(ParticlePresets.sandDrift(new Vector3(-2.6, 0, 0.8), 900)), this.scope);
    this.root.add(drift);
    const wall = g.vfx.add(new SandWall(950, 300, Math.PI * 0.15, Math.PI * 1.2), this.scope);
    this.root.add(wall);

    // ---- Bounds: the dunes are climbable, the Sand Time is not an option.
    this.addBoundary();
    this.addInteractables();

    this.addCampMarkers();
    // Story zones: quest objectives read `visited.<zone>`.
    this.addZone('tf.ruins', new Vector3(0, 2, 3), new Vector3(60, 12, 27));
    this.addZone('tf.flats', new Vector3(0, 2, -55), new Vector3(56, 12, 29));
    this.addZone('tf.plaza', new Vector3(0, 4, -110), new Vector3(60, 14, 16));

    this.addSpawn('default', CAMP.x - 1, heightAt(CAMP.x - 1, CAMP.z - 2), CAMP.z - 2, 200);
    this.addSpawn('camp', CAMP.x - 1, heightAt(CAMP.x - 1, CAMP.z - 2), CAMP.z - 2, 200);
    this.addSpawn('ruins', 0, heightAt(0, 10), 10, 180);
    this.addSpawn('flats_edge', 0, heightAt(0, -22), -22, 180);
    this.addSpawn('plaza', 0, heightAt(0, -95), -95, 180);
    this.addSpawn('gate', 0, 5.1, GATE_FRONT_Z + 5, 180);
    this.addSpawn('gate_out', 0, 5.1, GATE_FRONT_Z + 5, 0);
    onProgress(1);
  }

  private addBatch(b: KitBatch): void {
    this.batches.push(b);
    this.trackCollider(b.colliders);
  }

  private ground(x: number, z: number, sink = 0): number {
    return heightAt(x, z) - sink;
  }

  private placeCamp(b: KitBatch): void {
    const cx = CAMP.x;
    const cz = CAMP.z;
    b.place('Carriage', cx + 2, this.ground(cx + 2, cz - 2), cz - 2, { rotY: 0.35 });
    b.place('Campfire', cx - 3, this.ground(cx - 3, cz - 6), cz - 6);
    b.place('Tent', cx + 10, this.ground(cx + 10, cz + 4), cz + 4, { rotY: -0.5 });
    b.place('Crate', cx - 1.5, this.ground(cx - 1.5, cz + 1.5), cz + 1.5, { rotY: 0.3 });
    b.place('Crate', cx - 0.8, this.ground(cx - 0.8, cz + 2.4) + 0.0, cz + 2.4, { rotY: 1.1, scale: 0.85 });
    b.place('Chest', cx + 5.2, this.ground(cx + 5.2, cz - 3.5), cz - 3.5, { rotY: -1.2 });
    b.place('Bench', cx - 5.6, this.ground(cx - 5.6, cz - 4.4), cz - 4.4, { rotY: 1.2 });
    b.place('Rock_C', cx - 7, this.ground(cx - 7, cz - 9, 0.2), cz - 9, { rotY: 2 });
    b.place('Rock_A', cx + 14, this.ground(cx + 14, cz - 6, 0.3), cz - 6, { rotY: 0.6 });
  }

  /** Where everyone stands around the fire, and the camera spots of the opening scene. */
  private addCampMarkers(): void {
    const fx = CAMP.x - 3;
    const fz = CAMP.z - 6;
    const mark = (id: string, dx: number, dz: number) => {
      const x = fx + dx;
      const z = fz + dz;
      this.addSpawn(id, x, this.ground(x, z), z, (Math.atan2(-dx, -dz) * 180) / Math.PI);
    };
    mark('camp.fire', 0, 0.001);
    mark('camp.subaru', 1.2, 2.1);
    mark('camp.emilia', -0.6, 2.3);
    mark('camp.beatrice', 2.4, 1.1);
    mark('camp.meili', -2.2, 1.4);
    mark('camp.julius', -2.4, -0.4);
    mark('camp.anastasia', 0.2, -2.4);
    mark('camp.ram', 3.1, 2.9);
    mark('camp.patrasche', 4.3, -1.4);
    const cam = (id: string, dx: number, dz: number, h: number) => this.addSpawn(id, fx + dx, this.ground(fx + dx, fz + dz) + h, fz + dz, 0);
    // Behind the party, over the fire, towards the tower.
    cam('camp.cam_est', 0.6, 6.5, 1.25);
    cam('camp.cam_fire', -4.2, 6.4, 2.0);
    cam('camp.fire_look', 0.3, 0.6, 0.9);
    cam('camp.cam_end', 2.5, 7.5, 2.6);
  }

  private placeRuins(b: KitBatch): void {
    const rng = new Rng(4040);
    // The processional avenue: two rows of columns leading to the flats.
    for (let i = 0; i < 7; i++) {
      const z = 30 - i * 8;
      for (const side of [-1, 1]) {
        const x = side * 8 + rng.range(-0.3, 0.3);
        const r = rng.next();
        if (r < 0.25) continue; // missing entirely
        if (r < 0.7) b.place('Column_Broken', x, this.ground(x, z, 0.4), z, { rotY: rng.range(0, 6.28) });
        else b.place('Column_6', x, this.ground(x, z, 0.5), z, { rotY: rng.range(0, 6.28) });
        if (rng.chance(0.5)) {
          const dx = x + side * rng.range(1.2, 2.6);
          const dz = z + rng.range(-1.5, 1.5);
          b.place('ColumnDrum', dx, this.ground(dx, dz, 0.15), dz, { rotY: rng.range(0, 6.28) });
        }
      }
    }
    // A colossus fallen across the ruins, and walls of whatever stood here.
    b.place('FallenGiant', -26, this.ground(-26, -4, 0.8), -4, { rotY: 0.5 });
    b.place('FallenGiant', 34, this.ground(34, 22, 0.9), 22, { rotY: -1.2 });
    const walls: Array<[string, number, number, number]> = [
      ['RuinWall_A', -22, 18, 0.2],
      ['RuinWall_A', 24, 4, 1.4],
      ['RuinWall_B', -34, 6, -0.4],
      ['RuinWall_B', 18, -14, 0.9],
      ['RuinWall_A', -16, -16, -0.2],
      ['RuinWall_B', 40, -8, 2.2],
      ['RuinWall_A', -44, 28, 1.0],
      ['RuinWall_B', 46, 34, -0.7],
    ];
    for (const [name, x, z, r] of walls) b.place(name, x, this.ground(x, z, 0.35), z, { rotY: r });
    // A sage statue half swallowed by the sand, leaning.
    const lean = new Quaternion().setFromAxisAngle(new Vector3(0.3, 0, 1).normalize(), 0.22);
    lean.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -2.3));
    b.place('Statue_Sage', 30, this.ground(30, 10, 1.1), 10, { rotation: lean });
    // Obelisks marking where the road enters the flats.
    b.place('Obelisk', -13, this.ground(-13, -21, 0.3), -21, { rotY: 0.1 });
    b.place('Obelisk', 13, this.ground(13, -21, 0.3), -21, { rotY: -0.08 });
    // Rubble and rocks
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-56, 56);
      const z = rng.range(-24, 40);
      if (Math.abs(x) < 5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 14) continue;
      const pick = rng.pick(['Rubble_A', 'Rubble_B', 'Rubble_Small', 'Rock_A', 'Rock_C', 'Rubble_Small']);
      b.place(pick, x, this.ground(x, z, pick.startsWith('Rock') ? 0.3 : 0.05), z, { rotY: rng.range(0, 6.28), scale: rng.range(0.8, 1.3) });
    }
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(70, 130);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.8;
      if (z < -90) continue;
      b.place(rng.pick(['Rock_B', 'Rock_D']), x, this.ground(x, z, 1.2), z, { rotY: rng.range(0, 6.28), scale: rng.range(1.2, 2.2), collide: false });
    }
  }

  /** Sparse cover across the Glass Flats — the route that keeps you alive. */
  private placeFlatsCover(b: KitBatch): void {
    const cover: Array<[string, number, number, number, number?]> = [
      ['RuinWall_B', -6, -32, 0.1],
      ['Rock_B', 9, -38, 1.2, 0.8],
      ['RuinWall_A', -14, -45, 0.4],
      ['Column_Broken', 3, -47, 0],
      ['Rock_A', 16, -55, 0.3, 1.3],
      ['RuinWall_B', -4, -60, -0.3],
      ['FallenGiant', 10, -68, 1.45],
      ['Rock_B', -18, -72, 2.1, 0.9],
      ['RuinWall_A', 26, -76, -0.2],
    ];
    for (const [name, x, z, r, s] of cover) {
      const sink = name.startsWith('Rock') ? 0.4 : name === 'FallenGiant' ? 0.7 : 0.25;
      b.place(name, x, this.ground(x, z, sink), z, { rotY: r, scale: s ?? 1 });
    }
    // Glass-fused debris scattered in the open (no cover value, all dread).
    const rng = new Rng(88);
    for (let i = 0; i < 12; i++) {
      const x = rng.range(FLATS.minX + 6, FLATS.maxX - 6);
      const z = rng.range(FLATS.minZ + 4, FLATS.maxZ - 4);
      if (flatsMask(x, z) < 0.8) continue;
      b.place('Rubble_Small', x, this.ground(x, z, 0.1), z, { rotY: rng.range(0, 6.28), collide: false });
    }
  }

  private placePlaza(b: KitBatch): void {
    const z0 = STAIRS_FOOT_Z;
    b.place('Obelisk', -24, 0, z0 + 4, { rotY: 0 });
    b.place('Obelisk', 24, 0, z0 + 4, { rotY: 0 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = side * (14 + i * 7);
        const z = z0 + 10 + i * 3;
        b.place('Pedestal', x, 0, z, { rotY: 0 });
        if (i === 1) b.place('Statue_Sage', x, 1.22, z, { rotY: side > 0 ? -0.4 : 0.4 });
      }
    }
    const rng = new Rng(512);
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(50, 70);
      const x = TOWER_CENTER.x + Math.cos(a) * r;
      const z = TOWER_CENTER.z + Math.sin(a) * r;
      if (z > z0 - 2 || plazaMask(x, z) < 0.5) continue;
      b.place(rng.pick(['Rubble_A', 'Rubble_B', 'ColumnDrum', 'Rubble_Small']), x, 0, z, { rotY: rng.range(0, 6.28) });
    }
  }

  private addBoundary(): void {
    const p = this.game.physics;
    const wall = (cx: number, cz: number, hx: number, hz: number, rotY = 0) => {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotY);
      this.trackCollider(p.addBox(new Vector3(cx, 20, cz), new Vector3(hx, 40, hz), q, Layer.CharacterOnly, { kind: 'static' }));
    };
    wall(-74, -10, 1, 110); // west
    wall(74, -10, 1, 110); // east
    wall(0, 92, 76, 1); // south (the way back into the Sand Time)
    // Around the tower plaza
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.12 + (i / 15) * Math.PI * 0.76; // behind the tower
      const r = 78;
      const x = TOWER_CENTER.x + Math.cos(a + Math.PI) * r;
      const z = TOWER_CENTER.z + Math.sin(a + Math.PI) * r;
      wall(x, z, 12, 1, -(a + Math.PI) + Math.PI / 2);
    }
    wall(-60, -120, 16, 1, 0.9);
    wall(60, -120, 16, 1, -0.9);
  }

  private addInteractables(): void {
    const g = this.game;
    const add = (id: string, pos: Vector3, opts: Omit<ConstructorParameters<typeof Interactable>[0], 'id'>) => {
      const e = g.world.spawn(id, this.scope, { parent: this.root });
      e.object3D.position.copy(pos);
      e.add(new Interactable({ id, ...opts }));
    };
    const cx = CAMP.x + 2;
    const cz = CAMP.z - 2;
    add('tf.carriage', new Vector3(cx + 1.2, this.ground(cx, cz) + 1.4, cz + 0.6), {
      kind: 'inspect',
      label: 'Dragon carriage',
      range: 2.6,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'The Dragon Carriage',
          'Rem is asleep inside, bundled in every blanket we own. Same as yesterday. Same as every day since Priestella. ...Just a little longer, Rem. We made it to the tower.',
        );
      },
    });
    const ox = -13;
    const oz = -21;
    add('tf.obelisk', new Vector3(ox, this.ground(ox, oz) + 1.6, oz + 1.2), {
      kind: 'lore',
      verb: 'Read',
      label: 'Weathered obelisk',
      range: 2.8,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Inscription',
          'Most of it is sanded away. What’s left is a list of rules, and one line cut deeper than the rest: “The watcher does not sleep.” ...Great. Love that.',
        );
        ctx.game.state.set('tf.read_obelisk', true);
      },
    });
    const fx = 0;
    const fz = -25;
    add('tf.glass_edge', new Vector3(fx, this.ground(fx, fz) + 0.3, fz), {
      kind: 'clue',
      label: 'Fused sand',
      range: 2.4,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'The Glass Flats',
          'The sand here isn’t sand anymore. It’s glass — melted, cracked, layered like it happened over and over. Something hit this place with a lot of heat. A lot of times.',
        );
        ctx.game.state.set('tf.saw_glass', true);
      },
    });
    add('tf.gate', new Vector3(0, 6.6, GATE_FRONT_Z + 2.5), {
      kind: 'door',
      verb: 'Enter',
      label: 'The Pleiades Watchtower',
      range: 4.2,
      angle: 80,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.scenes.goto('celaeno', 'gate', { loadingScreen: true, fadeSeconds: 0.9 });
      },
    });
    const px = 22;
    const pz = 20;
    add('tf.old_camp', new Vector3(px, this.ground(px, pz) + 0.4, pz), {
      kind: 'clue',
      label: 'Half-buried pack',
      range: 2.4,
      once: true,
      handler: async (ctx) => {
        await ctx.contact;
        await ctx.game.ui.showInspect(
          'Someone Else’s Journey',
          'A leather pack, cracked with age. A water skin, dry. A compass that spins without stopping. Whoever carried this got as far as we did... and no farther.',
        );
        ctx.game.ui.notify('Faded Journal Page', 'item');
        ctx.game.state.set('tf.found_pack', true);
      },
    });
  }

  override update(dt: number): void {
    const cam = this.game.render.camera;
    this.sky.update(this.game.time.elapsed, cam.position);
    const focus = this.game.player?.entity.object3D.position ?? cam.position;
    this.moon.update(focus);
    for (const b of this.batches) b.update(dt, cam.position);
  }

  atmosphere(): AtmosphereProfile {
    return {
      background: null,
      environment: this.env,
      environmentIntensity: 0.55,
      fog: {
        color: new Color(0x0c1220),
        glowColor: new Color(0x1c2644),
        lightDir: this.sky.moonDirection,
        density: 0.009,
        heightFalloff: 0.018,
        baseHeight: -2,
        glowPower: 5,
        skyHaze: 0.85,
        maxOpacity: 0.92,
      },
      grade: NIGHT_GRADE,
      exposure: 1.25,
      music: 'exploration',
      tension: 0.1,
      keyLight: this.sky.moonDirection,
      rim: { color: new Color(0.5, 0.6, 0.9), strength: 0.45 },
    };
  }

  override dispose(): void {
    for (const b of this.batches) b.dispose();
    this.batches = [];
    this.terrain.dispose();
    this.sky.dispose();
    this.env?.dispose();
    super.dispose();
  }
}

export default (game: GameContext) => new TowerFootArea(game);
