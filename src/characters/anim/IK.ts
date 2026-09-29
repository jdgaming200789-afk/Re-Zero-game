import { Quaternion, Vector3, type Bone } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _qw = new Quaternion();
const _qp = new Quaternion();

/** Rotate `bone` (in world space) by `delta`, keeping its parent fixed. */
export function rotateBoneWorld(bone: Bone, delta: Quaternion): void {
  bone.getWorldQuaternion(_qw);
  bone.parent!.getWorldQuaternion(_qp);
  _qw.premultiply(delta);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK (thigh-shin-ankle or arm-forearm-wrist). Keeps the
 * existing bend plane (so knees keep pointing where the animation put them)
 * and never hyper-extends. `weight` blends toward the solution.
 */
export function solveTwoBone(upper: Bone, lower: Bone, end: Bone, target: Vector3, weight = 1, pole?: Vector3): void {
  if (weight <= 0) return;
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const lenA = _a.distanceTo(_b);
  const lenB = _b.distanceTo(_c);
  const toT = _v1.subVectors(target, _a);
  const dist = Math.min(Math.max(toT.length(), 1e-4), (lenA + lenB) * 0.999);
  const dir = toT.normalize();
  // Bend direction from the current knee (or an explicit pole), orthogonal to dir.
  const bend = _v2.copy(pole ?? _b).sub(_a);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  const cosA = (lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const kneeNew = new Vector3().copy(_a).addScaledVector(dir, cosA * lenA).addScaledVector(bend, sinA * lenA);

  const fromU = new Vector3().subVectors(_b, _a).normalize();
  const toU = new Vector3().subVectors(kneeNew, _a).normalize();
  _q.setFromUnitVectors(fromU, toU);
  if (weight < 1) _q.slerp(new Quaternion(), 1 - weight);
  rotateBoneWorld(upper, _q);

  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const fromL = new Vector3().subVectors(_c, _b).normalize();
  const goal = new Vector3().copy(_a).addScaledVector(dir, dist);
  const toL = goal.sub(_b).normalize();
  _q.setFromUnitVectors(fromL, toL);
  if (weight < 1) _q.slerp(new Quaternion(), 1 - weight);
  rotateBoneWorld(lower, _q);
}

/** Tilt a foot so its sole follows the ground normal (limited). */
export function alignFoot(foot: Bone, groundNormal: Vector3, weight: number, maxAngle = 0.45): void {
  if (weight <= 0) return;
  const up = new Vector3(0, 1, 0);
  const angle = up.angleTo(groundNormal);
  if (angle < 1e-3) return;
  const axis = new Vector3().crossVectors(up, groundNormal).normalize();
  _q.setFromAxisAngle(axis, Math.min(angle, maxAngle) * weight);
  rotateBoneWorld(foot, _q);
}
