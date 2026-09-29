import {
  Color,
  DirectionalLight,
  HemisphereLight,
  MeshStandardMaterial,
  PMREMGenerator,
  PointLight,
  Vector3,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Area, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { LevelBuilder } from '../../scene/LevelBuilder';
import { gridTexture } from '../../render/textures/DevTextures';
import { Interactable } from '../../interaction/Interactable';
import { NEUTRAL_GRADE } from '../../render/effects/ColorGradeEffect';
import { SHADOW_MAP_SIZE } from '../../settings/Settings';
import { TrainingDummy } from '../../combat/TrainingDummy';

/**
 * Developer test gym: measured geometry for tuning the controller, camera
 * collision and interaction system. Not part of the player-facing game.
 */
class DevGymArea extends Area {
  readonly id = 'dev_gym';
  readonly displayName = 'Test Gym';
  readonly subtitle = 'Controller, camera and interaction test ground.';
  private envMap: Texture | null = null;

  constructor(game: GameContext) {
    super(game);
  }

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const b = new LevelBuilder(g.physics, this.root);
    const tex = gridTexture();
    const floorTex = tex.clone();
    floorTex.repeat.set(60, 60);
    floorTex.needsUpdate = true;
    const floorMat = new MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    const blockTex = gridTexture('#8d8578', '#766f64', '#a39a8b');
    const blockMat = new MeshStandardMaterial({ map: blockTex, roughness: 0.8 });
    const accentMat = new MeshStandardMaterial({ color: 0x9e7d52, roughness: 0.6 });
    const darkMat = new MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.7 });

    // Floor
    b.box([60, 1, 60], [0, -0.5, 0], floorMat, { castShadow: false });
    onProgress(0.2);

    // Stairs to a platform (step height 0.18 m)
    b.stairs([-8, 0, 2], 8, 0.18, 0.36, 3, blockMat);
    b.box([6, 1.44, 6], [-8, 0.72, 2 + 2.88 + 3], blockMat);
    // Ledge drop test
    b.box([4, 3, 4], [-8, 1.5, 13.8], blockMat);
    b.stairs([-10.5, 1.44, 5], 0, 0.18, 0.36, 2, blockMat);

    // Ramps: walkable 20°, unwalkable 58°
    b.box([3, 0.3, 8], [0, 1.2, 8], blockMat, { rotX: -20 * (Math.PI / 180) });
    b.box([3, 0.3, 5], [4.5, 1.6, 8], darkMat, { rotX: -58 * (Math.PI / 180) });

    // Pillar field for camera collision
    for (let i = 0; i < 6; i++) {
      b.cylinder(0.45, 5, [8 + (i % 3) * 3, 2.5, -4 - Math.floor(i / 3) * 3], blockMat);
    }

    // Narrow corridor with ceiling (tight camera)
    b.box([0.4, 3, 10], [14.2, 1.5, 8], blockMat);
    b.box([0.4, 3, 10], [16.2, 1.5, 8], blockMat);
    b.box([2.4, 0.4, 10], [15.2, 3.2, 8], blockMat);
    onProgress(0.5);

    // ---- Interactables
    // Door
    b.box([0.4, 3, 2], [-2, 1.5, -10], blockMat);
    b.box([0.4, 3, 2], [2, 1.5, -10], blockMat);
    b.box([4.4, 0.8, 0.4], [0, 3.4, -10], blockMat);
    const door = b.box([1.6, 2.9, 0.12], [0, 1.45, -10], accentMat, { name: 'door' });
    const doorEntity = g.world.spawn('gym.door', this.scope, { parent: this.root });
    doorEntity.object3D.position.set(0, 1.45, -9.7);
    doorEntity.add(
      new Interactable({
        id: 'gym.door',
        kind: 'door',
        label: 'Heavy door',
        range: 2.4,
        once: true,
        approach: { offset: new Vector3(0, -1.45, 0.9) },
        handler: async (ctx) => {
          await ctx.contact;
          b.removeCollider(door);
          // Swing away from the player around a hinge at x = -0.8.
          await ctx.game.scheduler.tween(
            0.9,
            (t) => {
              const a = (Math.PI / 2) * t;
              door.rotation.y = a;
              door.position.x = -0.8 + 0.8 * Math.cos(a);
              door.position.z = -10 - 0.8 * Math.sin(a);
            },
            { ease: 'outCubic' },
          );
          ctx.game.state.set('gym.door_open', true);
        },
      }),
    );

    // Lectern with a book
    b.box([0.6, 1.0, 0.45], [5, 0.5, -1], darkMat);
    const book = b.box([0.4, 0.06, 0.3], [5, 1.03, -1], new MeshStandardMaterial({ color: 0x5b2330, roughness: 0.5 }), { collide: false });
    const bookEntity = g.world.spawn('gym.book', this.scope, { parent: this.root });
    bookEntity.object3D.position.copy(book.position);
    bookEntity.add(
      new Interactable({
        id: 'gym.book',
        kind: 'read',
        label: 'Worn journal',
        approach: { offset: new Vector3(0, -1.03, 0.75) },
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.ui.showInspect(
            'Worn Journal',
            '“Day forty. The stairs go up forever and the stars never move.” ...The handwriting gets shakier toward the end. Yeah, that’s not ominous at all.',
          );
        },
      }),
    );

    // Pickup
    const vial = b.cylinder(0.05, 0.16, [2, 0.08, 1], new MeshStandardMaterial({ color: 0x7fd6a4, emissive: 0x1f5f3c, roughness: 0.2 }), { collide: false });
    const vialEntity = g.world.spawn('gym.vial', this.scope, { parent: this.root });
    vialEntity.object3D.position.copy(vial.position);
    vialEntity.add(
      new Interactable({
        id: 'gym.vial',
        kind: 'pickup',
        label: 'Green vial',
        once: true,
        handler: async (ctx) => {
          await ctx.contact;
          vial.visible = false;
          ctx.game.ui.notify('Green Vial ×1', 'item');
          ctx.game.state.add('gym.vials');
        },
      }),
    );

    // Hold-to-pull lever that raises a gate
    const leverBase = b.box([0.3, 0.9, 0.3], [-4, 0.45, -4], darkMat);
    const gate = b.box([3, 3, 0.3], [-4, 1.5, -7], new MeshStandardMaterial({ color: 0x585e6a, metalness: 0.6, roughness: 0.4 }), { name: 'gate' });
    const leverEntity = g.world.spawn('gym.lever', this.scope, { parent: this.root });
    leverEntity.object3D.position.set(-4, 1.0, -4);
    leverEntity.add(
      new Interactable({
        id: 'gym.lever',
        kind: 'mechanism',
        verb: 'Pull',
        label: 'Rusted lever',
        hold: 0.9,
        once: true,
        approach: { offset: new Vector3(0, -1, 0.7) },
        handler: async (ctx) => {
          await ctx.contact;
          leverBase.rotation.x = -0.5;
          ctx.game.camera.shake.add(0.35);
          b.removeCollider(gate);
          const y0 = gate.position.y;
          await ctx.game.scheduler.tween(1.6, (t) => (gate.position.y = y0 + 3 * t), { ease: 'inQuad' });
          ctx.game.state.set('gym.gate_open', true);
        },
      }),
    );

    // Chest that requires the gate to be open first
    const chest = b.box([0.9, 0.6, 0.6], [-4, 0.3, -10], accentMat);
    const chestEntity = g.world.spawn('gym.chest', this.scope, { parent: this.root });
    chestEntity.object3D.position.set(-4, 0.7, -10);
    chestEntity.add(
      new Interactable({
        id: 'gym.chest',
        kind: 'treasure',
        label: 'Iron-bound chest',
        once: true,
        condition: (game) => game.state.bool('gym.gate_open'),
        lockedText: () => 'It won’t budge. Something must be holding it shut.',
        handler: async (ctx) => {
          await ctx.contact;
          chest.scale.y = 0.6;
          ctx.game.ui.notify('Tarnished Key ×1', 'item');
        },
      }),
    );
    onProgress(0.8);

    // ---- Lighting
    const hemi = new HemisphereLight(0xbfd2ff, 0x3a3228, 0.55);
    this.root.add(hemi);
    const sun = new DirectionalLight(0xfff0dc, 2.4);
    sun.position.set(18, 26, 12);
    sun.castShadow = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality] > 0;
    const size = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality] || 1024;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.root.add(sun, sun.target);
    const lamp = new PointLight(0xffb46b, 18, 9, 2);
    lamp.position.set(5, 2.6, -0.3);
    this.root.add(lamp);

    const pmrem = new PMREMGenerator(g.render.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // ---- Practice ring: three dummies; stepping in starts a practice fight.
    const dummies: TrainingDummy[] = [];
    for (const [x, z, yaw] of [[-3, 20, 0.35], [0, 21.5, 0], [3, 20, -0.35]] as const) {
      const e = g.world.spawn('gym.dummy', this.scope, { tags: ['dummy'] });
      e.object3D.position.set(x, 0, z);
      e.object3D.rotation.y = Math.PI + yaw;
      dummies.push(e.add(new TrainingDummy(g)));
      this.root.add(e.object3D);
      this.trackCollider(g.physics.addCylinder(new Vector3(x, 0.85, z), 0.85, 0.3));
    }
    this.addZone('gym.arena', new Vector3(0, 1, 20), new Vector3(7, 2, 5));
    this.listen('zone:entered', ({ zoneId }) => {
      if (zoneId === 'gym.arena') g.combat.startEncounter('gym.practice', { enemies: dummies.map((d) => d.health), arena: { center: new Vector3(0, 0, 20), radius: 11 } });
    });
    this.listen('combat:ended', ({ encounterId, victory }) => {
      if (encounterId === 'gym.practice' && victory) g.state.set('gym.practice_won', true);
    });
    this.addSpawn('arena', 0, 0, 13, 0);

    this.addSpawn('default', 0, 0, 4, 180);
    this.addSpawn('stairs', -8, 0, -1, 0);
    this.addSpawn('corridor', 15.2, 0, 1, 0);
    this.trackCollider(b.colliders);
    onProgress(1);
  }

  atmosphere(): AtmosphereProfile {
    return {
      background: new Color(0x8f9bb0),
      environment: this.envMap,
      environmentIntensity: 0.35,
      fog: { color: new Color(0x8f9bb0), density: 0.012, heightFalloff: 0.002, skyHaze: 0.6 },
      keyLight: new Vector3(18, 26, 12),
      grade: NEUTRAL_GRADE,
      exposure: 1,
      tension: 0,
    };
  }

  override dispose(): void {
    this.envMap?.dispose();
    super.dispose();
  }
}

export default (game: GameContext) => new DevGymArea(game);
