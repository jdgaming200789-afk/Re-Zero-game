import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { Area, type AreaMap, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { doorRecess, polar } from '../../scene/procedural/RoundHall';
import { FollowShadowLight } from '../../render/lighting/FollowShadowLight';
import { NightSky } from '../../render/sky/NightSky';
import { Fire } from '../../vfx/Fire';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { Interactable } from '../../interaction/Interactable';
import { SHADOW_MAP_SIZE } from '../../settings/Settings';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';
import { Rng } from '../../core/math/MathUtil';
import { ReidDuel } from './ReidDuel';
import { LightStair } from './LightStair';
import { IceBloom } from './IceBloom';

const R = 22;
const DEG = Math.PI / 180;
/** Half-angle of the stair gate's gap in the parapet (south, +Z). */
const GATE_HALF = 6 * DEG;

/** Where the stair of light comes down: north-east of Reid's stone. */
const STAIR_CENTER = new Vector3(6.5, 0, -8);
/** How long the stair takes to wind down to the floor (the cinematic is cut to it). */
const STAIR_SECONDS = 7.2;

const GRADE: ColorGrade = { lift: [0.004, 0.008, 0.02], gamma: [1, 1, 1.02], gain: [0.98, 1, 1.06], saturation: 0.9, contrast: 1.1, temperature: -0.18, tint: 0.01 };

/**
 * Electra — the second floor, and the tower's second trial. No ceiling: a
 * wind-scoured disc of pale stone open to the night, broken columns around
 * its rim, the dunes a long way down. In the middle, on a drum of fallen
 * column, a red-haired man sits eating with a pair of chopsticks.
 */
class ElectraArea extends Area {
  readonly id = 'electra';
  readonly displayName = 'Electra';
  readonly subtitle = 'The Second Floor — the Sword Saint’s trial.';
  private sky!: NightSky;
  private env: Texture | null = null;
  private moon!: FollowShadowLight;
  duel!: ReidDuel;
  /** The stair of light that comes down for whoever passes (Emilia). */
  stair!: LightStair;
  private ice: IceBloom | null = null;
  private readonly owned: Array<{ dispose(): void }> = [];

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const mats = g.environment.materials;
    const [floorMat, stone, lime, sand] = await Promise.all([mats.get('marble_tiles'), mats.get('sandstone_ashlar'), mats.get('limestone_smooth'), mats.get('sand')]);
    onProgress(0.3);

    // ---- The floor: a disc of pale stone with a duelling ring inlaid.
    const floor = new Mesh(metreUVs(new CircleGeometry(R + 0.6, 96), 0.25), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    this.trackCollider(g.physics.addDisc(new Vector3(0, 0, 0), R + 0.6));
    const inlayMat = new MeshStandardMaterial({ color: 0x3a3430, roughness: 0.7 });
    this.owned.push(inlayMat);
    for (const [a, b] of [
      [6.8, 7.1],
      [12.6, 12.8],
    ] as const) {
      const ring = new Mesh(new RingGeometry(a, b, 96), inlayMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.006;
      ring.receiveShadow = true;
      this.root.add(ring);
    }

    // ---- The parapet, open at the stair gate; an invisible guard above it.
    // (A double-sided copy: the shared material stays as it is elsewhere.)
    const paraMat = (stone as MeshStandardMaterial).clone();
    paraMat.side = DoubleSide;
    this.owned.push(paraMat);
    const para = new Mesh(new CylinderGeometry(R + 0.6, R + 0.6, 1.1, 96, 1, true, GATE_HALF, Math.PI * 2 - 2 * GATE_HALF), paraMat);
    para.position.y = 0.55;
    para.castShadow = true;
    para.receiveShadow = true;
    const cap = new Mesh(new RingGeometry(R + 0.35, R + 0.95, 96, 1, Math.PI / 2 + GATE_HALF, Math.PI * 2 - 2 * GATE_HALF), lime);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = 1.11;
    this.root.add(para, cap);
    for (let i = 0; i < 56; i++) {
      const a = ((i + 0.5) / 56) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < GATE_HALF + 1 * DEG) continue;
      const p = polar(R + 0.8, a, 1.5);
      this.trackCollider(g.physics.addBox(p, new Vector3(1.4, 1.5, 0.3), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a)));
    }
    // The stair gate down to Taygeta.
    this.trackCollider(doorRecess(this.root, g.physics, { angle: 0, radius: R + 0.6, baseY: 0, dir: 'down', mat: lime }));
    onProgress(0.45);

    // ---- Broken columns around the rim, and fallen drums.
    const rng = new Rng(7);
    const colGeo = new CylinderGeometry(0.55, 0.62, 1, 16);
    this.owned.push(colGeo);
    for (let k = 0; k < 14; k++) {
      const a = ((k + 0.5) / 14) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 16 * DEG) continue;
      const h = k % 3 === 0 ? rng.range(5, 7.5) : rng.range(1.1, 3.6);
      const c = new Mesh(colGeo, stone);
      c.scale.y = h;
      c.position.copy(polar(R - 1.8, a, h / 2));
      c.rotation.y = rng.range(0, Math.PI);
      // Broken tops lean a little.
      if (h < 4) c.rotation.z = rng.range(-0.06, 0.06);
      c.castShadow = true;
      c.receiveShadow = true;
      this.root.add(c);
      this.trackCollider(g.physics.addCylinder(polar(R - 1.8, a, h / 2), h / 2, 0.6));
      if (h > 4) {
        const capital = new Mesh(new BoxGeometry(1.5, 0.35, 1.5), lime);
        capital.position.copy(polar(R - 1.8, a, h + 0.17));
        capital.rotation.y = a;
        capital.castShadow = true;
        this.root.add(capital);
        this.owned.push(capital.geometry);
      }
    }
    for (const [r, deg, rot] of [
      [15.5, 62, 0.4],
      [16.2, 205, -0.9],
      [14.8, 300, 1.3],
    ] as const) {
      const d = new Mesh(new CylinderGeometry(0.58, 0.58, 1.3, 16), stone);
      d.rotation.set(0, rot, Math.PI / 2);
      d.position.copy(polar(r, deg * DEG, 0.58));
      d.castShadow = true;
      d.receiveShadow = true;
      this.root.add(d);
      this.owned.push(d.geometry);
      this.trackCollider(g.physics.addBox(d.position.clone(), new Vector3(0.65, 0.58, 0.6), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rot)));
    }
    // Reid's seat: one drum stood on end in the middle of the ring.
    const seat = new Mesh(new CylinderGeometry(0.5, 0.52, 0.5, 18), stone);
    seat.position.set(0, 0.25, -3.25);
    seat.castShadow = true;
    seat.receiveShadow = true;
    this.root.add(seat);
    this.owned.push(seat.geometry);
    this.trackCollider(g.physics.addCylinder(new Vector3(0, 0.25, -3.25), 0.25, 0.36));
    onProgress(0.6);

    // ---- Sky, and the desert a long way down.
    this.sky = new NightSky({ moonDir: new Vector3(-0.55, 0.62, -0.56), starBrightness: 1.6 });
    this.root.add(this.sky.mesh);
    const dunes = new PlaneGeometry(3000, 3000, 100, 100);
    dunes.rotateX(-Math.PI / 2);
    const pos = dunes.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.009 + Math.sin(z * 0.005) * 2) * 12 + Math.sin(z * 0.014 + x * 0.004) * 7);
    }
    dunes.computeVertexNormals();
    metreUVs(dunes, 0.1, 'xz');
    const ground = new Mesh(dunes, sand);
    ground.position.y = -140;
    this.root.add(ground);
    this.owned.push(dunes);

    // ---- Light: the moon, a cool sky fill, four braziers.
    const shadow = SHADOW_MAP_SIZE[g.settings.graphics.shadowQuality];
    this.moon = new FollowShadowLight(0xb8c6ee, 1.9, this.sky.moonDirection, 30, shadow, 80);
    this.moon.addTo(this.root);
    this.moon.update(new Vector3());
    this.root.add(new HemisphereLight(0x4a5878, 0x1c1814, 0.9));
    this.env = this.sky.buildEnvironment(g.render.renderer);
    const brazierMat = new MeshStandardMaterial({ color: 0x2c2622, roughness: 0.6, metalness: 0.6 });
    this.owned.push(brazierMat);
    for (const deg of [45, 135, 225, 315]) {
      const p = polar(R - 4.2, deg * DEG);
      const bowl = new Mesh(new CylinderGeometry(0.42, 0.18, 0.9, 12), brazierMat);
      bowl.position.copy(p).setY(0.45);
      bowl.castShadow = true;
      this.root.add(bowl);
      this.owned.push(bowl.geometry);
      this.trackCollider(g.physics.addCylinder(p.clone().setY(0.45), 0.45, 0.42));
      const fire = g.vfx.add(new Fire({ scale: 0.7, lightIntensity: 16, lightDistance: 11 }), this.scope);
      fire.position.copy(p).setY(0.92);
      this.root.add(fire);
    }
    const wind = g.vfx.addEmitter(
      new ParticleEmitter({ ...ParticlePresets.dustMotes(new Vector3(40, 6, 40), 260), velocityMin: new Vector3(0.4, -0.02, -0.1), velocityMax: new Vector3(1.4, 0.05, 0.2), colorA: new Color(0.85, 0.8, 0.7), colorB: new Color(0.7, 0.72, 0.8) }),
      this.scope,
    );
    wind.anchor.set(0, 2.5, 0);
    this.root.add(wind);
    onProgress(0.8);

    // The stair of light (dark and folded away until someone passes). Its
    // light exists from the start: adding one later recompiles every material.
    this.stair = new LightStair(STAIR_CENTER, {
      onStep: (i) => {
        if (i % 3 === 0) g.events.emit('story:event', { id: 'ele.stair_step' });
      },
      onLand: () => {
        g.events.emit('story:event', { id: 'ele.stair_land' });
        g.render.chromaticPulse = Math.max(g.render.chromaticPulse, 0.35);
      },
    });
    this.root.add(this.stair.root);

    this.addSpawn('default', 0, 0, R - 2.4, 180);
    this.addSpawn('arrive', 0, 0, R - 2.4, 180);
    this.addMarkers();
    this.addInteractables();
    this.duel = new ReidDuel(g, this.scope, new Vector3(0, 0, 0));
    this.listen('story:event', ({ id }) => {
      if (id === 'ele.sit') this.sitReid();
      else if (id === 'ele.ice') this.freeze();
      else if (id === 'ele.ice_clear') this.thaw();
      else if (id === 'ele.reid_step') this.reidSteps();
      else if (id === 'ele.stair') this.stair.descend(STAIR_SECONDS);
      else if (id === 'ele.stair_full') this.stair.descend(0);
    });
    // The duel starts once control is back: after the first meeting, or
    // after "Again." in a rematch.
    const begin = () => void g.scheduler.wait(0.4).then(() => this.duel.state === 'seated' && !g.state.bool('ele.trial_cleared') && this.duel.begin());
    this.listen('cinematic:ended', ({ cinematicId }) => {
      if (cinematicId === 'ele.arrive') begin();
    });
    this.listen('dialogue:ended', ({ dialogueId }) => {
      if (dialogueId === 'ele.rematch' && g.state.bool('ele.go')) {
        g.state.clear('ele.go');
        begin();
      }
    });
    onProgress(1);
  }

  private addMarkers(): void {
    const mark = (id: string, x: number, y: number, z: number, yawDeg = 0) => this.addSpawn(id, x, y, z, yawDeg);
    mark('ele.reid_seat', 0, 0, -2.6, 0);
    mark('ele.reid_look', 0, 1.3, -2.6);
    mark('ele.subaru', 0, 0, 5.5, 180);
    const party: Array<[string, number, number]> = [
      ['emilia', -1.4, 6.3],
      ['beatrice', 1.2, 6.1],
      ['julius', -2.2, 5.0],
      ['ram', 2.3, 6.9],
      ['anastasia', -0.6, 7.4],
      ['meili', 1.1, 7.6],
      ['patrasche', 3.4, 8.2],
    ];
    for (const [id, x, z] of party) mark(`ele.${id}`, x, 0, z, 180);
    mark('ele.cam_wide', 10.5, 5.5, 14);
    mark('ele.wide_look', 0, 1, -1);
    mark('ele.cam_reid', 1.3, 1.25, -0.9);
    mark('ele.cam_party', -1.4, 1.6, -0.2);
    mark('ele.party_look', 0, 1.3, 6);
    // Emilia's turn: she walks out to face him; everyone else watches.
    mark('ele.emilia_try', 0, 0, 2.2, 180);
    // Where she steps out of the group from (a clear walk to her mark).
    mark('ele.emilia_step_out', 0.4, 0, 4.3, 180);
    mark('ele.subaru_watch', -1.6, 0, 4.6, 180);
    const watch: Array<[string, number, number]> = [
      ['julius', -2.8, 3.9],
      ['beatrice', -0.6, 5.0],
      ['ram', 1.5, 4.8],
      ['anastasia', 2.6, 5.4],
      ['meili', 0.6, 5.8],
      ['patrasche', 3.8, 6.4],
    ];
    for (const [id, x, z] of watch) mark(`ele.watch_${id}`, x, 0, z, 180);
    // Side-on to the line between them: her on one side of the frame, him
    // on the other, the frost running across the floor in between.
    mark('ele.cam_ice', -4.9, 1.15, -0.1);
    mark('ele.ice_look', 0, 0.75, -0.2);
    mark('ele.cam_feet', 1.1, 0.35, -0.9);
    mark('ele.feet_look', 0, 0.14, -2.6);
    // The stair: looking up from among the party, then a wide of the whole helix.
    mark('ele.cam_up', 2.2, 1.3, 2.8);
    mark('ele.stair_top', STAIR_CENTER.x, 52, STAIR_CENTER.z);
    mark('ele.stair_mid', STAIR_CENTER.x, 16, STAIR_CENTER.z);
    mark('ele.cam_stair_wide', -9, 3.2, 13);
    mark('ele.stair_foot', STAIR_CENTER.x, 0, STAIR_CENTER.z + 4.2);
    // Moves with the stair's leading tread (cameras follow it down).
    mark('ele.stair_head', STAIR_CENTER.x, 60, STAIR_CENTER.z);
    // Over Emilia's shoulder as she turns to the landing.
    mark('ele.cam_landing', -2.7, 1.5, 4.1);
    mark('ele.landing_look', 4.6, 2.2, -4.6);
  }

  /** Back to the stone and the bowl (from wherever the trial left him). */
  private sitReid(): void {
    const seat = this.spawns.get('ele.reid_seat');
    if (seat && this.duel.actor) this.duel.actor.placeAt(seat.position.clone(), seat.yaw);
    this.duel.sitDown();
  }

  /** Emilia's ice: a sheet of frost runs out across the floor, and shards burst up round his feet. */
  private freeze(): void {
    if (this.ice) return;
    const g = this.game;
    const feet = this.duel.actor?.position.clone() ?? this.spawns.get('ele.reid_seat')!.position.clone();
    const cam = this.spawns.get('ele.cam_feet')?.position ?? null;
    this.ice = new IceBloom(new Vector3(0, 0, -0.6), feet, cam);
    this.root.add(this.ice.root);
    g.render.chromaticPulse = Math.max(g.render.chromaticPulse, 0.6);
  }

  private thaw(): void {
    this.ice?.thaw();
  }

  private updateIce(dt: number): void {
    const ice = this.ice;
    if (!ice) return;
    ice.update(dt, (at) => this.game.combat.impacts.burst('ice', at, 6));
    if (ice.gone) {
      ice.dispose();
      this.ice = null;
    }
  }

  /** On the ice, a dead man's sandals finally move. */
  private reidSteps(): void {
    const actor = this.duel.actor;
    if (!actor) return;
    actor.release();
    actor.dash(new Vector3(0, 0, -1), 0.6, 0.38, false);
    void actor.visual.play('stagger', { fadeIn: 0.04 });
    this.game.combat.impacts.burst('ice', actor.position.clone().setY(0.1), 24);
  }

  private addInteractables(): void {
    const g = this.game;
    // The foot of the stair of light: hers, not his.
    const foot = g.world.spawn('ele.stair', this.scope, { parent: this.root });
    foot.object3D.position.set(STAIR_CENTER.x, 1.0, STAIR_CENTER.z + 4.2);
    foot.add(
      new Interactable({
        id: 'ele.stair',
        kind: 'inspect',
        verb: 'Look',
        label: 'Stair of light',
        range: 2.6,
        angle: 90,
        condition: (game) => game.state.bool('ele.emilia_passed') && !game.combat.inCombat && !game.cinematics.playing,
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.dialogue.play('ele.stair_touch');
        },
      }),
    );
    const down = g.world.spawn('ele.to_taygeta', this.scope, { parent: this.root });
    down.object3D.position.copy(polar(R - 0.2, 0, 1.6));
    down.add(
      new Interactable({
        id: 'ele.to_taygeta',
        kind: 'door',
        verb: 'Descend',
        label: 'Stairs down — Taygeta',
        range: 2.6,
        angle: 80,
        condition: (game) => !game.combat.inCombat && !game.cinematics.playing,
        lockedText: (game) => (game.combat.inCombat ? 'Not with the Sword Saint watching my back.' : null),
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.scenes.goto('taygeta', 'from_electra', { loadingScreen: true, fadeSeconds: 0.8 });
        },
      }),
    );
  }

  override onEnter(): void {
    void this.populate();
  }

  /** Reid on his stone (and, once he's met, something to say to him). */
  private async populate(): Promise<void> {
    const g = this.game;
    if (g.state.bool('ele.emilia_passed')) this.stair.descend(0);
    const seat = this.spawns.get('ele.reid_seat')!;
    await this.duel.spawn(seat.position.clone(), seat.yaw, true);
    const actor = this.duel.actor;
    if (!actor) return;
    const talk = g.world.spawn('ele.reid', this.scope, { parent: actor.entity.object3D });
    talk.object3D.position.set(0, 1.2, 0);
    talk.add(
      new Interactable({
        id: 'ele.reid',
        kind: 'talk',
        verb: 'Talk',
        label: 'Reid Astrea',
        range: 2.8,
        angle: 80,
        condition: (game) => this.duel.state === 'seated' && game.state.bool('ele.met_reid') && !game.cinematics.playing,
        handler: async (ctx) => {
          await ctx.contact;
          await ctx.game.dialogue.play(ctx.game.state.bool('ele.trial_cleared') ? 'ele.after' : 'ele.rematch');
        },
      }),
    );
  }

  override update(dt: number): void {
    const g = this.game;
    this.duel?.update(dt);
    this.stair?.update(dt);
    this.spawns.get('ele.stair_head')?.position.copy(this.stair.head);
    this.updateIce(dt);
    const p = g.player?.entity.object3D.position;
    if (p) this.moon.update(p);
    this.sky.update(g.time.elapsed, g.render.camera.position);
  }

  override surfaceAt(): 'stone' {
    return 'stone';
  }

  override map(): AreaMap {
    return {
      bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
      paint(ctx) {
        ctx.fillStyle = '#0d1018';
        ctx.fillRect(-26, -26, 52, 52);
        ctx.fillStyle = '#d6d2c8';
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#6b6258';
        ctx.lineWidth = 0.3;
        for (const r of [7, 12.7]) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
      labels: [
        { text: 'Electra', x: 0, z: -9, size: 1.1 },
        { text: 'Down — Taygeta', x: 0, z: R + 2.5 },
      ],
    };
  }

  atmosphere(): AtmosphereProfile {
    const cleared = this.game.state.bool('ele.trial_cleared');
    return {
      background: new Color(0x03050b),
      environment: this.env,
      environmentIntensity: 0.3,
      fog: { color: new Color(0x0b101c), glowColor: new Color(0x223050), lightDir: this.sky.moonDirection.clone().negate(), density: 0.004, heightFalloff: 0.02, baseHeight: -140, glowPower: 5, skyHaze: 0.5, maxOpacity: 0.85 },
      grade: GRADE,
      exposure: 1.3,
      music: cleared ? 'safe' : 'mystery',
      tension: cleared ? 0 : 0.2,
      keyLight: this.sky.moonDirection,
      rim: { color: new Color(0.62, 0.72, 1.0), strength: 0.55 },
    };
  }

  override dispose(): void {
    this.duel?.dispose();
    this.stair?.dispose();
    this.ice?.dispose();
    this.ice = null;
    this.sky?.dispose();
    this.env?.dispose();
    for (const o of this.owned) o.dispose();
    super.dispose();
  }
}

/** World-metre UVs for a flat geometry (scaled for the material's tiling). */
function metreUVs<T extends BufferGeometry>(geo: T, scale = 1, plane: 'xy' | 'xz' = 'xy'): T {
  const p = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * scale, (plane === 'xy' ? p.getY(i) : p.getZ(i)) * scale);
  uv.needsUpdate = true;
  return geo;
}

export default (game: GameContext) => new ElectraArea(game);
