import { Bone, Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';

/** VRM-style humanoid bone ids used by all animation code. */
export const HUMAN_BONES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'lowerArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'lowerArmR',
  'handR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'toesL',
  'upperLegR',
  'lowerLegR',
  'footR',
  'toesR',
] as const;

export type HumanBone = (typeof HUMAN_BONES)[number];

/** Mirror partner for left/right bones (identity for the spine). */
export function mirrorBone(b: HumanBone): HumanBone {
  if (b.endsWith('L')) return (b.slice(0, -1) + 'R') as HumanBone;
  if (b.endsWith('R') && b !== 'upperChest') return (b.slice(0, -1) + 'L') as HumanBone;
  return b;
}

/**
 * Wraps a skinned glTF skeleton with a normalised humanoid interface.
 *
 * Animation code works with *normalised* local rotations: rotations in
 * character space (X = the character's left, Y = up, Z = forward) applied
 * at each joint, with identity meaning "rest pose". The rig converts them to
 * the raw bone locals regardless of how bones were rolled in Blender:
 *
 *   L_raw = P_rest⁻¹ · q_n · W_rest
 *
 * where W_rest / P_rest are the bone's and its parent's rest orientations
 * in character space.
 */
export class HumanoidRig {
  readonly bones = new Map<HumanBone, Bone>();
  readonly extra = new Map<string, Bone>();
  private readonly restWorld = new Map<Bone, Quaternion>();
  private readonly parentRestWorldInv = new Map<Bone, Quaternion>();
  private readonly restLocal = new Map<Bone, Quaternion>();
  readonly restPosition = new Map<Bone, Vector3>();
  readonly hipsRestHeight: number;
  /** Rest-pose lengths (upper/lower leg etc.) for IK. */
  readonly lengths: Record<string, number> = {};

  constructor(
    readonly root: Object3D,
    meshes: SkinnedMesh[],
  ) {
    root.updateMatrixWorld(true);
    const rootInv = new Quaternion();
    root.getWorldQuaternion(rootInv).invert();
    const all = new Map<string, Bone>();
    root.traverse((o) => {
      if ((o as Bone).isBone) all.set(o.name, o as Bone);
    });
    for (const name of HUMAN_BONES) {
      const b = all.get(name);
      if (b) this.bones.set(name, b);
    }
    for (const [n, b] of all) if (!this.bones.has(n as HumanBone) && n !== 'root') this.extra.set(n, b);
    const missing = HUMAN_BONES.filter((b) => !this.bones.has(b));
    if (missing.length) throw new Error(`Rig missing bones: ${missing.join(', ')}`);

    for (const b of all.values()) {
      const w = new Quaternion();
      b.getWorldQuaternion(w).premultiply(rootInv);
      this.restWorld.set(b, w);
      this.restLocal.set(b, b.quaternion.clone());
      this.restPosition.set(b, b.position.clone());
    }
    // Virtual rest for the arm chains: the glTF rest is an A-pose; we treat
    // "arms hanging down" as the normalised identity so arm poses are authored
    // exactly like legs (−X swings forward, −X on the elbow flexes it).
    for (const side of ['L', 'R'] as const) {
      const upper = this.bone(`upperArm${side}` as HumanBone);
      const hand = this.bone(`hand${side}` as HumanBone);
      const a = upper.getWorldPosition(new Vector3());
      const bpos = hand.getWorldPosition(new Vector3());
      const dir = bpos.sub(a).normalize().applyQuaternion(rootInv);
      const down = new Quaternion().setFromUnitVectors(dir, new Vector3(0, -1, 0));
      for (const n of ['upperArm', 'lowerArm', 'hand'] as const) {
        const bone = this.bone(`${n}${side}` as HumanBone);
        this.restWorld.set(bone, down.clone().multiply(this.restWorld.get(bone)!));
      }
    }
    for (const b of all.values()) {
      const pw = b.parent && (b.parent as Bone).isBone ? this.restWorld.get(b.parent as Bone)! : this.parentRootRest(b, rootInv);
      this.parentRestWorldInv.set(b, pw.clone().invert());
    }
    void meshes;
    const hips = this.bone('hips');
    this.hipsRestHeight = hips.getWorldPosition(new Vector3()).y - root.getWorldPosition(new Vector3()).y;
    const wp = (n: HumanBone) => this.bone(n).getWorldPosition(new Vector3());
    this.lengths.upperLeg = wp('upperLegL').distanceTo(wp('lowerLegL'));
    this.lengths.lowerLeg = wp('lowerLegL').distanceTo(wp('footL'));
    this.lengths.upperArm = wp('upperArmL').distanceTo(wp('lowerArmL'));
    this.lengths.lowerArm = wp('lowerArmL').distanceTo(wp('handL'));
    this.lengths.footHeight = wp('footL').y - root.getWorldPosition(new Vector3()).y;
  }

  private parentRootRest(b: Bone, rootInv: Quaternion): Quaternion {
    const q = new Quaternion();
    if (b.parent) b.parent.getWorldQuaternion(q).premultiply(rootInv);
    return q;
  }

  bone(name: HumanBone): Bone {
    return this.bones.get(name)!;
  }

  /** Apply a normalised local rotation (character-space axes) to a bone. */
  setNormalized(bone: Bone, q: Quaternion): void {
    const pInv = this.parentRestWorldInv.get(bone)!;
    const wRest = this.restWorld.get(bone)!;
    bone.quaternion.copy(pInv).multiply(q).multiply(wRest);
  }

  setHuman(name: HumanBone, q: Quaternion): void {
    this.setNormalized(this.bone(name), q);
  }

  /** Reset every bone to its rest pose. */
  resetPose(): void {
    for (const [b, q] of this.restLocal) {
      b.quaternion.copy(q);
      b.position.copy(this.restPosition.get(b)!);
    }
  }

  restWorldOf(bone: Bone): Quaternion {
    return this.restWorld.get(bone)!;
  }

  /**
   * Set a bone so that its *current* world orientation becomes `worldQ`
   * (character-space world, i.e. relative to the rig root). Used by IK.
   */
  setWorldRotation(bone: Bone, worldQ: Quaternion): void {
    const parentWorld = new Quaternion();
    bone.parent!.getWorldQuaternion(parentWorld);
    const rootQ = this.root.getWorldQuaternion(_q);
    // bone.world = parentWorld * local  →  local = parentWorld⁻¹ * (root * worldQ)
    bone.quaternion.copy(parentWorld.invert()).multiply(rootQ.multiply(worldQ));
  }
}

const _q = new Quaternion();