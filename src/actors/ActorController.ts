import { Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import { angleDelta, clamp, damp, DEG, moveTowards, moveTowardsAngle } from '../core/math/MathUtil';
import type { CharacterMotor } from '../characters/CharacterMotor';
import { idleLocomotion, type CharacterVisual, type LocomotionState } from '../characters/CharacterVisual';
import type { ActorDefinition } from '../data/actors';
import type { GameContext } from '../game/GameContext';
import { Masks } from '../physics/Physics';

export interface ActorMovement {
  walkSpeed: number;
  runSpeed: number;
  sprintSpeed: number;
  acceleration: number;
  deceleration: number;
  /** Degrees per second. */
  turnRate: number;
}

export const DEFAULT_ACTOR_MOVEMENT: ActorMovement = {
  walkSpeed: 1.4,
  runSpeed: 3.9,
  // A touch faster than Subaru's sprint so companions can always catch up.
  sprintSpeed: 6.3,
  acceleration: 9,
  deceleration: 12,
  turnRate: 420,
};

export type SpeedName = 'walk' | 'run' | 'sprint';

/**
 * Decides what an actor wants each frame (follow the player, patrol, wait
 * for a cue). Brains only write steering intent; the controller owns
 * movement, facing and animation.
 */
export interface ActorBrain {
  update(actor: ActorController, dt: number): void;
  /** Called when the actor is placed or teleported (reset trails, timers). */
  onPlaced?(actor: ActorController): void;
}

interface MoveGoal {
  target: Vector3;
  speed: number;
  tolerance: number;
  timeout: number;
  resolve: (arrived: boolean) => void;
}

/**
 * Drives a non-player character: party members, story NPCs, cinematic
 * extras. Movement goes through a CharacterMotor when the actor has one
 * (collides with the world), or is ground-snapped by raycast when it
 * doesn't (seated/static characters, characters in a crowd).
 */
export class ActorController extends Component {
  readonly loco: LocomotionState = idleLocomotion();
  yaw = 0;
  brain: ActorBrain | null = null;
  /** Desired planar velocity from the brain (ignored while a moveTo runs). */
  readonly steer = new Vector3();
  /** When set, the actor keeps turning towards this point while idle. */
  faceTarget: Vector3 | null = null;
  tension = 0;
  /** Planar velocity actually applied this frame. */
  readonly velocity = new Vector3();
  private goal: MoveGoal | null = null;
  private faceGoal: { yaw: number; rate: number; resolve: () => void } | null = null;
  private lastYaw = 0;
  private readonly lastPos = new Vector3();
  private readonly raycastFrom = new Vector3();
  /** Seconds the actor has wanted to move without making progress. */
  stuckTime = 0;
  private locks = 0;

  constructor(
    private readonly game: GameContext,
    readonly def: ActorDefinition,
    public visual: CharacterVisual,
    readonly motor: CharacterMotor | null,
    readonly movement: ActorMovement = DEFAULT_ACTOR_MOVEMENT,
  ) {
    super();
  }

  get id(): string {
    return this.def.id;
  }

  get position(): Vector3 {
    return this.entity.object3D.position;
  }

  override onAttach(): void {
    this.entity.object3D.add(this.visual.root);
  }

  override onDetach(): void {
    this.goal?.resolve(false);
    this.goal = null;
    this.faceGoal?.resolve();
    this.faceGoal = null;
    this.visual.dispose();
  }

  speedOf(s: SpeedName | number): number {
    if (typeof s === 'number') return s;
    return s === 'walk' ? this.movement.walkSpeed : s === 'run' ? this.movement.runSpeed : this.movement.sprintSpeed;
  }

  /** Walk/run to a point under script control. Resolves true on arrival. */
  moveTo(target: Vector3, speed: SpeedName | number = 'walk', tolerance = 0.2, timeout = 12): Promise<boolean> {
    this.goal?.resolve(false);
    return new Promise((resolve) => {
      this.goal = { target: target.clone(), speed: this.speedOf(speed), tolerance, timeout, resolve };
    });
  }

  get hasMoveGoal(): boolean {
    return this.goal !== null;
  }

  stop(): void {
    this.goal?.resolve(false);
    this.goal = null;
    this.steer.set(0, 0, 0);
  }

  faceTowards(point: Vector3, rate = 360): Promise<void> {
    const p = this.position;
    return this.faceYaw(Math.atan2(point.x - p.x, point.z - p.z), rate);
  }

  faceYaw(yaw: number, rate = 360): Promise<void> {
    this.faceGoal?.resolve();
    return new Promise((resolve) => {
      this.faceGoal = { yaw, rate, resolve };
    });
  }

  /** Suspend brain-driven movement (dialogue, cutscenes). Counted. */
  hold(): void {
    this.locks++;
  }
  release(): void {
    this.locks = Math.max(0, this.locks - 1);
  }
  get held(): boolean {
    return this.locks > 0;
  }

  placeAt(feet: Vector3, yaw: number): void {
    this.stop();
    if (this.motor) this.motor.teleport(feet);
    else {
      this.position.copy(feet);
      this.snapToGround(true);
    }
    this.yaw = yaw;
    this.lastYaw = yaw;
    this.velocity.set(0, 0, 0);
    this.lastPos.copy(this.position);
    this.stuckTime = 0;
    this.entity.object3D.rotation.set(0, yaw, 0);
    this.brain?.onPlaced?.(this);
  }

  lookAt(target: Vector3 | null, weight = 1): void {
    this.visual.lookAt(target, weight);
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    const mv = this.movement;
    if (!this.held) this.brain?.update(this, dt);

    // ---- Desired velocity: scripted goal first, then brain steering.
    const desired = _desired.set(0, 0, 0);
    if (this.goal) {
      const g = this.goal;
      g.timeout -= dt;
      const to = _to.subVectors(g.target, this.position).setY(0);
      const dist = to.length();
      if (dist <= g.tolerance || g.timeout <= 0) {
        this.goal = null;
        g.resolve(dist <= g.tolerance);
      } else {
        // Arrive: ease off over the last stretch so feet don't skid.
        const brake = clamp(dist / Math.max(0.6, g.speed * 0.45), 0.25, 1);
        desired.copy(to).multiplyScalar((g.speed * brake) / dist);
      }
    } else if (!this.held) {
      desired.copy(this.steer).setY(0);
    }

    // ---- Accelerate towards it, turning to face the travel direction.
    const desiredSpeed = desired.length();
    const currentSpeed = this.velocity.length();
    if (desiredSpeed > 0.05) {
      const targetYaw = Math.atan2(desired.x, desired.z);
      const delta = Math.abs(angleDelta(this.yaw, targetYaw));
      this.yaw = moveTowardsAngle(this.yaw, targetYaw, mv.turnRate * DEG * dt);
      const align = clamp(Math.cos(Math.min(delta, Math.PI)) * 0.8 + 0.2, 0.05, 1);
      const want = desiredSpeed * align;
      const accel = want > currentSpeed ? mv.acceleration : mv.deceleration;
      const speed = moveTowards(currentSpeed, want, accel * dt);
      this.velocity.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    } else {
      const speed = moveTowards(currentSpeed, 0, mv.deceleration * dt);
      if (currentSpeed > 1e-4) this.velocity.multiplyScalar(speed / currentSpeed);
      else this.velocity.set(0, 0, 0);
      const face = this.faceGoal ?? (this.faceTarget ? { yaw: this.yawTo(this.faceTarget), rate: 200 } : null);
      if (face) {
        this.yaw = moveTowardsAngle(this.yaw, face.yaw, face.rate * DEG * dt);
        if (this.faceGoal && Math.abs(angleDelta(this.yaw, this.faceGoal.yaw)) < 0.03) {
          this.faceGoal.resolve();
          this.faceGoal = null;
        }
      }
    }

    // ---- Move
    if (this.motor) {
      this.motor.desiredVelocity.copy(this.velocity);
    } else {
      this.position.addScaledVector(this.velocity, dt);
      if (currentSpeed > 0.01) this.snapToGround(false);
    }

    // ---- Progress tracking (brains use it to detect being stuck)
    const moved = _to.subVectors(this.position, this.lastPos).setY(0).length();
    this.lastPos.copy(this.position);
    if (desiredSpeed > 0.3 && moved < desiredSpeed * dt * 0.2) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);

    // ---- Animation
    const planar = this.motor ? this.motor.planarSpeed : moved / dt;
    const yawRate = angleDelta(this.lastYaw, this.yaw) / dt;
    this.lastYaw = this.yaw;
    const l = this.loco;
    l.speed = planar > 0.02 ? Math.min(planar, this.velocity.length() + 0.2) : 0;
    l.moveLocalZ = l.speed > 0.05 ? 1 : 0;
    l.moveLocalX = 0;
    l.grounded = this.motor ? this.motor.grounded : true;
    l.verticalVelocity = this.motor ? this.motor.verticalVelocity : 0;
    l.turnRate = damp(l.turnRate, yawRate, 0.08, dt);
    l.sprinting = l.speed > (mv.runSpeed + mv.sprintSpeed) * 0.5;
    l.tension = damp(l.tension, this.tension, 1.2, dt);
    this.visual.update(dt, l);
  }

  override lateUpdate(): void {
    this.entity.object3D.rotation.set(0, this.yaw, 0);
  }

  yawTo(point: Vector3): number {
    const p = this.position;
    return Math.atan2(point.x - p.x, point.z - p.z);
  }

  private snapToGround(far: boolean): void {
    const p = this.position;
    const hit = this.game.physics.raycast(this.raycastFrom.set(p.x, p.y + (far ? 2 : 0.6), p.z), _down, far ? 6 : 1.6, Masks.ground);
    if (hit) p.y = hit.point.y;
  }
}

const _desired = new Vector3();
const _to = new Vector3();
const _down = new Vector3(0, -1, 0);
