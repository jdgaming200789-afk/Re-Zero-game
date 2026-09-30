import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import { DEG } from '../core/math/MathUtil';
import { Physics, Layer, groups, type ColliderOwner } from '../physics/Physics';

/** How far above its target a teleported body starts (it snaps down). */
const TELEPORT_LIFT = 0.02;

export interface MotorConfig {
  radius: number;
  height: number;
  stepHeight: number;
  maxSlopeDeg: number;
  gravity: number;
  terminalVelocity: number;
  membership: number;
  collidesWith: number;
}

export const DEFAULT_MOTOR: MotorConfig = {
  radius: 0.28,
  height: 1.7,
  stepHeight: 0.38,
  maxSlopeDeg: 50,
  gravity: 22,
  terminalVelocity: 32,
  membership: Layer.Player,
  collidesWith: Layer.Environment | Layer.Prop | Layer.CharacterOnly | Layer.Enemy,
};

/**
 * Kinematic capsule movement on top of Rapier's character controller.
 *
 * Gameplay writes a desired planar velocity; the motor handles gravity,
 * steps, slopes, ground snapping and collision. Rendering reads an
 * interpolated position so movement is smooth at any refresh rate even
 * though physics runs at a fixed 60 Hz.
 */
export class CharacterMotor extends Component {
  readonly config: MotorConfig;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private controller!: RAPIER.KinematicCharacterController;

  /** Desired horizontal velocity (m/s), set by the controller/AI each frame. */
  readonly desiredVelocity = new Vector3();
  /** Actual velocity achieved last step. */
  readonly velocity = new Vector3();
  verticalVelocity = 0;
  grounded = true;
  private wasGrounded = true;
  private airborneStartY = 0;
  /** Seconds since last grounded (coyote time for jumps). */
  airTime = 0;
  gravityScale = 1;
  /** When false the motor is frozen (cutscenes, scripted moves drive the transform). */
  simulate = true;

  /** Physics-space feet positions for interpolation. */
  private readonly prevFeet = new Vector3();
  private readonly currFeet = new Vector3();
  readonly feet = new Vector3();

  onLanded?: (fallHeight: number, impactSpeed: number) => void;

  constructor(
    private readonly physics: Physics,
    config: Partial<MotorConfig> = {},
    private readonly owner: ColliderOwner = { kind: 'character' },
  ) {
    super();
    this.config = { ...DEFAULT_MOTOR, ...config };
  }

  get halfHeight(): number {
    return Math.max(0.05, this.config.height / 2 - this.config.radius);
  }

  override onAttach(): void {
    const c = this.config;
    const pos = this.entity.object3D.position;
    const { body, collider } = this.physics.createCharacter(pos, c.radius, this.halfHeight, c.membership, c.collidesWith, {
      ...this.owner,
      entityId: this.entity.id,
    });
    this.body = body;
    this.collider = collider;
    const cc = this.physics.world.createCharacterController(0.03);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.setMaxSlopeClimbAngle(c.maxSlopeDeg * DEG);
    cc.setMinSlopeSlideAngle((c.maxSlopeDeg + 5) * DEG);
    cc.enableAutostep(c.stepHeight, 0.18, false);
    cc.enableSnapToGround(0.35);
    cc.setSlideEnabled(true);
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(70);
    this.controller = cc;
    this.prevFeet.copy(pos);
    this.currFeet.copy(pos);
    this.feet.copy(pos);
  }

  override onDetach(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.removeBody(this.body);
  }

  /** Instantly move (spawns, checkpoints, Return by Death). */
  teleport(feet: Vector3): void {
    // A hair above the target: the controller keeps a skin gap and snaps
    // down; starting inside that gap it can slip through a floor.
    const y = feet.y + this.halfHeight + this.config.radius + TELEPORT_LIFT;
    this.body.setTranslation({ x: feet.x, y, z: feet.z }, true);
    this.body.setNextKinematicTranslation({ x: feet.x, y, z: feet.z });
    // Move the collider now, not at the next step: the controller's next
    // move is computed from the collider, and a stale one (still where the
    // body was) would apply that spot's fall to the new position.
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.prevFeet.copy(feet);
    this.currFeet.copy(feet);
    this.feet.copy(feet);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.entity.object3D.position.copy(feet);
  }

  jump(speed: number): void {
    this.verticalVelocity = speed;
    this.grounded = false;
    this.airTime = 0.2;
  }

  override fixedUpdate(dt: number): void {
    if (!this.simulate) return;
    const c = this.config;
    this.prevFeet.copy(this.currFeet);

    if (this.grounded && this.verticalVelocity <= 0) this.verticalVelocity = -2; // keep contact on slopes
    else this.verticalVelocity = Math.max(-c.terminalVelocity, this.verticalVelocity - c.gravity * this.gravityScale * dt);

    const desired = {
      x: this.desiredVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: this.desiredVelocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired, undefined, groups(Layer.All, c.collidesWith), (col) => !col.isSensor());
    const m = this.controller.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);

    this.velocity.set(m.x / dt, m.y / dt, m.z / dt);
    this.wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();

    // Bumped a ceiling while rising.
    if (this.verticalVelocity > 0 && m.y < desired.y * 0.5) this.verticalVelocity = 0;

    const feetY = next.y - this.halfHeight - c.radius;
    this.currFeet.set(next.x, feetY, next.z);

    if (this.grounded) {
      if (!this.wasGrounded) {
        const fall = this.airborneStartY - feetY;
        this.onLanded?.(fall, -this.verticalVelocity);
      }
      this.airTime = 0;
      this.airborneStartY = feetY;
    } else {
      if (this.wasGrounded) this.airborneStartY = feetY;
      this.airborneStartY = Math.max(this.airborneStartY, feetY);
      this.airTime += dt;
    }
  }

  /** Fixed-step interpolation factor for this render frame (set by the game loop). */
  static alpha = 1;

  /** Interpolate the rendered transform between the last two physics steps. */
  override update(): void {
    if (!this.simulate) return;
    this.feet.lerpVectors(this.prevFeet, this.currFeet, CharacterMotor.alpha);
    this.entity.object3D.position.copy(this.feet);
  }

  /** Current planar speed (m/s). */
  get planarSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Re-sync physics body with the transform (after scripted movement). */
  syncFromTransform(): void {
    this.teleport(this.entity.object3D.position.clone());
  }
}
