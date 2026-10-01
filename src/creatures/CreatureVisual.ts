import { Box3, Color, Euler, Group, Quaternion, Uniform, Vector3, type Bone, type Material, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GroundQuery } from '../characters/AnimeCharacter';
import { solveTwoBone, rotateBoneWorld } from '../characters/anim/IK';
import { SpringChainSystem } from '../characters/anim/SpringBones';
import type { CharacterVisual, LocomotionState, PlayActionOptions } from '../characters/CharacterVisual';
import { loadModel } from '../characters/ModelCache';
import { CharacterLighting, createAnimeMaterial, type AnimeRole } from '../characters/render/AnimeMaterial';
import { LodSwitcher, meshLodReady } from '../characters/render/MeshLod';
import { buildOutlines } from '../characters/render/Outlines';
import { mergeSkinnedByMaterial } from '../characters/render/MergeSkinned';
import { createLogger } from '../core/Log';
import { clamp, damp, DEG, Easing } from '../core/math/MathUtil';
import type { Scheduler } from '../core/Scheduler';
import type { CreatureDefinition, CreatureLegDef } from '../data/creatures';
import { creatureClip, sampleCreatureClip, type CreatureClip, type SampledCreatureKey } from './CreatureClips';

const log = createLogger('Creature');

/**
 * Creatures are modelled as many parts; draw them as one mesh per look.
 * Done once on the cached source, so every clone shares the merged geometry.
 */
function mergeParts(id: string, scene: Object3D): void {
  if (scene.userData.partsMerged) return;
  scene.userData.partsMerged = true;
  const parts: SkinnedMesh[] = [];
  scene.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) parts.push(o as SkinnedMesh);
  });
  const merged = mergeSkinnedByMaterial(parts, (m) => {
    const src = m as MeshStandardMaterial;
    return `${(src.userData.role as string) ?? 'cloth'}:${src.color.getHexString()}`;
  });
  if (merged.length < parts.length) log.info(`${id}: ${parts.length} parts → ${merged.length} meshes`);
}
const TAU = Math.PI * 2;

interface Leg {
  def: CreatureLegDef;
  upper: Bone;
  lower: Bone;
  meta: Bone | null;
  toe: Bone | null;
  /** Rest positions in root space. */
  restContact: Vector3;
  ankleFromContact: Vector3;
  restToeDir: Vector3;
  length: number;
  groundOffset: number;
  plantedY: number;
}

interface ActiveAction {
  clip: CreatureClip;
  t: number;
  speed: number;
  opts: PlayActionOptions;
  resolve: () => void;
  contactFired: boolean;
  stopping: boolean;
  stopT: number;
}

/**
 * Procedural creature animation. A phase-based gait moves each foot through
 * stance (planted: slides back at exactly the body's speed, so no skating)
 * and swing (arcs forward); feet are placed on the ground by raycast and the
 * legs solved with two-bone IK plus a digitigrade metatarsus. The body bobs,
 * sways and leans; the neck aims the head at look targets; the tail sways
 * and trails on springs. Keyed additive clips cover actions (roar, nuzzle).
 */
export class CreatureVisual implements CharacterVisual {
  readonly root = new Group();
  eyeHeight = 1.8;
  groundQuery: GroundQuery | null = null;
  occlusionQuery: ((from: Vector3, dirToLight: Vector3) => boolean) | null = null;
  readonly fade = new Uniform(1);
  /** Hit flash strength (decays over ~0.12 s). */
  readonly flash = new Uniform(0);
  readonly envShadow = new Uniform(1);

  private model!: Object3D;
  private readonly bones = new Map<string, Bone>();
  private readonly restQ = new Map<Bone, Quaternion>();
  private readonly restP = new Map<Bone, Vector3>();
  private legs: Leg[] = [];
  private readonly springs = new SpringChainSystem();
  private readonly owned: Array<{ dispose(): void }> = [];
  private phase = 0;
  private moveBlend = 0;
  private runBlend = 0;
  private hipsDrop = 0;
  private time = Math.random() * 10;
  private lookTarget: Vector3 | null = null;
  private lookWeight = 0;
  private lookWeightTarget = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private idleLook = { yaw: 0, pitch: 0, timer: 2 };
  private jaw = 0;
  private speaking = false;
  private action: ActiveAction | null = null;
  private actionWeight = 0;
  private readonly sampled: SampledCreatureKey = { bones: {}, jaw: 0, lift: 0 };
  private occluding = false;
  private envTimer = 0;
  private envTarget = 1;
  private readonly lastRootPos = new Vector3(1e9, 0, 0);
  /** Index-only levels of detail by on-screen size. */
  lod!: LodSwitcher;

  private constructor(
    readonly def: CreatureDefinition,
    readonly scheduler: Scheduler,
  ) {
    this.root.name = `creature:${def.id}`;
  }

  static async create(def: CreatureDefinition, scheduler: Scheduler): Promise<CreatureVisual> {
    const c = new CreatureVisual(def, scheduler);
    const [gltf] = await Promise.all([loadModel(def.model), meshLodReady]);
    mergeParts(def.id, gltf.scene);
    c.model = SkeletonUtils.clone(gltf.scene) as Object3D;
    c.root.add(c.model);
    c.setup();
    return c;
  }

  static async preload(def: CreatureDefinition): Promise<void> {
    await loadModel(def.model);
  }

  // ------------------------------------------------------------------ setup
  private setup(): void {
    const def = this.def;
    const skinned: SkinnedMesh[] = [];
    this.model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    });
    for (const mesh of skinned) {
      const convert = (m: Material): Material => {
        const src = m as MeshStandardMaterial;
        const role = ((src.userData.role as AnimeRole) ?? 'cloth') as AnimeRole;
        const glow = role === 'eye' && src.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.3;
        return createAnimeMaterial({ color: src.color.clone(), role, fade: this.fade, flash: this.flash, envShadow: this.envShadow, emissive: glow ? src.color.clone().multiplyScalar(0.7) : undefined, vertexColors: !!mesh.geometry.attributes.color });
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.owned.push(m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.cannotReceiveAO = true;
    }
    this.owned.push(...buildOutlines(skinned, { base: new Color(def.outline), fade: this.fade, width: () => 0.0026 }));
    // Levels of detail sized by the creature's longest dimension.
    const size = new Box3().setFromObject(this.model).getSize(new Vector3());
    this.lod = new LodSwitcher(Math.max(size.x, size.y, size.z));
    this.model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) this.lod.add(m, m.name.endsWith('_outline') ? 1 : 0);
    });

    const skeleton = skinned[0]?.skeleton;
    if (!skeleton) throw new Error(`Creature ${def.id} has no skeleton`);
    for (const b of skeleton.bones) {
      this.bones.set(b.name, b);
      this.restQ.set(b, b.quaternion.clone());
      this.restP.set(b, b.position.clone());
    }
    this.root.updateMatrixWorld(true);
    for (const ld of def.legs) {
      const upper = this.bone(ld.upper);
      const lower = this.bone(ld.lower);
      if (!upper || !lower) {
        log.warn(`${def.id}: missing leg bones ${ld.upper}/${ld.lower}`);
        continue;
      }
      const meta = (ld.meta ? this.bone(ld.meta) : null) ?? null;
      const toe = (ld.toe ? this.bone(ld.toe) : null) ?? null;
      const hip = this.rootPos(upper);
      const knee = this.rootPos(lower);
      const ankle = meta ? this.rootPos(meta) : this.rootPos(lower).add(new Vector3(0, -0.3, 0));
      const contact = toe ? this.rootPos(toe) : ankle.clone();
      const toeTip = toe ? this.tailRootPos(toe) : contact.clone().add(new Vector3(0, 0, 0.1));
      this.legs.push({
        def: ld,
        upper,
        lower,
        meta,
        toe,
        restContact: contact.clone(),
        ankleFromContact: ankle.clone().sub(contact),
        restToeDir: toeTip.clone().sub(contact).setY(0).normalize(),
        length: hip.distanceTo(knee) + knee.distanceTo(ankle),
        groundOffset: contact.y,
        plantedY: 0,
      });
    }
    const head = this.bone(def.head);
    if (head) this.eyeHeight = this.rootPos(head).y + 0.05;

    // Tail on springs (the procedural sway writes its rest pose each frame).
    for (const sd of def.springs) {
      const chain = def.tail.filter((n) => n.startsWith(sd.prefix)).map((n) => this.bone(n)).filter((b): b is Bone => !!b);
      if (chain.length) this.springs.addChain(chain, { stiffness: sd.stiffness, drag: sd.drag, gravity: sd.gravity, hitRadius: sd.hitRadius ?? 0.04 });
    }
    this.springs.center = this.root;
    this.springs.inertia = 0.5;
  }

  private bone(name: string): Bone | undefined {
    return this.bones.get(name);
  }

  private rootPos(b: Object3D, out = new Vector3()): Vector3 {
    b.getWorldPosition(out);
    return this.root.worldToLocal(out);
  }

  /** Root-space position of a bone's tail (its first child bone, or extrapolated). */
  private tailRootPos(b: Bone): Vector3 {
    const child = b.children.find((c) => (c as Bone).isBone) as Bone | undefined;
    if (child) return this.rootPos(child);
    const p = this.rootPos(b);
    const parent = b.parent ? this.rootPos(b.parent) : p.clone().sub(new Vector3(0, 0, 0.1));
    return p.clone().add(p.clone().sub(parent).normalize().multiplyScalar(0.1));
  }

  // ------------------------------------------------------------------ CharacterVisual
  play(name: string, opts: PlayActionOptions = {}): Promise<void> {
    const clip = creatureClip(name);
    this.action?.resolve();
    return new Promise((resolve) => {
      this.action = { clip, t: 0, speed: opts.speed ?? 1, opts, resolve, contactFired: false, stopping: false, stopT: 0 };
    });
  }

  stopAction(): void {
    // Blend out rather than pop (getting up from a knock-down).
    if (this.action) this.action.stopping = true;
  }

  lookAt(target: Vector3 | null, weight = 1): void {
    if (target) {
      this.lookTarget = (this.lookTarget ?? new Vector3()).copy(target);
      this.lookWeightTarget = weight;
    } else this.lookWeightTarget = 0;
  }

  setExpression(expression: string): void {
    // Creatures emote through posture.
    if (expression === 'angry' || expression === 'determined') void this.play('alert');
    else if (expression === 'happy' || expression === 'joy') void this.play('snort');
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
  }

  setOccluding(occluding: boolean): void {
    this.occluding = occluding;
  }

  socketPosition(name: string, out: Vector3): Vector3 {
    const d = this.def;
    const map: Record<string, string | undefined> = { head: d.head, chest: d.spine[d.spine.length - 1], saddle: d.spine[0], jaw: d.jaw };
    const b = this.bone(map[name] ?? name) ?? this.bone(d.head);
    return b ? b.getWorldPosition(out) : this.root.getWorldPosition(out);
  }

  hitFlash(strength = 1): void {
    this.flash.value = Math.max(this.flash.value, strength);
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.root.removeFromParent();
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, loco: LocomotionState): void {
    if (dt <= 0) return;
    this.time += dt;
    const def = this.def;
    const g = def.gait;
    // Start from the bind pose every frame; everything below is additive.
    for (const [b, q] of this.restQ) b.quaternion.copy(q);
    for (const [b, p] of this.restP) b.position.copy(p);
    this.root.updateMatrixWorld(true);

    const speed = loco.speed;
    this.moveBlend = damp(this.moveBlend, clamp(speed / 0.6, 0, 1), 0.1, dt);
    this.runBlend = damp(this.runBlend, clamp((speed - g.runSpeed * 0.7) / (g.runSpeed * 0.6), 0, 1), 0.2, dt);
    const legLen = this.legs[0]?.length ?? 1;
    const strideLen = legLen * (g.walkStride + (g.runStride - g.walkStride) * this.runBlend);
    const duty = g.walkDuty + (g.runDuty - g.walkDuty) * this.runBlend;
    if (speed > 0.02) this.phase = (this.phase + (speed / strideLen) * dt) % 1;
    const S = duty * strideLen * this.moveBlend;

    // ---- Body: bob twice per cycle, sway over the stance foot, lean.
    const hips = this.bone(def.hips);
    const bob = -Math.abs(Math.cos(TAU * this.phase)) * g.bob * this.moveBlend * (1 + this.runBlend);
    const breath = Math.sin(this.time * 1.7) * 0.006 * (1 - this.moveBlend);
    const lean = g.runLean * this.runBlend + 3 * this.moveBlend;
    const turnRoll = clamp(-loco.turnRate * speed * 1.4, -12, 12);
    const sway = Math.sin(TAU * this.phase) * 4 * this.moveBlend;
    if (hips) {
      this.offsetRoot(hips, _v.set(Math.sin(TAU * this.phase) * 0.02 * this.moveBlend, bob + breath + this.hipsDrop + this.sampledLift(), 0));
      this.rotateRoot(hips, lean * 0.4, sway, turnRoll * 0.6);
    }
    for (const [i, n] of def.spine.entries()) {
      const b = this.bone(n);
      if (b) this.rotateRoot(b, lean * 0.2 + Math.sin(this.time * 1.7) * 0.8 * (1 - this.moveBlend), -sway * (0.6 + i * 0.2), turnRoll * 0.2);
    }

    // ---- Legs
    this.solveLegs(dt, S, duty, loco);

    // ---- Neck & head: look target or idle glances, countering body lean.
    this.aimHead(dt, lean);

    // ---- Tail: slow idle sway, swing against the hips while walking, lifted when running.
    for (const [i, n] of def.tail.entries()) {
      const b = this.bone(n);
      if (!b) continue;
      const k = (i + 1) / def.tail.length;
      const idle = Math.sin(this.time * 0.9 - i * 0.55) * 4 * (1 - this.moveBlend);
      const walk = -Math.sin(TAU * this.phase - i * 0.6) * 5 * this.moveBlend;
      this.rotateRoot(b, -this.runBlend * 6 * (1 - k) + (i === 0 ? -lean * 0.3 : 0), idle + walk, 0);
    }

    // ---- Action layer (additive, root space).
    this.applyAction(dt);

    // ---- Jaw
    const jawTarget = Math.max(this.sampled.jaw * this.actionWeight, this.speaking ? 0.25 + 0.25 * Math.abs(Math.sin(this.time * 9)) : 0);
    this.jaw = damp(this.jaw, jawTarget, 0.05, dt);
    const jaw = def.jaw ? this.bone(def.jaw) : undefined;
    if (jaw && this.jaw > 0.001) this.rotateRoot(jaw, this.jaw * 28, 0, 0);

    this.root.updateMatrixWorld(true);
    if (this.springs.chainCount) {
      const p = this.root.getWorldPosition(_v);
      if (p.distanceToSquared(this.lastRootPos) > 2.5 * 2.5) this.springs.reset();
      this.lastRootPos.copy(p);
      this.springs.captureRest();
      this.springs.update(dt);
    }
    this.updateShading(dt);
    if (this.flash.value > 0) this.flash.value = Math.max(0, this.flash.value - dt * 8);
  }

  private sampledLift(): number {
    return this.action ? this.sampled.lift * this.actionWeight : 0;
  }

  private solveLegs(dt: number, S: number, duty: number, loco: LocomotionState): void {
    const g = this.def.gait;
    let lowest = 0;
    for (const leg of this.legs) {
      // Walk → run phase offsets blend along the shortest way round the cycle.
      const run = leg.def.runPhase ?? leg.def.phase;
      let dp = run - leg.def.phase;
      dp -= Math.round(dp);
      const ph = (((this.phase + leg.def.phase + dp * this.runBlend) % 1) + 1) % 1;
      const target = _t.copy(leg.restContact);
      let lift = 0;
      if (ph < duty) {
        target.z += S / 2 - (ph / duty) * S;
      } else {
        const u = (ph - duty) / (1 - duty);
        target.z += -S / 2 + S * Easing.inOutSine(u);
        lift = Math.sin(Math.PI * u) * g.stepHeight * this.moveBlend * (1 + this.runBlend * 0.6);
      }
      // Root → world, then onto the ground.
      const world = this.root.localToWorld(_w.copy(target));
      let groundY = this.root.getWorldPosition(_v).y;
      if (this.groundQuery && loco.grounded) {
        const hit = this.groundQuery(world.x, world.y + 0.9, world.z);
        if (hit && Math.abs(hit.y - groundY) < 0.9) groundY = hit.y;
      }
      leg.plantedY = damp(leg.plantedY, groundY - this.root.getWorldPosition(_v).y, 0.05, dt);
      lowest = Math.min(lowest, leg.plantedY);
      world.y = this.root.getWorldPosition(_v).y + leg.plantedY + leg.groundOffset + lift;
      // Ankle sits above the contact, keeping the metatarsus's rest angle.
      const ankle = _a.copy(leg.ankleFromContact).applyQuaternion(this.root.getWorldQuaternion(_q)).add(world);
      if (leg.meta) {
        solveTwoBone(leg.upper, leg.lower, leg.meta, ankle, 1);
        // Point the metatarsus at the contact point.
        if (leg.toe) {
          const cur = leg.toe.getWorldPosition(_b).sub(leg.meta.getWorldPosition(_c)).normalize();
          const want = _d.copy(world).sub(leg.meta.getWorldPosition(_c)).normalize();
          rotateBoneWorld(leg.meta, _q2.setFromUnitVectors(cur, want));
          // Keep the toes level and pointing forward.
          const tip = this.toeTipWorld(leg.toe, _e);
          const curToe = tip.sub(leg.toe.getWorldPosition(_b)).normalize();
          const fwd = _d.copy(leg.restToeDir).transformDirection(this.root.matrixWorld);
          rotateBoneWorld(leg.toe, _q2.setFromUnitVectors(curToe, fwd));
        }
      } else {
        const end = (leg.lower.children.find((c) => (c as Bone).isBone) as Bone | undefined) ?? leg.lower;
        solveTwoBone(leg.upper, leg.lower, end, world, 1);
      }
    }
    // Drop the hips when both feet stand lower (slopes, steps down).
    this.hipsDrop = damp(this.hipsDrop, Math.min(0, lowest), 0.08, dt);
  }

  private toeTipWorld(toe: Bone, out: Vector3): Vector3 {
    const child = toe.children.find((c) => (c as Bone).isBone) as Bone | undefined;
    if (child) return child.getWorldPosition(out);
    // Blender bones point along their local +Y.
    return out.set(0, 0.1, 0).applyQuaternion(toe.getWorldQuaternion(_q)).add(toe.getWorldPosition(_c));
  }

  private aimHead(dt: number, lean: number): void {
    const def = this.def;
    const head = this.bone(def.head);
    if (!head) return;
    this.lookWeight = damp(this.lookWeight, this.lookTarget ? this.lookWeightTarget : 0, 0.15, dt);
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget && this.lookWeight > 0.01) {
      const local = this.root.worldToLocal(_v.copy(this.lookTarget));
      const from = this.rootPos(head, _c);
      const d = local.sub(from);
      yaw = clamp(Math.atan2(d.x, d.z), -70 * DEG, 70 * DEG);
      pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -35 * DEG, 40 * DEG);
    }
    // Idle glances when nothing holds attention.
    this.idleLook.timer -= dt;
    if (this.idleLook.timer <= 0) {
      this.idleLook.timer = 2.5 + Math.random() * 4;
      this.idleLook.yaw = (Math.random() - 0.5) * 70 * DEG;
      this.idleLook.pitch = (Math.random() - 0.3) * 20 * DEG;
    }
    const idleW = (1 - this.lookWeight) * (1 - this.moveBlend) * 0.8;
    const ty = yaw * this.lookWeight + this.idleLook.yaw * idleW;
    const tp = pitch * this.lookWeight + this.idleLook.pitch * idleW;
    this.lookYaw = damp(this.lookYaw, ty, 0.22, dt);
    this.lookPitch = damp(this.lookPitch, tp, 0.22, dt);
    const chain = [...def.neck, def.head];
    const share = [0.25, 0.25, 0.2, 0.3];
    for (const [i, n] of chain.entries()) {
      const b = this.bone(n);
      if (!b) continue;
      const s = share[i] ?? 0.25;
      // Neck counters the body's lean so the head stays level.
      this.rotateRoot(b, this.lookPitch / DEG * s - lean * 0.35 * s * 2, (this.lookYaw / DEG) * s, 0);
    }
  }

  private applyAction(dt: number): void {
    const a = this.action;
    if (!a) {
      this.actionWeight = damp(this.actionWeight, 0, 0.08, dt);
      return;
    }
    a.t += dt * a.speed;
    const u = Math.min(1, a.t / a.clip.duration);
    const fadeIn = a.opts.fadeIn ?? 0.15;
    this.actionWeight = Math.min(1, a.t / Math.max(0.01, fadeIn));
    if (a.stopping) {
      a.stopT += dt / 0.25;
      this.actionWeight *= Math.max(0, 1 - a.stopT);
      if (a.stopT >= 1) {
        this.action = null;
        a.resolve();
        return;
      }
    }
    sampleCreatureClip(a.clip, u, this.sampled);
    for (const [name, [x, y, z]] of Object.entries(this.sampled.bones)) {
      const b = this.bone(name);
      if (b) this.rotateRoot(b, x * this.actionWeight, y * this.actionWeight, z * this.actionWeight);
    }
    if (!a.contactFired && a.clip.contact !== undefined && u >= a.clip.contact) {
      a.contactFired = true;
      a.opts.onContact?.();
    }
    if (u >= 1) {
      if (a.opts.holdEnd && !a.stopping) {
        a.resolve();
        return;
      }
      this.action = null;
      a.resolve();
    }
  }

  private updateShading(dt: number): void {
    const view = CharacterLighting.viewPosition;
    const chest = this.socketPosition('chest', _v);
    const d = chest.distanceTo(view);
    this.lod.update(d);
    const target = CharacterLighting.cameraFade ? Math.min(clamp((d - 0.8) / 1.0, 0, 1), this.occluding ? 0.35 : 1) : 1;
    // Fade out fast (a snapping camera must never sit inside a hull for a
    // few frames), back in gently.
    this.fade.value = damp(this.fade.value, target, target < this.fade.value ? 0.015 : 0.06, dt);
    if (this.occlusionQuery) {
      this.envTimer -= dt;
      if (this.envTimer <= 0) {
        this.envTimer = 0.15;
        const head = this.socketPosition('head', _c).addScaledVector(CharacterLighting.keyLightDir, 0.4);
        this.envTarget = this.occlusionQuery(head, CharacterLighting.keyLightDir) ? 0 : 1;
      }
      this.envShadow.value = damp(this.envShadow.value, this.envTarget, 0.12, dt);
    }
  }

  // ------------------------------------------------------------------ root-space helpers
  /** Rotate a bone about its pivot by Euler degrees expressed in root space. */
  private rotateRoot(b: Bone, xDeg: number, yDeg: number, zDeg: number): void {
    if (xDeg === 0 && yDeg === 0 && zDeg === 0) return;
    const rq = this.root.getWorldQuaternion(_q);
    _q2.setFromEuler(_euler.set(xDeg * DEG, yDeg * DEG, zDeg * DEG, 'YXZ'));
    _q3.copy(rq).multiply(_q2).multiply(_q4.copy(rq).invert());
    rotateBoneWorld(b, _q3);
  }

  /** Translate a bone by a root-space offset. */
  private offsetRoot(b: Bone, offset: Vector3): void {
    if (!b.parent) return;
    const world = _e.copy(offset).applyQuaternion(this.root.getWorldQuaternion(_q));
    const parentQ = b.parent.getWorldQuaternion(_q2).invert();
    const parentScale = b.parent.getWorldScale(_c);
    world.applyQuaternion(parentQ).divide(parentScale);
    b.position.add(world);
    b.updateMatrixWorld(true);
  }
}

const _v = new Vector3();
const _t = new Vector3();
const _w = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _q4 = new Quaternion();
const _euler = new Euler();
