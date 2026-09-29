import { Color, Group, Quaternion, SkinnedMesh, Vector3, type Bone, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Box3, BufferAttribute, type BufferGeometry } from 'three';
import { AssetManager } from '../assets/AssetManager';
import { clamp, damp, DEG, Easing } from '../core/math/MathUtil';
import type { Scheduler } from '../core/Scheduler';
import type { CharacterDefinition } from '../data/characters';
import { CLIPS, sampleClip, STANCES, type ActionClip } from './anim/Clips';
import { DEFAULT_GAIT, GaitGenerator, IdleGenerator } from './anim/Gait';
import { alignFoot, solveTwoBone } from './anim/IK';
import { Pose, UPPER_BODY } from './anim/Pose';
import { SpringChainSystem } from './anim/SpringBones';
import type { CharacterVisual, LocomotionState, PlayActionOptions } from './CharacterVisual';
import { FaceRenderer, type MouthShape } from './face/FaceRenderer';
import { HUMAN_BONES, HumanoidRig, type HumanBone } from './rig/HumanoidRig';
import { createAnimeMaterial, createOutlineMaterial, type AnimeRole } from './render/AnimeMaterial';

export type GroundQuery = (x: number, y: number, z: number) => { y: number; normal: Vector3 } | null;

const gltfCache = new Map<string, Promise<GLTF>>();
function loadModel(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(AssetManager.url(url));
    gltfCache.set(url, p);
  }
  return p;
}

const ANIM_ALIASES: Record<string, string> = { reachHigh: 'reachMid', use: 'reachMid' };
const VISEMES: MouthShape[] = ['A', 'I', 'U', 'E', 'O', 'A', 'line', 'O', 'E'];

interface ActiveAction {
  clip: ActionClip;
  t: number;
  speed: number;
  opts: PlayActionOptions;
  resolve: () => void;
  contactFired: boolean;
  stopping: boolean;
  stopT: number;
}

/**
 * A fully animated anime character: toon materials + outlines, a painted
 * expressive face, procedural locomotion and idle, keyframed actions,
 * turn leaning, look-at with eye gaze, foot IK on uneven ground, and
 * spring-bone hair and cloth.
 */
export class AnimeCharacter implements CharacterVisual {
  readonly root = new Group();
  eyeHeight = 1.55;
  rig!: HumanoidRig;
  face: FaceRenderer | null = null;
  readonly springs = new SpringChainSystem();
  groundQuery: GroundQuery | null = null;
  private gait!: GaitGenerator;
  private idle!: IdleGenerator;
  private readonly pose = new Pose();
  private readonly actionPose = new Pose();
  private readonly tmpA = new Pose();
  private readonly tmpB = new Pose();
  private action: ActiveAction | null = null;
  private lookTarget: Vector3 | null = null;
  private lookWeight = 0;
  private lookWeightTarget = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private speaking = false;
  private visemeTimer = 0;
  private expressionTimer = 0;
  private hipsParentInv = new Quaternion();
  private hipsRest = new Vector3();
  private ikHipsDrop = 0;
  private readonly footOffsets = { L: 0, R: 0 };
  private moveBlend = 0;
  private airBlend = 0;

  private constructor(
    readonly def: CharacterDefinition,
    /** Game-time clock for timed facial beats and future timed layers. */
    readonly scheduler: Scheduler,
  ) {
    this.root.name = `char:${def.id}`;
  }

  static async create(def: CharacterDefinition, scheduler: Scheduler): Promise<AnimeCharacter> {
    const c = new AnimeCharacter(def, scheduler);
    const gltf = await loadModel(def.model);
    const model = SkeletonUtils.clone(gltf.scene) as Object3D;
    c.root.add(model);
    c.setup(model);
    return c;
  }

  private setup(model: Object3D): void {
    const def = this.def;
    const skinned: SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    });
    const outlineBase = new Color(def.outline);
    for (const mesh of skinned) {
      const isFace = typeof mesh.userData.face === 'string';
      if (isFace) this.face = new FaceRenderer({ ...def.face, eyeLine: def.face.eyeLine ?? JSON.parse(mesh.userData.face as string).eyeLine });
      const convert = (m: Material): Material => {
        const src = m as MeshStandardMaterial;
        const role = ((src.userData.role as AnimeRole) ?? 'cloth') as AnimeRole;
        if (role === 'face' && this.face) return createAnimeMaterial({ color: new Color(1, 1, 1), role: 'face', map: this.face.texture, emissiveMap: this.face.glow });
        return createAnimeMaterial({ color: src.color.clone(), role });
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned bounds are unreliable when posed
      if (isFace) {
        sphericalNormals(mesh.geometry);
        // Hair/fringe self-shadowing bands across an anime face read as dirt.
        mesh.receiveShadow = false;
      }
    }

    // Outlines: one inverted-hull shell per source mesh. Multi-material glTF
    // meshes arrive split per material; merge them back so outlines don't
    // draw along internal material seams.
    const groups = new Map<Object3D, SkinnedMesh[]>();
    for (const mesh of skinned) {
      const key = mesh.parent && mesh.parent.children.filter((c) => (c as SkinnedMesh).isSkinnedMesh).length > 1 ? mesh.parent : mesh;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      const first = list[0]!;
      const mat0 = (Array.isArray(first.material) ? first.material[0] : first.material) as MeshStandardMaterial;
      const role = mat0.userData.role as AnimeRole;
      const geometry =
        list.length > 1
          ? mergeGeometries(list.map((m) => stripForOutline(m.geometry)), false) ?? first.geometry
          : first.geometry;
      const outlineColor = role === 'hair' ? mat0.color.clone().multiplyScalar(0.35).lerp(outlineBase, 0.4) : role === 'face' || role === 'skin' ? new Color(0x8a5048) : outlineBase;
      const width = role === 'face' ? 0.0012 : role === 'hair' ? 0.0022 : 0.0026;
      const outline = new SkinnedMesh(geometry, createOutlineMaterial(outlineColor, width));
      outline.bind(first.skeleton, first.bindMatrix);
      outline.position.copy(first.position);
      outline.quaternion.copy(first.quaternion);
      outline.scale.copy(first.scale);
      outline.frustumCulled = false;
      outline.castShadow = false;
      outline.name = `${first.name}_outline`;
      first.parent!.add(outline);
    }

    this.rig = new HumanoidRig(model, skinned);
    const hips = this.rig.bone('hips');
    this.hipsRest.copy(hips.position);
    const parentRest = new Quaternion();
    hips.parent!.getWorldQuaternion(parentRest);
    const rootQ = new Quaternion();
    model.getWorldQuaternion(rootQ);
    this.hipsParentInv.copy(rootQ.invert().multiply(parentRest)).invert();
    const headPos = this.rig.bone('head').getWorldPosition(new Vector3());
    this.eyeHeight = headPos.y - this.root.getWorldPosition(new Vector3()).y + 0.08 * (def.height / 1.7);

    const legLen = this.rig.lengths.upperLeg! + this.rig.lengths.lowerLeg!;
    this.gait = new GaitGenerator({ ...DEFAULT_GAIT, ...def.gait }, legLen);
    this.idle = new IdleGenerator(STANCES[def.stance] ?? STANCES.neutral!);

    // Spring chains
    for (const sd of def.springs) {
      const bones = Array.from(this.rig.extra.entries())
        .filter(([n]) => n.startsWith(sd.prefix + '_') || n.startsWith(sd.prefix))
        .map(([n, b]) => ({ n, b }));
      // group by chain name (strip trailing _<index>)
      const chains = new Map<string, Array<{ i: number; b: Bone }>>();
      for (const { n, b } of bones) {
        const m = /^(.*)_(\d+)$/.exec(n);
        if (!m) continue;
        const list = chains.get(m[1]!) ?? [];
        list.push({ i: Number(m[2]), b });
        chains.set(m[1]!, list);
      }
      for (const list of chains.values()) {
        list.sort((a, b) => a.i - b.i);
        this.springs.addChain(
          list.map((x) => x.b),
          { stiffness: sd.stiffness, drag: sd.drag, gravity: sd.gravity, hitRadius: sd.hitRadius ?? 0.02 },
        );
      }
    }
    if (this.springs.chainCount > 0) {
      const s = def.height / 1.7;
      this.springs.addCollider({ bone: this.rig.bone('head'), offset: new Vector3(0, 0.09 * s, 0.01), radius: 0.115 * s });
      this.springs.addCollider({ bone: this.rig.bone('upperChest'), offset: new Vector3(0, 0.02, 0), radius: 0.13 * s });
      this.springs.addCollider({ bone: this.rig.bone('spine'), offset: new Vector3(0, 0.05, 0), radius: 0.13 * s });
      this.springs.addCollider({ bone: this.rig.bone('hips'), offset: new Vector3(0, 0, 0), radius: 0.15 * s });
      for (const side of ['L', 'R'] as const) {
        const leg = this.rig.bone(`upperLeg${side}` as HumanBone);
        this.springs.addCollider({ bone: leg, offset: new Vector3(0, this.rig.lengths.upperLeg! * 0.35, 0), radius: 0.09 * s });
        this.springs.addCollider({ bone: leg, offset: new Vector3(0, this.rig.lengths.upperLeg! * 0.8, 0), radius: 0.075 * s });
      }
    }
    this.face?.setExpression(def.defaultExpression);
  }

  // ------------------------------------------------------------------ CharacterVisual
  play(name: string, opts: PlayActionOptions = {}): Promise<void> {
    const clip = CLIPS[ANIM_ALIASES[name] ?? name] ?? CLIPS.reachMid!;
    this.action?.resolve();
    return new Promise((resolve) => {
      this.action = { clip, t: 0, speed: opts.speed ?? 1, opts, resolve, contactFired: false, stopping: false, stopT: 0 };
    });
  }

  stopAction(): void {
    if (this.action) {
      this.action.stopping = true;
      this.action.stopT = 0;
    }
  }

  lookAt(target: Vector3 | null, weight = 1): void {
    if (target) {
      this.lookTarget = (this.lookTarget ?? new Vector3()).copy(target);
      this.lookWeightTarget = weight;
    } else {
      this.lookWeightTarget = 0;
    }
  }

  setExpression(expression: string, intensity = 1, holdSeconds = 0): void {
    this.face?.setExpression(expression, intensity);
    this.expressionTimer = holdSeconds;
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
    if (!speaking) this.face?.setViseme(null);
  }

  /** External lip-sync feed (e.g. from voiced audio analysis). */
  setViseme(v: MouthShape | null): void {
    this.face?.setViseme(v);
  }

  socketPosition(name: string, out: Vector3): Vector3 {
    const bone = HUMAN_BONES.includes(name as HumanBone) ? this.rig.bone(name as HumanBone) : this.rig.bone('head');
    return bone.getWorldPosition(out);
  }

  dispose(): void {
    this.face?.dispose();
    this.root.removeFromParent();
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, loco: LocomotionState): void {
    this.updateFace(dt);

    // --- Base: idle ↔ locomotion
    const moving = clamp((loco.speed - 0.05) / 0.5, 0, 1);
    this.moveBlend = damp(this.moveBlend, moving, 0.08, dt);
    this.gait.advance(dt, loco.speed);
    const idle = this.idle.pose(dt, loco);
    if (this.moveBlend > 0.01) {
      const walk = this.gait.pose(loco);
      this.pose.blend(idle, walk, this.moveBlend);
    } else {
      this.pose.copy(idle);
    }

    // --- Airborne
    this.airBlend = damp(this.airBlend, loco.grounded ? 0 : 1, 0.06, dt);
    if (this.airBlend > 0.01) {
      Pose.fromSpec(
        {
          upperLegL: [-35, 0, 4],
          lowerLegL: [60, 0, 0],
          upperLegR: [-5, 0, -4],
          lowerLegR: [30, 0, 0],
          upperArmL: [-20, 0, 25],
          upperArmR: [-10, 0, -30],
          lowerArmL: [-40, 0, 0],
          lowerArmR: [-30, 0, 0],
          spine: [loco.verticalVelocity > 0 ? -4 : 6, 0, 0],
        },
        this.tmpA,
      );
      this.pose.blend(this.pose, this.tmpA, this.airBlend);
    }

    // --- Action layer
    const a = this.action;
    if (a) {
      const c = a.clip;
      a.t += (dt * a.speed) / c.duration;
      const u = Math.min(a.t, 1);
      sampleClip(c, u, this.actionPose, this.tmpA, this.tmpB);
      let w = Math.min(1, u / Math.max(c.fadeIn / c.duration, 1e-3), (1 - u) / Math.max(c.fadeOut / c.duration, 1e-3));
      if (a.stopping) {
        a.stopT += dt / 0.2;
        w *= 1 - Math.min(1, a.stopT);
      }
      w = Easing.inOutSine(clamp(w, 0, 1));
      // While walking, keep the legs on locomotion for upper-body clips.
      const m = c.mask === UPPER_BODY || loco.speed < 0.3 ? c.mask : UPPER_BODY;
      this.pose.blend(this.pose, this.actionPose, w, m);
      if (!a.contactFired && c.contact !== undefined && u >= c.contact) {
        a.contactFired = true;
        a.opts.onContact?.();
      }
      if (u >= 1 || (a.stopping && a.stopT >= 1)) {
        if (!a.contactFired) a.opts.onContact?.();
        this.action = null;
        a.resolve();
      }
    }

    // --- Lean into turns and acceleration
    const lean = clamp(loco.turnRate * loco.speed * 1.6, -14, 14);
    this.pose.rotate('hips', 0, 0, -lean * 0.5);
    this.pose.rotate('spine', 0, 0, -lean * 0.4);
    this.pose.rotate('head', 0, 0, lean * 0.5);

    // --- Look-at
    this.applyLookAt(dt);

    // --- Apply to the skeleton
    for (let i = 0; i < HUMAN_BONES.length; i++) this.rig.setHuman(HUMAN_BONES[i]!, this.pose.rot[i]!);
    const hips = this.rig.bone('hips');
    const off = _v.copy(this.pose.hipsOffset);
    off.y += this.ikHipsDrop;
    hips.position.copy(this.hipsRest).add(off.applyQuaternion(this.hipsParentInv));
    this.root.updateMatrixWorld(true);

    // --- Foot IK on uneven ground
    if (this.groundQuery && loco.grounded && this.airBlend < 0.3) this.footIK(dt, loco);
    else this.ikHipsDrop = damp(this.ikHipsDrop, 0, 0.1, dt);

    // --- Springs last (they react to the final pose)
    if (this.springs.chainCount > 0) {
      this.springs.captureRest();
      this.springs.update(dt);
    }
  }

  private updateFace(dt: number): void {
    const f = this.face;
    if (!f) return;
    if (this.expressionTimer > 0) {
      this.expressionTimer -= dt;
      if (this.expressionTimer <= 0) f.setExpression(this.def.defaultExpression);
    }
    if (this.speaking) {
      this.visemeTimer -= dt;
      if (this.visemeTimer <= 0) {
        this.visemeTimer = 0.07 + Math.random() * 0.09;
        f.setViseme(VISEMES[Math.floor(Math.random() * VISEMES.length)]!);
      }
    }
    f.update(dt);
  }

  private applyLookAt(dt: number): void {
    this.lookWeight = damp(this.lookWeight, this.lookWeightTarget, 0.15, dt);
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget && this.lookWeight > 0.01) {
      const local = this.root.worldToLocal(_v.copy(this.lookTarget));
      local.y -= this.eyeHeight;
      yaw = Math.atan2(local.x, local.z);
      pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      // Past ~110° behind, don't try to twist around.
      if (Math.abs(yaw) > 110 * DEG) yaw = 0;
    }
    const yawC = clamp(yaw, -70 * DEG, 70 * DEG);
    const pitchC = clamp(pitch, -35 * DEG, 30 * DEG);
    this.lookYaw = damp(this.lookYaw, yawC * this.lookWeight, 0.12, dt);
    this.lookPitch = damp(this.lookPitch, pitchC * this.lookWeight, 0.12, dt);
    const yd = this.lookYaw / DEG;
    const pd = this.lookPitch / DEG;
    this.pose.rotate('chest', 0, yd * 0.15, 0);
    this.pose.rotate('neck', -pd * 0.4, yd * 0.35, 0);
    this.pose.rotate('head', -pd * 0.6, yd * 0.5, 0);
    // Eyes take up whatever the head didn't.
    if (this.face) {
      const residualYaw = (yaw - this.lookYaw) * this.lookWeight;
      const residualPitch = (pitch - this.lookPitch) * this.lookWeight;
      this.face.setGaze(residualYaw / (28 * DEG), residualPitch / (22 * DEG));
    }
  }

  private footIK(dt: number, loco: LocomotionState): void {
    const q = this.groundQuery!;
    const rootY = this.root.getWorldPosition(_r).y;
    const footH = this.rig.lengths.footHeight!;
    let minOffset = 0;
    const targets: Array<{ side: 'L' | 'R'; normal: Vector3; offset: number }> = [];
    for (const side of ['L', 'R'] as const) {
      const foot = this.rig.bone(`foot${side}` as HumanBone);
      const p = foot.getWorldPosition(new Vector3());
      const hit = q(p.x, rootY + 0.6, p.z);
      if (!hit) continue;
      // Terrain difference under this foot relative to the character's floor.
      let offset = clamp(hit.y - rootY, -0.45, 0.45);
      this.footOffsets[side] = damp(this.footOffsets[side], offset, 0.05, dt);
      offset = this.footOffsets[side];
      minOffset = Math.min(minOffset, offset);
      targets.push({ side, normal: hit.normal, offset });
    }
    // Drop the pelvis so the lower foot can reach (stairs down, slopes).
    const moving = loco.speed > 0.3;
    this.ikHipsDrop = damp(this.ikHipsDrop, minOffset * (moving ? 0.8 : 1), 0.08, dt);
    if (Math.abs(this.ikHipsDrop) > 0.002) {
      const hips = this.rig.bone('hips');
      hips.position.add(_v.set(0, this.ikHipsDrop, 0).applyQuaternion(this.hipsParentInv));
      this.root.updateMatrixWorld(true);
    }
    for (const t of targets) {
      // The hips moved: re-read the foot and keep its planned height.
      const upper = this.rig.bone(`upperLeg${t.side}` as HumanBone);
      const lower = this.rig.bone(`lowerLeg${t.side}` as HumanBone);
      const foot = this.rig.bone(`foot${t.side}` as HumanBone);
      // After the pelvis drop the foot sits at (animated + drop); it should
      // sit at (animated + terrain offset), and never sink into the ground.
      const cur = foot.getWorldPosition(new Vector3());
      const goal = cur.clone();
      goal.y = Math.max(cur.y - this.ikHipsDrop + t.offset, rootY + t.offset + footH * 0.95);
      if (Math.abs(goal.y - cur.y) > 0.004) solveTwoBone(upper, lower, foot, goal, 1);
      if (!moving) alignFoot(foot, t.normal, 0.8);
    }
  }
}

const _v = new Vector3();
const _r = new Vector3();

/** Keep only the attributes an outline shell needs (so split primitives merge). */
function stripForOutline(g: BufferGeometry): BufferGeometry {
  const out = g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) out.deleteAttribute(name);
  }
  out.clearGroups();
  return out;
}

/**
 * Replace head normals with normals from a sphere centred slightly behind
 * the face: the anime-model trick for clean, gradient-free face shading.
 */
function sphericalNormals(g: BufferGeometry): void {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new Vector3());
  const size = g.boundingBox!.getSize(new Vector3());
  c.z -= size.z * 0.15;
  const pos = g.getAttribute('position');
  const n = new Float32Array(pos.count * 3);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c).normalize();
    n[i * 3] = v.x;
    n[i * 3 + 1] = v.y;
    n[i * 3 + 2] = v.z;
  }
  g.setAttribute('normal', new BufferAttribute(n, 3));
}
void Box3;
