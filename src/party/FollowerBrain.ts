import { Vector3 } from 'three';
import type { ActorBrain, ActorController } from '../actors/ActorController';
import { clamp } from '../core/math/MathUtil';
import type { PartyMemberDef } from '../data/party';
import type { PartyManager } from './PartyManager';

type FollowState = 'follow' | 'settle' | 'idle';

/**
 * Companion travel behaviour: keep a formation slot on the path the player
 * walked, walk/run/sprint to keep up, route along the breadcrumb trail when
 * the direct way is blocked, give the player room, and warp in from out of
 * view if hopelessly separated. When the group stops, companions settle
 * where they are (no shuffling) and turn their attention to Subaru, the
 * thing he's looking at, or whoever is talking.
 */
export class FollowerBrain implements ActorBrain {
  state: FollowState = 'idle';
  private readonly slot = new Vector3();
  private readonly target = new Vector3();
  private readonly waypoint = new Vector3();
  private routeTimer = Math.random() * 0.25;
  private hasDirectRoute = true;
  private leaderStill = 0;
  private idleTimer = 0;
  private glanceTimer = 2 + Math.random() * 4;
  private readonly glance = new Vector3();
  private glancing = 0;
  private separatedTime = 0;

  constructor(
    private readonly party: PartyManager,
    readonly def: PartyMemberDef,
    public index: number,
  ) {}

  onPlaced(): void {
    this.state = 'idle';
    this.separatedTime = 0;
    this.hasDirectRoute = true;
  }

  update(actor: ActorController, dt: number): void {
    const party = this.party;
    const leader = party.leaderPosition;
    const pos = actor.position;
    const leaderSpeed = party.leaderSpeed;
    this.leaderStill = leaderSpeed < 0.25 ? this.leaderStill + dt : 0;

    // ---- Hopelessly separated: warp in behind the player, out of view.
    const toLeader = _v.subVectors(leader, pos);
    const leaderDist = Math.hypot(toLeader.x, toLeader.z);
    const vertical = Math.abs(toLeader.y);
    if (leaderDist > 30 || vertical > 6 || (actor.stuckTime > 2.5 && (leaderDist > 6 || vertical > 1.2))) this.separatedTime += dt;
    else this.separatedTime = 0;
    if (this.separatedTime > (leaderDist > 45 ? 0 : 1.5) && party.warpBehind(actor, this)) {
      this.separatedTime = 0;
      return;
    }

    party.slotFor(this, this.slot);
    let slotDist = Math.hypot(this.slot.x - pos.x, this.slot.z - pos.z);

    // ---- State: follow while the leader moves; settle when they stop.
    if (leaderSpeed > 0.4) this.state = 'follow';
    else if (this.state === 'follow' && this.leaderStill > 0.3) this.state = 'settle';
    if (this.state === 'settle') {
      // Close enough to the group? Stop where we are instead of shuffling
      // into an exact slot.
      const comfortable =
        vertical < 0.7 && leaderDist > this.def.personalSpace + 0.4 && leaderDist < this.def.followDistance + 1.8 && party.clearPath(pos, leader);
      if (comfortable || (slotDist < 0.4 && vertical < 0.7)) this.state = 'idle';
    }
    if (this.state === 'idle' && (leaderDist > this.def.followDistance + 3.5 || leaderDist < this.def.personalSpace * 0.6 || vertical > 1.2)) this.state = 'settle';

    // Leader dropped off a ledge / went down a level: head for them, not
    // for a slot left behind up top.
    let forceDirect = false;
    if (this.state === 'settle' && vertical > 0.7 && party.leaderStillFor > 0.5) {
      // Walk straight at them (off the ledge); personal space takes over
      // once we're on the same level.
      this.slot.copy(leader);
      slotDist = leaderDist;
      forceDirect = true;
    }

    // ---- Route: straight to the slot if clear, else along the trail.
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.25;
      this.hasDirectRoute = party.clearPath(pos, this.slot);
      if (!this.hasDirectRoute && !party.trailWaypoint(pos, this.waypoint)) this.waypoint.copy(leader);
    }
    this.target.copy(forceDirect || this.hasDirectRoute ? this.slot : this.waypoint);
    const toTarget = _t.subVectors(this.target, pos);
    toTarget.y = 0;
    const d = toTarget.length();

    // ---- Steering
    const steer = actor.steer.set(0, 0, 0);
    if (this.state !== 'idle' && d > 0.15) {
      const mv = actor.movement;
      let speed: number;
      if (this.state === 'follow') {
        // Match the leader, plus catch-up proportional to lag.
        const lag = slotDist;
        speed = leaderSpeed + clamp(lag - 0.4, 0, 8) * (0.9 + this.def.eagerness * 0.6);
        speed = clamp(speed, 0, mv.sprintSpeed * (lag > 6 ? 1.05 : 1));
        if (lag < 1.2) speed = Math.min(speed, leaderSpeed + 0.6);
      } else {
        speed = d > 4 ? mv.runSpeed : mv.walkSpeed * clamp(d / 1.2, 0.45, 1);
      }
      steer.copy(toTarget).multiplyScalar(speed / Math.max(d, 1e-4));
    }
    party.addSeparation(actor, steer);

    // ---- Attention
    this.updateAttention(actor, dt, leaderDist);
  }

  private updateAttention(actor: ActorController, dt: number, leaderDist: number): void {
    const party = this.party;
    const moving = actor.velocity.lengthSq() > 0.05;
    const focus = party.attentionPoint();
    if (focus) {
      actor.lookAt(focus, 0.9);
      if (!moving) actor.faceTarget = focus;
      return;
    }
    if (moving) {
      actor.faceTarget = null;
      // Glance at the player now and then while walking together.
      actor.lookAt(leaderDist < 5 && Math.sin(party.time * 0.7 + this.index * 2.1) > 0.6 ? party.leaderHead : null, 0.6);
      this.idleTimer = 0;
      return;
    }
    this.idleTimer += dt;
    this.glanceTimer -= dt;
    if (this.glancing > 0) {
      this.glancing -= dt;
      actor.lookAt(this.glance, 0.8);
      if (this.glancing <= 0) this.glanceTimer = 3 + Math.random() * 6 * (1.2 - this.def.curiosity);
      return;
    }
    if (this.glanceTimer <= 0 && Math.random() < 0.3 + this.def.curiosity * 0.6) {
      // Look around at the surroundings (the curious ones more often).
      const a = actor.yaw + (Math.random() - 0.5) * 2.4;
      this.glance.set(actor.position.x + Math.sin(a) * 6, actor.position.y + 1.2 + Math.random() * 2.5, actor.position.z + Math.cos(a) * 6);
      this.glancing = 1.5 + Math.random() * 2;
      return;
    }
    // Default: face and look at the player once settled.
    if (this.idleTimer > 0.6) actor.faceTarget = party.leaderPosition;
    actor.lookAt(party.leaderHead, 0.7);
  }
}

const _v = new Vector3();
const _t = new Vector3();
