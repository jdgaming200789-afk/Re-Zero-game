import type { Object3D, Quaternion, Vector3 } from 'three';

/** Locomotion parameters the animation layer derives its gait from. */
export interface LocomotionState {
  /** Planar speed, m/s. */
  speed: number;
  /** Local-space movement direction relative to facing (x right, z forward), normalised or zero. */
  moveLocalX: number;
  moveLocalZ: number;
  grounded: boolean;
  verticalVelocity: number;
  /** Signed yaw rate, rad/s (for leaning into turns). */
  turnRate: number;
  sprinting: boolean;
  /** 0..1: how winded the character is (stamina / injuries). */
  exhaustion: number;
  /** 0..1: guard stance / combat readiness. */
  combatReady: number;
  /** 0..1: fear/tension posture blend. */
  tension: number;
}

export function idleLocomotion(): LocomotionState {
  return {
    speed: 0,
    moveLocalX: 0,
    moveLocalZ: 0,
    grounded: true,
    verticalVelocity: 0,
    turnRate: 0,
    sprinting: false,
    exhaustion: 0,
    combatReady: 0,
    tension: 0,
  };
}

export interface PlayActionOptions {
  speed?: number;
  /** Called at the action's contact/impact moment. */
  onContact?: () => void;
  /** Blend-in seconds. */
  fadeIn?: number;
  fadeOut?: number;
  /** Mirror left/right. */
  mirror?: boolean;
  /** Stay on the final pose until stopAction() (knock-outs, deaths). */
  holdEnd?: boolean;
}

/**
 * Everything gameplay needs from a character's visual representation.
 * Implemented by the procedural anime characters; can equally be
 * implemented by an imported rigged model with authored clips.
 */
export interface CharacterVisual {
  readonly root: Object3D;
  /** Eye height above feet, metres. */
  readonly eyeHeight: number;
  update(dt: number, loco: LocomotionState): void;
  /** Play a named action clip (interactions, attacks, reactions). */
  play(action: string, opts?: PlayActionOptions): Promise<void>;
  /** Stop any action and return to locomotion. */
  stopAction(): void;
  /** Track a point with head/eyes/chest (null to release). */
  lookAt(target: Vector3 | null, weight?: number): void;
  setExpression(expression: string, intensity?: number, holdSeconds?: number): void;
  /** Mouth movement driver for dialogue (0..1 openness or viseme id). */
  setSpeaking(speaking: boolean): void;
  /** Parent an object to a bone socket (hand props: swords, lanterns). */
  attach?(obj: Object3D, socket: string, restRotation?: Quaternion, offsetAlongBone?: number): void;
  /** Show/hide authored mesh parts by name prefix (sheathed sword, cloak). */
  setPartVisible?(prefix: string, visible: boolean): void;
  /** Partially dissolve (e.g. while standing between the camera and the player). */
  setOccluding?(occluding: boolean): void;
  /** World position of a named socket (hand_R, head, chest...). */
  socketPosition(name: string, out: Vector3): Vector3;
  /** Brief white-hot flash when struck (0..1 strength). */
  hitFlash?(strength?: number): void;
  dispose(): void;
}
