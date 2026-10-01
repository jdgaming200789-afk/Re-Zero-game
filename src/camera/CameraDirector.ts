import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Easing, type EasingName } from '../core/math/MathUtil';
import { CameraShake } from './CameraShake';
import type { CameraPose, FollowTarget, ThirdPersonCamera } from './ThirdPersonCamera';

/** An authored camera placement for dialogue and cinematics. */
export interface CameraShot {
  position: Vector3;
  /** Either a look-at point or an explicit rotation. */
  lookAt?: Vector3;
  quaternion?: Quaternion;
  fov: number;
  /** Optional depth-of-field focus (distance from camera). */
  focusDistance?: number;
  focusRange?: number;
  /** Slow drift applied while the shot holds (dolly/push-in), metres/second in camera space. */
  drift?: Vector3;
  /**
   * The drift eases out over about this many seconds (the move is bounded:
   * a line left on screen must never carry the camera off its subjects).
   */
  driftTime?: number;
  /**
   * Keep a moving subject framed: called every frame for the point the
   * shot was composed on (a head). The camera pans to follow it, smoothed
   * and limited to a small correction like an operator's hand.
   */
  track?: () => Vector3 | null;
  /** How far tracking may pan from the composed look-at (m; default 0.6). */
  trackLimit?: number;
  /** Tracking smoothing time constant (s; default 0.35). */
  trackLag?: number;
  /** Handheld sway amount for tension. */
  sway?: number;
}

interface Blend {
  from: CameraPose;
  to: 'follow' | CameraShot;
  duration: number;
  t: number;
  ease: (t: number) => number;
}

/**
 * Decides where the rendered camera is each frame.
 *
 * Gameplay uses the follow camera. Dialogue and cinematics push authored
 * shots (cuts or eased blends), and hand control back with a blend so the
 * transition into gameplay is seamless.
 */
export class CameraDirector {
  readonly shake = new CameraShake();
  private mode: 'follow' | 'shot' = 'follow';
  private shot: CameraShot | null = null;
  private shotTime = 0;
  private blend: Blend | null = null;
  private readonly lastPose: CameraPose = { position: new Vector3(), quaternion: new Quaternion(), fov: 55 };
  private readonly shakeOffset = new Vector3();
  /** Smoothed tracking correction for the current shot's look-at. */
  private readonly trackOffset = new Vector3();
  private readonly trackBase = new Vector3();
  private readonly shakeRot = new Euler();
  onDepthOfField?: (enabled: boolean, distance: number, range: number) => void;

  constructor(
    readonly camera: PerspectiveCamera,
    readonly follow: ThirdPersonCamera,
  ) {}

  get isFollowing(): boolean {
    return this.mode === 'follow' && this.blend === null;
  }

  get currentShot(): CameraShot | null {
    return this.shot;
  }

  /** Hard cut to a shot. */
  cut(shot: CameraShot): void {
    this.mode = 'shot';
    this.shot = shot;
    this.shotTime = 0;
    this.beginTracking(shot);
    this.blend = null;
    this.shake.sway = shot.sway ?? 0;
    this.applyDof(shot);
  }

  /** Eased move from the current view to a shot. */
  blendTo(shot: CameraShot, duration: number, ease: EasingName = 'inOutCubic'): void {
    this.blend = { from: clonePose(this.lastPose), to: shot, duration: Math.max(0.01, duration), t: 0, ease: Easing[ease] };
    this.mode = 'shot';
    this.shot = shot;
    this.shotTime = 0;
    this.beginTracking(shot);
    this.shake.sway = shot.sway ?? 0;
    this.applyDof(shot);
  }

  /** Return to the follow camera, optionally blending. */
  release(duration = 0.6, target?: FollowTarget): void {
    if (target && this.mode === 'shot') this.follow.adoptPose(this.lastPose.position, target);
    this.shake.sway = 0;
    this.onDepthOfField?.(false, 0, 0);
    if (duration <= 0) {
      this.mode = 'follow';
      this.shot = null;
      this.blend = null;
      return;
    }
    this.blend = { from: clonePose(this.lastPose), to: 'follow', duration, t: 0, ease: Easing.inOutCubic };
    this.mode = 'follow';
    this.shot = null;
  }

  private beginTracking(shot: CameraShot): void {
    this.trackOffset.set(0, 0, 0);
    const p = shot.track?.();
    if (p) this.trackBase.copy(p);
  }

  /** Follow the tracked subject: smoothed, and never more than a small correction. */
  private updateTracking(dt: number): void {
    const shot = this.shot;
    if (!shot?.track || !shot.lookAt) return;
    const p = shot.track();
    if (!p) return;
    _t.subVectors(p, this.trackBase);
    const max = shot.trackLimit ?? 0.6;
    if (_t.length() > max) _t.setLength(max);
    const k = 1 - Math.exp(-dt / (shot.trackLag ?? 0.35));
    this.trackOffset.lerp(_t, k);
  }

  private applyDof(shot: CameraShot): void {
    if (shot.focusDistance !== undefined) this.onDepthOfField?.(true, shot.focusDistance, shot.focusRange ?? 1.5);
    else this.onDepthOfField?.(false, 0, 0);
  }

  update(dt: number, unscaledDt: number, target: FollowTarget | null, look: { x: number; y: number }): void {
    let pose: CameraPose;
    const followPose = target ? this.follow.update(dt, target, this.mode === 'follow' ? look : { x: 0, y: 0 }) : null;

    if (this.mode === 'shot' && this.shot) {
      this.shotTime += unscaledDt;
      this.updateTracking(unscaledDt);
      pose = shotPose(this.shot, this.shotTime, _shotPose, this.trackOffset);
    } else if (followPose) {
      pose = followPose;
    } else {
      pose = this.lastPose;
    }

    if (this.blend) {
      this.blend.t = Math.min(1, this.blend.t + unscaledDt / this.blend.duration);
      const k = this.blend.ease(this.blend.t);
      _blended.position.lerpVectors(this.blend.from.position, pose.position, k);
      _blended.quaternion.slerpQuaternions(this.blend.from.quaternion, pose.quaternion, k);
      _blended.fov = this.blend.from.fov + (pose.fov - this.blend.from.fov) * k;
      pose = _blended;
      if (this.blend.t >= 1) this.blend = null;
    }

    this.lastPose.position.copy(pose.position);
    this.lastPose.quaternion.copy(pose.quaternion);
    this.lastPose.fov = pose.fov;

    // Apply with shake on top (shake never feeds back into the stored pose).
    this.shake.update(unscaledDt, this.shakeOffset, this.shakeRot);
    this.camera.position.copy(pose.position).add(this.shakeOffset.applyQuaternion(pose.quaternion));
    this.camera.quaternion.copy(pose.quaternion).multiply(_q.setFromEuler(this.shakeRot));
    if (Math.abs(this.camera.fov - pose.fov) > 0.01) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  get pose(): Readonly<CameraPose> {
    return this.lastPose;
  }
}

const _q = new Quaternion();
const _m = new Matrix4();
const _shotPose: CameraPose = { position: new Vector3(), quaternion: new Quaternion(), fov: 50 };
const _blended: CameraPose = { position: new Vector3(), quaternion: new Quaternion(), fov: 50 };
const _up = new Vector3(0, 1, 0);

function shotPose(shot: CameraShot, t: number, out: CameraPose, track?: Vector3): CameraPose {
  out.position.copy(shot.position);
  if (shot.quaternion) out.quaternion.copy(shot.quaternion);
  else if (shot.lookAt) {
    const at = track ? _la.copy(shot.lookAt).add(track) : shot.lookAt;
    out.quaternion.setFromRotationMatrix(_m.lookAt(shot.position, at, _up));
  }
  if (shot.drift) {
    // Linear at first, easing out: the whole move is bounded by drift * T.
    const T = shot.driftTime ?? 4;
    const travelled = T * (1 - Math.exp(-t / T));
    out.position.add(_v.copy(shot.drift).multiplyScalar(travelled).applyQuaternion(out.quaternion));
  }
  out.fov = shot.fov;
  return out;
}
const _v = new Vector3();
const _la = new Vector3();
const _t = new Vector3();

function clonePose(p: CameraPose): CameraPose {
  return { position: p.position.clone(), quaternion: p.quaternion.clone(), fov: p.fov };
}

/** Helper to build a shot looking from `from` at `at`. */
export function shotLookingAt(from: Vector3, at: Vector3, fov = 40, extras: Partial<CameraShot> = {}): CameraShot {
  return { position: from.clone(), lookAt: at.clone(), fov, ...extras };
}
