import { Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import { angleDelta, clamp, damp, DEG, moveTowards, moveTowardsAngle } from '../core/math/MathUtil';
import type { CharacterMotor } from '../characters/CharacterMotor';
import { idleLocomotion, type CharacterVisual, type LocomotionState } from '../characters/CharacterVisual';
import type { GameContext } from '../game/GameContext';
import type { FollowTarget } from '../camera/ThirdPersonCamera';

export interface MovementProfile {
  walkSpeed: number;
  runSpeed: number;
  sprintSpeed: number;
  acceleration: number;
  deceleration: number;
  /** Degrees per second at low speed / at sprint. */
  turnRateSlow: number;
  turnRateFast: number;
  jumpSpeed: number;
  maxStamina: number;
  sprintCost: number;
  staminaRegen: number;
}

/** Subaru: an ordinary, reasonably fit teenager — not an action hero. */
export const SUBARU_MOVEMENT: MovementProfile = {
  walkSpeed: 1.45,
  runSpeed: 3.8,
  sprintSpeed: 5.9,
  acceleration: 11,
  deceleration: 14,
  turnRateSlow: 720,
  turnRateFast: 330,
  jumpSpeed: 4.6,
  maxStamina: 100,
  sprintCost: 15,
  staminaRegen: 24,
};

interface ScriptedMove {
  target: Vector3;
  speed: number;
  tolerance: number;
  resolve: (arrived: boolean) => void;
  timeout: number;
}

/**
 * Turns player intent into character movement.
 *
 * Movement is camera-relative. The character accelerates along its facing
 * and turns toward the input direction at a speed-dependent rate, which
 * produces natural arcs instead of instant strafing. In lock-on the
 * character strafes around the target instead.
 */
export class PlayerController extends Component {
  readonly loco: LocomotionState = idleLocomotion();
  readonly followTarget: FollowTarget;
  yaw = 0;
  stamina: number;
  exhausted = false;
  walkToggled = false;
  private sprintToggled = false;
  private staminaDelay = 0;
  private readonly planarVelocity = new Vector3();
  private readonly locks = new Set<string>();
  private scripted: ScriptedMove | null = null;
  private faceTarget: { yaw: number; resolve: () => void; rate: number } | null = null;
  private lastYaw = 0;
  private jumpBuffered = 0;
  /** Target to strafe around in lock-on (set by combat). */
  strafeTarget: Vector3 | null = null;
  /** Environmental posture: 0 calm .. 1 frightened (set by zones/story). */
  tension = 0;
  injured = 0;
  /** When true, Space dodges instead of jumping (combat). */
  combatMode = false;
  onDodgeRequested?: () => void;

  constructor(
    private readonly game: GameContext,
    readonly characterId: string,
    readonly motor: CharacterMotor,
    public visual: CharacterVisual,
    readonly movement: MovementProfile = SUBARU_MOVEMENT,
  ) {
    super();
    this.stamina = movement.maxStamina;
    this.followTarget = { position: new Vector3(), yaw: 0, speed: 0, sprinting: false, pivotHeight: 1.45 };
  }

  override onAttach(): void {
    this.entity.object3D.add(this.visual.root);
    this.motor.onLanded = (fall, impact) => {
      if (fall > 0.6) this.game.events.emit('player:landed', { fallHeight: fall });
      if (fall > 2.8) {
        void this.visual.play('landHard', { fadeIn: 0.05 });
        this.lock('landing');
        this.game.camera.shake.add(Math.min(0.5, impact * 0.03));
        void this.game.scheduler.wait(0.42).then(() => this.unlock('landing'));
      } else if (fall > 0.9) {
        void this.visual.play('landSoft', { fadeIn: 0.05 });
      }
    };
  }

  // ------------------------------------------------------------------ control
  lock(reason: string): void {
    this.locks.add(reason);
  }
  unlock(reason: string): void {
    this.locks.delete(reason);
  }
  isLocked(reason?: string): boolean {
    return reason ? this.locks.has(reason) : this.locks.size > 0;
  }
  get hasControl(): boolean {
    return this.locks.size === 0 && this.scripted === null;
  }

  /** Walk/run to a point under script control (interactions, cutscenes). */
  moveTo(target: Vector3, speed = this.movement.walkSpeed, tolerance = 0.12, timeout = 6): Promise<boolean> {
    this.scripted?.resolve(false);
    return new Promise((resolve) => {
      this.scripted = { target: target.clone(), speed, tolerance, resolve, timeout };
    });
  }

  /** Turn to face a world point. */
  faceTowards(point: Vector3, rate = 540): Promise<void> {
    const pos = this.entity.object3D.position;
    const yaw = Math.atan2(point.x - pos.x, point.z - pos.z);
    return this.faceYaw(yaw, rate);
  }

  faceYaw(yaw: number, rate = 540): Promise<void> {
    this.faceTarget?.resolve();
    return new Promise((resolve) => {
      this.faceTarget = { yaw, resolve, rate };
    });
  }

  /** Snap the character to a spawn/checkpoint transform. */
  placeAt(feet: Vector3, yaw: number): void {
    this.motor.teleport(feet);
    this.yaw = yaw;
    this.lastYaw = yaw;
    this.planarVelocity.set(0, 0, 0);
    this.scripted?.resolve(false);
    this.scripted = null;
    this.entity.object3D.rotation.set(0, yaw, 0);
    this.syncFollowTarget(0);
  }

  // ------------------------------------------------------------------ frame
  override update(dt: number): void {
    const input = this.game.input;
    const mv = this.movement;
    const desired = _desired.set(0, 0, 0);
    let wantSprint = false;
    let strafing = false;

    if (this.scripted) {
      const s = this.scripted;
      s.timeout -= dt;
      const pos = this.entity.object3D.position;
      const to = _to.set(s.target.x - pos.x, 0, s.target.z - pos.z);
      const dist = to.length();
      if (dist <= s.tolerance || s.timeout <= 0) {
        this.scripted = null;
        s.resolve(dist <= s.tolerance + 0.05);
      } else {
        // Ease into the destination instead of stopping dead.
        const speed = Math.min(s.speed, dist * 3.2 + 0.3);
        desired.copy(to.divideScalar(dist)).multiplyScalar(speed);
      }
    } else if (this.hasControl && this.game.mode !== 'dialogue' && this.game.mode !== 'cinematic' && this.game.mode !== 'menu') {
      // Camera-relative input
      const f = this.game.camera.follow.groundForward(_fwd);
      const r = this.game.camera.follow.groundRight(_right);
      const m = input.move;
      desired.copy(f).multiplyScalar(m.y).addScaledVector(r, m.x);
      const mag = Math.min(1, desired.length());

      if (input.pressed('walkToggle')) this.walkToggled = !this.walkToggled;
      if (this.game.settings.gameplay.toggleSprint) {
        if (input.pressed('sprint')) this.sprintToggled = !this.sprintToggled;
        if (mag < 0.1) this.sprintToggled = false;
        wantSprint = this.sprintToggled;
      } else {
        wantSprint = input.held('sprint');
      }
      wantSprint = wantSprint && !this.exhausted && mag > 0.5 && this.motor.grounded;

      let top = this.walkToggled ? mv.walkSpeed : mv.runSpeed;
      if (wantSprint) top = mv.sprintSpeed;
      // Winded / injured Subaru can't keep a full run.
      top *= 1 - 0.25 * Math.max(this.exhaustionLevel, this.injured);
      // Analog: small deflection walks.
      const speed = mag < 0.55 ? mv.walkSpeed * (mag / 0.55) : top * mag;
      if (mag > 1e-3) desired.normalize().multiplyScalar(speed);

      // Jump / dodge on the contextual button.
      if (input.pressed('jump')) {
        if (this.combatMode) {
          input.consume('jump');
          this.onDodgeRequested?.();
        } else {
          this.jumpBuffered = 0.15;
        }
      }
      if (input.pressed('dodge')) this.onDodgeRequested?.();
      if (input.pressed('shoulderSwap')) this.game.camera.follow.swapShoulder();
      if (input.pressed('zoomIn')) this.game.camera.follow.adjustZoom(-0.1);
      if (input.pressed('zoomOut')) this.game.camera.follow.adjustZoom(0.1);

      strafing = this.strafeTarget !== null;
    }

    // ---- Jump with buffering and coyote time
    if (this.jumpBuffered > 0) {
      this.jumpBuffered -= dt;
      if (this.motor.airTime < 0.12 && this.motor.verticalVelocity <= 0.1) {
        this.motor.jump(mv.jumpSpeed);
        this.jumpBuffered = 0;
        void this.visual.play('jump', { fadeIn: 0.05 });
      }
    }

    // ---- Facing and velocity
    const desiredSpeed = desired.length();
    const currentSpeed = this.planarVelocity.length();
    const grounded = this.motor.grounded;
    const control = grounded ? 1 : 0.35;

    if (strafing && this.strafeTarget) {
      const pos = this.entity.object3D.position;
      const targetYaw = Math.atan2(this.strafeTarget.x - pos.x, this.strafeTarget.z - pos.z);
      this.yaw = moveTowardsAngle(this.yaw, targetYaw, 600 * DEG * dt);
      // Strafe: velocity follows input directly.
      const accel = (desiredSpeed > currentSpeed ? mv.acceleration : mv.deceleration) * control;
      this.planarVelocity.x = moveTowards(this.planarVelocity.x, desired.x, accel * dt);
      this.planarVelocity.z = moveTowards(this.planarVelocity.z, desired.z, accel * dt);
    } else {
      if (desiredSpeed > 0.05) {
        const targetYaw = Math.atan2(desired.x, desired.z);
        const speedT = clamp(currentSpeed / mv.sprintSpeed, 0, 1);
        const rate = (mv.turnRateSlow + (mv.turnRateFast - mv.turnRateSlow) * speedT) * DEG * (grounded ? 1 : 0.4);
        const delta = Math.abs(angleDelta(this.yaw, targetYaw));
        this.yaw = moveTowardsAngle(this.yaw, targetYaw, rate * dt);
        // Sharp reversal at speed: brake hard (reads as a plant-and-turn).
        const alignment = Math.cos(Math.min(delta, Math.PI));
        const effectiveSpeed = desiredSpeed * clamp(alignment * 0.8 + 0.2, 0.05, 1);
        const accel = (effectiveSpeed > currentSpeed ? mv.acceleration : mv.deceleration) * control;
        const newSpeed = moveTowards(currentSpeed, effectiveSpeed, accel * dt);
        this.planarVelocity.set(Math.sin(this.yaw) * newSpeed, 0, Math.cos(this.yaw) * newSpeed);
      } else {
        const newSpeed = moveTowards(currentSpeed, 0, mv.deceleration * control * dt);
        if (currentSpeed > 1e-4) this.planarVelocity.multiplyScalar(newSpeed / currentSpeed);
        else this.planarVelocity.set(0, 0, 0);
      }
    }

    // Scripted facing (interactions)
    if (this.faceTarget) {
      this.yaw = moveTowardsAngle(this.yaw, this.faceTarget.yaw, this.faceTarget.rate * DEG * dt);
      if (Math.abs(angleDelta(this.yaw, this.faceTarget.yaw)) < 0.02) {
        this.faceTarget.resolve();
        this.faceTarget = null;
      }
    }

    this.motor.desiredVelocity.copy(this.planarVelocity);

    // ---- Stamina
    const sprinting = wantSprint && currentSpeed > mv.runSpeed * 0.9;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - mv.sprintCost * dt);
      this.staminaDelay = 0.9;
      if (this.stamina <= 0) this.exhausted = true;
    } else if (this.staminaDelay > 0) {
      this.staminaDelay -= dt;
    } else {
      this.stamina = Math.min(mv.maxStamina, this.stamina + mv.staminaRegen * dt * (currentSpeed > 0.5 ? 0.6 : 1));
    }
    if (this.exhausted && this.stamina >= mv.maxStamina * 0.35) this.exhausted = false;

    // ---- Locomotion state for animation
    const yawRate = angleDelta(this.lastYaw, this.yaw) / Math.max(dt, 1e-4);
    this.lastYaw = this.yaw;
    const l = this.loco;
    l.speed = this.motor.planarSpeed > 0.02 ? Math.min(this.motor.planarSpeed, this.planarVelocity.length() + 0.2) : 0;
    const localFwd = Math.cos(this.yaw) * this.planarVelocity.z + Math.sin(this.yaw) * this.planarVelocity.x;
    const localRight = Math.cos(this.yaw) * this.planarVelocity.x - Math.sin(this.yaw) * this.planarVelocity.z;
    const len = Math.hypot(localFwd, localRight);
    l.moveLocalZ = len > 0.05 ? localFwd / len : 0;
    l.moveLocalX = len > 0.05 ? localRight / len : 0;
    l.grounded = grounded;
    l.verticalVelocity = this.motor.verticalVelocity;
    l.turnRate = damp(l.turnRate, yawRate, 0.08, dt);
    l.sprinting = sprinting;
    l.exhaustion = damp(l.exhaustion, this.exhaustionLevel, 0.8, dt);
    l.tension = damp(l.tension, this.tension, 1.2, dt);
    this.visual.update(dt, l);
    this.syncFollowTarget(dt);
  }

  /** 0 fresh .. 1 spent (drives heavy breathing and slumped posture). */
  get exhaustionLevel(): number {
    const s = this.stamina / this.movement.maxStamina;
    return this.exhausted ? 1 : clamp((0.45 - s) / 0.45, 0, 1);
  }

  override lateUpdate(): void {
    this.entity.object3D.rotation.set(0, this.yaw, 0);
  }

  private syncFollowTarget(_dt: number): void {
    const t = this.followTarget;
    t.position.copy(this.entity.object3D.position);
    t.yaw = this.yaw;
    t.speed = this.planarVelocity.length();
    t.sprinting = this.loco.sprinting;
  }
}

const _desired = new Vector3();
const _to = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
