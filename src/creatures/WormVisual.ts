import { Color, Group, Matrix4, Quaternion, Uniform, Vector3, type Bone, type Material, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterVisual, LocomotionState, PlayActionOptions } from '../characters/CharacterVisual';
import { loadModel } from '../characters/ModelCache';
import { CharacterLighting, createAnimeMaterial, type AnimeRole } from '../characters/render/AnimeMaterial';
import { buildOutlines } from '../characters/render/Outlines';
import { clamp, damp } from '../core/math/MathUtil';

/**
 * A long segmented body laid along the path its head has travelled (the
 * Sand Earthworm). The controller moves the head; every segment follows the
 * trail at its own arc-length, so the worm breaches, arcs and dives like a
 * single living thing. Segment bones are siblings under the root.
 */
export class WormVisual implements CharacterVisual {
  readonly root = new Group();
  eyeHeight = 1;
  readonly fade = new Uniform(1);
  readonly flash = new Uniform(0);
  readonly envShadow = new Uniform(1);
  private readonly segs: Bone[] = [];
  private readonly restWorld: Quaternion[] = [];
  private readonly owned: Array<{ dispose(): void }> = [];
  /** Head trail, newest first. */
  private readonly trail: Vector3[] = [];
  private readonly headPos = new Vector3();
  private readonly headDir = new Vector3(0, 0, 1);
  segLength = 1.15;
  private time = 0;
  private sway = 0;
  private swayTarget = 0;

  private constructor(private readonly model: Object3D) {
    this.root.add(model);
  }

  static async create(url: string, outline: string, segLength: number): Promise<WormVisual> {
    const gltf = await loadModel(url);
    const v = new WormVisual(SkeletonUtils.clone(gltf.scene) as Object3D);
    v.segLength = segLength;
    v.setup(outline);
    return v;
  }

  private setup(outline: string): void {
    const skinned: SkinnedMesh[] = [];
    this.model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    });
    for (const mesh of skinned) {
      const convert = (m: Material): Material => {
        const src = m as MeshStandardMaterial;
        return createAnimeMaterial({ color: src.color.clone(), role: ((src.userData.role as AnimeRole) ?? 'cloth') as AnimeRole, fade: this.fade, flash: this.flash, envShadow: this.envShadow, vertexColors: !!mesh.geometry.attributes.color });
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.owned.push(m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.cannotReceiveAO = true;
    }
    this.owned.push(...buildOutlines(skinned, { base: new Color(outline), fade: this.fade, width: () => 0.0022 }));
    const bones = skinned[0]!.skeleton.bones;
    this.model.updateMatrixWorld(true);
    for (let i = 0; ; i++) {
      const b = bones.find((x) => x.name === `seg${i}`);
      if (!b) break;
      this.segs.push(b);
      this.restWorld.push(b.getWorldQuaternion(new Quaternion()));
    }
  }

  get segmentCount(): number {
    return this.segs.length;
  }

  /** Start a fresh trail: the body lies straight behind `head`, going down into the ground. */
  resetTrail(head: Vector3, dir: Vector3, dive = 0.5): void {
    this.trail.length = 0;
    const back = dir.clone().setY(0).normalize().negate();
    const len = (this.segs.length + 2) * this.segLength;
    for (let d = 0; d <= len; d += 0.25) this.trail.push(head.clone().addScaledVector(back, d).add(new Vector3(0, -d * dive, 0)));
    this.headPos.copy(head);
    this.headDir.copy(dir).normalize();
  }

  /** Feed the head's new position (called by the controller every frame). */
  moveHead(p: Vector3): void {
    const last = this.trail[0];
    if (!last || last.distanceTo(p) >= 0.2) {
      this.trail.unshift(p.clone());
      const max = Math.ceil(((this.segs.length + 3) * this.segLength) / 0.2) + 10;
      if (this.trail.length > max) this.trail.length = max;
    } else last.copy(p);
    if (last) {
      const d = _a.subVectors(p, last);
      if (d.lengthSq() > 1e-6) this.headDir.lerp(d.normalize(), 0.3).normalize();
    }
    this.headPos.copy(p);
  }

  /** Point `dist` metres back along the trail. */
  sample(dist: number, out: Vector3): Vector3 {
    let remaining = dist;
    let prev = this.headPos;
    for (const p of this.trail) {
      const seg = prev.distanceTo(p);
      if (seg >= remaining && seg > 1e-5) return out.copy(prev).lerp(p, remaining / seg);
      remaining -= seg;
      prev = p;
    }
    return out.copy(prev).addScaledVector(this.headDir, -remaining);
  }

  /** World positions of the segments (for hit tests). */
  segmentPositions(out: Vector3[]): Vector3[] {
    for (let i = 0; i < this.segs.length; i++) {
      out[i] ??= new Vector3();
      this.sample(i * this.segLength, out[i]!);
    }
    out.length = this.segs.length;
    return out;
  }

  // ------------------------------------------------------------------ CharacterVisual
  play(name: string, opts: PlayActionOptions = {}): Promise<void> {
    if (name === 'roar' || name === 'shake' || name === 'flinch') this.swayTarget = name === 'roar' ? 1 : 0.6;
    opts.onContact?.();
    return Promise.resolve();
  }
  stopAction(): void {
    this.swayTarget = 0;
  }
  lookAt(): void {}
  setExpression(): void {}
  setSpeaking(): void {}
  socketPosition(_name: string, out: Vector3): Vector3 {
    return out.copy(this.headPos);
  }
  setOccluding(): void {}
  hitFlash(strength = 1): void {
    this.flash.value = Math.max(this.flash.value, strength);
  }
  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.root.removeFromParent();
  }

  update(dt: number, _loco: LocomotionState): void {
    this.time += dt;
    if (this.flash.value > 0) this.flash.value = Math.max(0, this.flash.value - dt * 8);
    this.sway = damp(this.sway, this.swayTarget, 0.2, dt);
    this.swayTarget = Math.max(0, this.swayTarget - dt * 0.6);
    if (!this.segs.length) return;
    this.model.updateMatrixWorld(true);
    const p = _a;
    const next = _b;
    for (let i = 0; i < this.segs.length; i++) {
      const bone = this.segs[i]!;
      this.sample(i * this.segLength, p);
      this.sample(i * this.segLength + 0.5, next);
      const fwd = _c.subVectors(p, next);
      if (fwd.lengthSq() < 1e-8) fwd.copy(this.headDir);
      fwd.normalize();
      // A living shudder near the head (roars, hits).
      const w = this.sway * clamp(1 - i / 5, 0, 1);
      if (w > 0.001) p.x += Math.sin(this.time * 18 + i) * 0.12 * w;
      // Rest: bones run along model -Z → forward is +Z. Keep the back up.
      _m.lookAt(_zero, _neg.copy(fwd).negate(), _up);
      _q.setFromRotationMatrix(_m); // maps +Z to -(-fwd) = fwd
      // Rest pose faces +Z: rotate the bind orientation onto the trail.
      const world = _q2.copy(_q).multiply(this.restWorld[i]!);
      const parent = bone.parent!;
      parent.updateMatrixWorld(true);
      _inv.copy(parent.matrixWorld).invert();
      bone.position.copy(p).applyMatrix4(_inv);
      bone.quaternion.copy(parent.getWorldQuaternion(_q3).invert()).multiply(world);
      bone.updateMatrixWorld(true);
    }
    // Fade by the nearest segment, not just the head: a breach that sweeps
    // the body through the camera must never fill the screen with hull.
    const view = CharacterLighting.viewPosition;
    let d = this.headPos.distanceTo(view);
    for (const bone of this.segs) d = Math.min(d, bone.getWorldPosition(_a).distanceTo(view));
    const target = clamp((d - 1.2) / 1.5, 0, 1);
    this.fade.value = target < this.fade.value ? target : damp(this.fade.value, target, 0.06, dt);
  }
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _neg = new Vector3();
const _zero = new Vector3();
const _up = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _inv = new Matrix4();
