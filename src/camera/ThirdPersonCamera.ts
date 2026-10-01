import { Euler, Quaternion, Vector3 } from 'three';
import { angleDelta, clamp, damp, dampAngle, DEG, SmoothDampVec3 } from '../core/math/MathUtil';
import type { Physics } from '../physics/Physics';
import { Masks } from '../physics/Physics';

export interface FollowTarget {
  /** World position of the character's feet. */
  position: Vector3;
  /** Character facing yaw (radians). */
  yaw: number;
  /** Planar speed (m/s), used for auto-recenter and FOV. */
  speed: number;
  sprinting: boolean;
  /** Height of the pivot above the feet (roughly shoulder height). */
  pivotHeight: number;
}

export interface CameraPose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
}

export type FollowProfile = 'exploration' | 'combat' | 'interior' | 'aim';

interface ProfileParams {
  distance: number;
  shoulder: number;
  pivotLift: number;
  fovAdd: number;
  pitchBias: number;
}

const PROFILES: Record<FollowProfile, ProfileParams> = {
  exploration: { distance: 3.4, shoulder: 0.42, pivotLift: 0.0, fovAdd: 0, pitchBias: 0 },
  interior: { distance: 2.7, shoulder: 0.38, pivotLift: -0.05, fovAdd: 2, pitchBias: 0 },
  combat: { distance: 4.6, shoulder: 0.15, pivotLift: 0.15, fovAdd: 4, pitchBias: 4 * DEG },
  aim: { distance: 1.9, shoulder: 0.55, pivotLift: 0.05, fovAdd: -8, pitchBias: 0 },
};

const UP = new Vector3(0, 1, 0);

/**
 * Over-the-shoulder follow camera.
 *
 * - The pivot trails the character with separate horizontal/vertical
 *   smoothing so stairs and landings don't jolt the view.
 * - A sphere cast from the pivot keeps the camera out of walls; it pulls in
 *   instantly and eases back out slowly to avoid pumping.
 * - Lock-on rotates the view to frame both the player and the target.
 * - When the player moves without touching the camera for a while it gently
 *   swings behind them (never while they are actively looking around).
 */
export class ThirdPersonCamera {
  yaw = Math.PI;
  pitch = 12 * DEG;
  private profile: FollowProfile = 'exploration';
  private params: ProfileParams = { ...PROFILES.exploration };
  private readonly pivot = new Vector3();
  private readonly pivotSpring = new SmoothDampVec3();
  private readonly pivotSmoothing = new Vector3(0.06, 0.14, 0.06);
  private currentDistance = 3.4;
  private zoom = 1;
  private shoulderSide = 1;
  private shoulderCurrent = 0.42;
  private lookIdleTime = 0;
  private fovCurrent = 55;
  private initialized = false;

  baseFov = 55;
  minPitch = -55 * DEG;
  maxPitch = 72 * DEG;
  collisionRadius = 0.22;
  autoRecenter = true;
  lockTarget: Vector3 | null = null;
  /** Spring-driven kick along the view axis (+ pulls the camera back). */
  private kickZ = 0;
  private kickV = 0;
  private fovPunch = 0;
  /** Soft framing assist toward a point (an attack's target) while the player isn't steering. */
  private readonly assistPoint = new Vector3();
  private assistTime = 0;

  readonly pose: CameraPose = { position: new Vector3(), quaternion: new Quaternion(), fov: 55 };

  constructor(private readonly physics: Physics) {}

  setProfile(profile: FollowProfile): void {
    this.profile = profile;
  }

  get currentProfile(): FollowProfile {
    return this.profile;
  }

  swapShoulder(): void {
    this.shoulderSide *= -1;
  }

  adjustZoom(delta: number): void {
    this.zoom = clamp(this.zoom + delta, 0.65, 1.45);
  }

  /** Snap behind the character (on spawn, after teleports and cutscenes). */
  snapBehind(target: FollowTarget, pitch = 12 * DEG): void {
    this.yaw = target.yaw + Math.PI;
    this.pitch = pitch;
    this.pivot.copy(target.position).addScaledVector(UP, target.pivotHeight);
    this.pivotSpring.reset();
    this.initialized = false;
  }

  /**
   * Continue from an arbitrary pose (e.g. when a dialogue shot releases
   * control). A pose that looked at him from the front would leave the
   * camera facing him, so beyond `maxOffBehind` it settles behind him instead
   * (the release blend carries the swing).
   */
  adoptPose(position: Vector3, target: FollowTarget, maxOffBehind = 100 * DEG): void {
    const pivot = _v1.copy(target.position).addScaledVector(UP, target.pivotHeight);
    const d = _v2.subVectors(position, pivot);
    const len = d.length();
    if (len < 0.01) return;
    const yaw = Math.atan2(d.x, d.z);
    const behind = target.yaw + Math.PI;
    this.yaw = Math.abs(angleDelta(behind, yaw)) > maxOffBehind ? behind : yaw;
    this.pitch = clamp(Math.asin(clamp(d.y / len, -1, 1)), this.minPitch, this.maxPitch);
  }

  /** Jolt the camera along its view axis (impacts). */
  kick(strength: number): void {
    this.kickV += strength * 9;
  }

  /** Brief FOV change in degrees (negative = punch in). */
  punchFov(deg: number): void {
    if (Math.abs(deg) > Math.abs(this.fovPunch)) this.fovPunch = deg;
  }

  /** For a moment, turn to keep `point` in frame with the character. */
  assist(point: Vector3, seconds = 0.7): void {
    this.assistPoint.copy(point);
    this.assistTime = seconds;
  }

  update(dt: number, target: FollowTarget, look: { x: number; y: number }): CameraPose {
    const p = PROFILES[this.profile];
    // Blend profile parameters so transitions into combat feel continuous.
    this.params.distance = damp(this.params.distance, p.distance, 0.35, dt);
    this.params.shoulder = damp(this.params.shoulder, p.shoulder, 0.3, dt);
    this.params.pivotLift = damp(this.params.pivotLift, p.pivotLift, 0.3, dt);
    this.params.fovAdd = damp(this.params.fovAdd, p.fovAdd, 0.4, dt);
    this.params.pitchBias = damp(this.params.pitchBias, p.pitchBias, 0.5, dt);

    // ---- Rotation input
    const looking = Math.abs(look.x) > 1e-5 || Math.abs(look.y) > 1e-5;
    if (this.lockTarget) {
      const toTarget = _v1.subVectors(this.lockTarget, target.position);
      const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
      const flat = Math.hypot(toTarget.x, toTarget.z);
      const desiredPitch = clamp(Math.atan2(-(toTarget.y - 1.0), Math.max(flat, 1)) + 14 * DEG, -10 * DEG, 40 * DEG);
      this.yaw = dampAngle(this.yaw, desiredYaw, 0.09, dt);
      this.pitch = damp(this.pitch, desiredPitch, 0.2, dt);
    } else {
      this.yaw -= look.x;
      this.pitch += look.y;
      this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);
      if (looking) this.lookIdleTime = 0;
      else this.lookIdleTime += dt;
      // Attack assist: swing round just enough to keep the struck enemy in
      // frame (off-centre, beside the character), never fighting the stick.
      if (this.assistTime > 0) {
        this.assistTime -= dt;
        if (!looking) {
          const to = _v1.subVectors(this.assistPoint, target.position);
          const flat = Math.hypot(to.x, to.z);
          if (flat > 0.5) {
            const towardYaw = Math.atan2(-to.x, -to.z);
            const off = angleDelta(this.yaw, towardYaw);
            // Only correct when it's drifting out of a ~50° cone.
            const limit = 25 * DEG;
            if (Math.abs(off) > limit) this.yaw = dampAngle(this.yaw, towardYaw - Math.sign(off) * limit, 0.18, dt);
          }
        }
      }
      // Gentle recenter behind a moving character.
      if (this.autoRecenter && this.lookIdleTime > 1.6 && target.speed > 1.2) {
        const behind = target.yaw + Math.PI;
        const strength = clamp((this.lookIdleTime - 1.6) * 0.5, 0, 1) * clamp(target.speed / 5, 0.2, 1);
        this.yaw = dampAngle(this.yaw, behind, 1.4 / Math.max(strength, 0.05), dt);
        this.pitch = damp(this.pitch, 10 * DEG + this.params.pitchBias, 2.5, dt);
      }
    }

    // ---- Pivot follow (locked on: drift toward the target so both stay framed)
    const desiredPivot = _v2.copy(target.position).addScaledVector(UP, target.pivotHeight + this.params.pivotLift);
    let lockPull = 0;
    if (this.lockTarget) {
      const sep = Math.hypot(this.lockTarget.x - target.position.x, this.lockTarget.z - target.position.z);
      const w = clamp(sep / 14, 0, 0.3);
      desiredPivot.x += (this.lockTarget.x - target.position.x) * w;
      desiredPivot.z += (this.lockTarget.z - target.position.z) * w;
      lockPull = clamp((sep - 3) * 0.12, 0, 1.4);
    }
    if (!this.initialized) {
      this.pivot.copy(desiredPivot);
      this.currentDistance = this.params.distance;
      this.initialized = true;
    } else {
      this.pivotSpring.step(this.pivot, desiredPivot, this.pivotSmoothing, dt);
    }

    // ---- Orientation
    const q = this.pose.quaternion.setFromEuler(_euler.set(-this.pitch, this.yaw, 0, 'YXZ'));
    const right = _right.set(1, 0, 0).applyQuaternion(q);
    const back = _back.set(0, 0, 1).applyQuaternion(q);

    // Shoulder offset, shortened if a wall is beside the character.
    const desiredShoulder = this.params.shoulder * this.shoulderSide;
    const sideDir = _side.copy(right).multiplyScalar(Math.sign(desiredShoulder) || 1);
    const sideHit = this.physics.sphereCast(this.pivot, sideDir, this.collisionRadius, Math.abs(desiredShoulder) + 0.05, Masks.camera);
    const allowedShoulder = sideHit !== null ? Math.max(0, sideHit - 0.05) * Math.sign(desiredShoulder) : desiredShoulder;
    this.shoulderCurrent = damp(this.shoulderCurrent, allowedShoulder, sideHit !== null ? 0.03 : 0.25, dt);
    const shoulderPivot = _v3.copy(this.pivot).addScaledVector(right, this.shoulderCurrent);

    // ---- Collision along the boom
    const desiredDistance = (this.params.distance + lockPull) * this.zoom * (target.sprinting ? 1.1 : 1);
    const hitDist = this.physics.sphereCast(shoulderPivot, back, this.collisionRadius, desiredDistance, Masks.camera);
    const allowed = hitDist !== null ? Math.max(0.35, hitDist - 0.04) : desiredDistance;
    if (allowed < this.currentDistance) this.currentDistance = damp(this.currentDistance, allowed, 0.02, dt);
    else this.currentDistance = damp(this.currentDistance, allowed, 0.32, dt);

    // Impact kick: a stiff, critically damped spring (never past the boom's collision limit).
    const k = 260;
    this.kickV += (-k * this.kickZ - 2 * Math.sqrt(k) * this.kickV) * dt;
    this.kickZ += this.kickV * dt;
    const kick = clamp(this.kickZ, -0.4, Math.max(0, allowed - this.currentDistance));
    this.pose.position.copy(shoulderPivot).addScaledVector(back, this.currentDistance + kick);

    // ---- FOV: widen slightly when sprinting, when pulled in close (feels less claustrophobic).
    const closeness = clamp(1 - this.currentDistance / desiredDistance, 0, 1);
    const fovTarget = this.baseFov + this.params.fovAdd + (target.sprinting ? 6 : 0) + closeness * 5;
    this.fovCurrent = damp(this.fovCurrent, fovTarget, 0.35, dt);
    this.fovPunch = damp(this.fovPunch, 0, 0.08, dt);
    this.pose.fov = this.fovCurrent + this.fovPunch;
    return this.pose;
  }

  /** Forward direction on the ground plane (for camera-relative movement). */
  groundForward(out: Vector3): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  groundRight(out: Vector3): Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _right = new Vector3();
const _back = new Vector3();
const _side = new Vector3();
const _euler = new Euler();
