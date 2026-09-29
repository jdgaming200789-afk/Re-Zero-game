import { Color, Vector3 } from 'three';
import { hostile } from '../combat/Damage';
import type { Health } from '../combat/Health';
import type { Telegraph } from '../combat/Telegraphs';
import { Component } from '../core/ecs/Component';
import { clamp, Easing } from '../core/math/MathUtil';
import type { WormVisual } from '../creatures/WormVisual';
import type { GameContext } from '../game/GameContext';
import { ParticleEmitter, ParticlePresets } from '../vfx/ParticleEmitter';

export type WormState = 'burrowed' | 'rising' | 'breach' | 'rear' | 'slam' | 'dive' | 'dead';

export interface WormTuning {
  depth: number;
  burrowSpeed: number;
  eruptRadius: number;
  eruptDamage: number;
  slamDamage: number;
  telegraph: number;
}

const TUNING: WormTuning = { depth: 3.2, burrowSpeed: 6.5, eruptRadius: 3.6, eruptDamage: 34, slamDamage: 28, telegraph: 1.35 };

/**
 * The Sand Earthworm. It cannot see: it hunts vibration. Underground it
 * swims towards the most recent loud noise (running, fighting, the carriage
 * bell), a mound of sand rolling over the surface above it. Close to the
 * source it stops, the ground trembles (telegraph), and it erupts —
 * either breaching in a great arc and diving back in, or rearing up to
 * slam, the only times it can be hurt. Standing still is how you hide.
 */
export class EarthwormController extends Component {
  state: WormState = 'burrowed';
  private t = 0;
  readonly head = new Vector3();
  private readonly vel = new Vector3();
  private readonly target = new Vector3();
  private targetFresh = 0;
  private readonly breachFrom = new Vector3();
  private readonly breachTo = new Vector3();
  private telegraphRef: Telegraph | null = null;
  private readonly segPoints: Vector3[] = [];
  private readonly spray: ParticleEmitter;
  private readonly burst: ParticleEmitter;
  private rumble = 0;
  private cycles = 0;
  /** Called whenever it surfaces (the Glass Flats hook: the Heliosphere fires). */
  onSurfaced?: (at: Vector3) => void;
  readonly tuning = TUNING;

  constructor(
    readonly game: GameContext,
    readonly visual: WormVisual,
    readonly health: Health,
    start: Vector3,
  ) {
    super();
    this.head.copy(start).setY(this.ground(start) - TUNING.depth);
    this.target.copy(start);
    const sand = new Color(0.78, 0.66, 0.46);
    this.spray = new ParticleEmitter({
      ...ParticlePresets.sparks(sand),
      maxParticles: 260,
      rate: 0,
      additive: false,
      alpha: 0.85,
      size: [0.08, 0.2],
      lifetime: [0.5, 1.1],
      velocityMin: new Vector3(-1.2, 1.5, -1.2),
      velocityMax: new Vector3(1.2, 3.8, 1.2),
      gravity: new Vector3(0, -8, 0),
      streak: 0,
      intensity: 1,
      shape: { type: 'disc', radius: 1.4 },
    });
    this.burst = new ParticleEmitter({
      ...ParticlePresets.sparks(sand),
      maxParticles: 400,
      rate: 0,
      additive: false,
      alpha: 0.9,
      size: [0.15, 0.4],
      lifetime: [0.8, 1.8],
      velocityMin: new Vector3(-5, 4, -5),
      velocityMax: new Vector3(5, 11, 5),
      gravity: new Vector3(0, -9, 0),
      drag: 0.6,
      streak: 0,
      intensity: 1,
      shape: { type: 'disc', radius: 2.5 },
    });
  }

  override onAttach(): void {
    const scene = this.game.render.scene;
    scene.add(this.spray, this.burst);
    this.game.vfx.addEmitter(this.spray, 'persistent');
    this.game.vfx.addEmitter(this.burst, 'persistent');
    this.visual.resetTrail(this.head, new Vector3(0, 0, 1), 0.2);
    this.health.lockInvulnerable(true); // hurtable only while surfaced
    this.health.extraRadius = 1.1;
    this.health.onDeath = () => this.die();
    this.health.onHit = () => void this.visual.play('flinch');
  }

  override onDetach(): void {
    this.visual.dispose();
    this.game.vfx.removeEmitter(this.spray);
    this.game.vfx.removeEmitter(this.burst);
    if (this.telegraphRef) this.game.combat.telegraphs.cancel(this.telegraphRef.id);
  }

  private ground(p: Vector3): number {
    return this.game.physics.groundHeight(p.x, p.y + 30, p.z, 80) ?? 0;
  }

  /** Vibration reached it. Louder and more recent wins. */
  hear(at: Vector3, loudness: number): void {
    if (this.state === 'dead') return;
    const d = Math.hypot(at.x - this.head.x, at.z - this.head.z);
    const felt = loudness * 2.2 - d;
    if (felt <= 0) return;
    if (this.targetFresh <= 0 || felt > 4) {
      this.target.copy(at);
      this.targetFresh = 5;
    }
  }

  private surfaced(): boolean {
    return this.state === 'breach' || this.state === 'rear' || this.state === 'slam';
  }

  private setState(s: WormState): void {
    const wasUp = this.surfaced();
    this.state = s;
    this.t = 0;
    const up = this.surfaced();
    if (up && !wasUp) this.health.lockInvulnerable(false);
    if (!up && wasUp) this.health.lockInvulnerable(true);
  }

  private hitArea(center: Vector3, radius: number, damage: number, stagger: number): void {
    for (const h of this.game.combat.sphere(center, radius, {})) {
      if (h === this.health || !hostile('enemy', h.effectiveFaction)) continue;
      const dir = h.entity.object3D.position.clone().sub(center).setY(0).normalize();
      this.game.combat.damage(h, { amount: damage, type: 'physical', sourceId: this.entity.id, point: h.center(new Vector3()), direction: dir, stagger, hitStop: 0.1, tags: ['earthworm'] });
    }
  }

  private die(): void {
    if (this.telegraphRef) this.game.combat.telegraphs.cancel(this.telegraphRef.id);
    this.state = 'dead';
    this.t = 0;
    this.burst.anchor.copy(this.head);
    this.burst.burst(120);
  }

  override update(dt: number): void {
    this.t += dt;
    this.targetFresh -= dt;
    const T = this.tuning;
    const g = this.ground(this.head);
    switch (this.state) {
      case 'burrowed': {
        // Swim towards the vibration; wander in slow circles when it's quiet.
        let goal = this.target;
        if (this.targetFresh <= 0) goal = _a.copy(this.head).add(_b.set(Math.sin(this.t * 0.3) * 6, 0, Math.cos(this.t * 0.3) * 6));
        const to = _c.subVectors(goal, this.head).setY(0);
        const d = to.length();
        const speed = this.targetFresh > 0 ? T.burrowSpeed : T.burrowSpeed * 0.35;
        if (d > 0.1) this.vel.copy(to).multiplyScalar(Math.min(speed, d * 2) / d);
        this.head.addScaledVector(this.vel, dt);
        this.head.y = damp1(this.head.y, g - T.depth, dt);
        this.rumble = speed / T.burrowSpeed;
        if (this.targetFresh > 0 && d < 1.5 && this.t > 2) {
          // Tremor before the strike: the telegraph players learn to read.
          this.setState('rising');
          this.telegraphRef = this.game.combat.telegraph({ kind: 'circle', center: this.head.clone().setY(g), radius: T.eruptRadius }, this.health, T.telegraph);
          this.game.events.emit('audio:stinger', { id: 'earthworm_tremor' });
        }
        break;
      }
      case 'rising': {
        this.rumble = 1.5;
        this.head.y = damp1(this.head.y, g - 1.2, dt * 0.5);
        if (this.t >= T.telegraph) {
          this.telegraphRef = null;
          this.hitArea(_a.copy(this.head).setY(g), T.eruptRadius, T.eruptDamage, 60);
          this.burst.anchor.copy(this.head).setY(g);
          this.burst.burst(160);
          this.game.camera.shake.add(0.6);
          this.cycles++;
          const player = this.game.player?.entity.object3D.position ?? this.head;
          const dir = _a.subVectors(player, this.head).setY(0);
          if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
          dir.normalize();
          // Alternate: breach in an arc, or rear up and slam.
          if (this.cycles % 2 === 1) {
            this.breachFrom.copy(this.head).setY(g - 1.5);
            this.breachTo.copy(this.head).addScaledVector(dir, 12);
            this.breachTo.y = this.ground(this.breachTo) - T.depth;
            this.setState('breach');
          } else {
            this.breachFrom.copy(this.head);
            this.breachTo.copy(dir);
            this.setState('rear');
          }
          this.onSurfaced?.(this.head.clone().setY(g));
          this.game.events.emit('story:event', { id: 'earthworm.surfaced' });
        }
        break;
      }
      case 'breach': {
        // Ballistic arc out of the sand and back in.
        const dur = 2.4;
        const u = Math.min(1, this.t / dur);
        this.head.lerpVectors(this.breachFrom, this.breachTo, Easing.inOutSine(u));
        this.head.y += Math.sin(Math.PI * u) * 9;
        this.rumble = 0.6;
        // The body sweeps whatever it passes through.
        if (this.t > 0.2 && Math.floor(this.t * 6) !== Math.floor((this.t - dt) * 6)) this.hitArea(this.head, 1.8, 16, 30);
        if (u >= 1) {
          this.burst.anchor.copy(this.head).setY(this.ground(this.head));
          this.burst.burst(90);
          this.setState('burrowed');
          this.targetFresh = Math.min(this.targetFresh, 1);
        }
        break;
      }
      case 'rear': {
        // Rise to full height, sway, glare: the window to hurt it.
        const up = Math.min(1, this.t / 0.8);
        const sway = Math.sin(this.t * 1.6) * 1.2;
        const side = _b.set(-this.breachTo.z, 0, this.breachTo.x);
        this.head.copy(this.breachFrom).addScaledVector(side, sway * up);
        this.head.y = g + Easing.outBack(up) * 6.5;
        if (this.t > 0.8) this.visual.play('roar');
        if (this.t > 4.2) {
          const reach = this.breachFrom.clone().addScaledVector(this.breachTo, 9).setY(g);
          this.telegraphRef = this.game.combat.telegraph({ kind: 'line', origin: this.breachFrom.clone().setY(g), dir: this.breachTo.clone(), length: 9.5, width: 3 }, this.health, 0.9);
          this.breachTo.copy(reach);
          this.breachFrom.copy(this.head);
          this.setState('slam');
        }
        break;
      }
      case 'slam': {
        const u = Math.min(1, this.t / 0.9);
        if (u < 1) {
          // Wind back, then crash forward.
          const k = u < 0.6 ? -Easing.outCubic(u / 0.6) * 0.15 : Easing.inCubic((u - 0.6) / 0.4);
          this.head.lerpVectors(this.breachFrom, this.breachTo, clamp(k, -0.15, 1));
          this.head.y = this.breachFrom.y + (this.breachTo.y - this.breachFrom.y) * clamp(k, 0, 1) + (u < 0.6 ? u * 1.5 : 0);
        } else {
          this.telegraphRef = null;
          const origin = this.breachFrom.clone().setY(g);
          const dir = _a.subVectors(this.breachTo, origin).setY(0).normalize();
          for (const h of this.game.combat.all()) {
            if (h === this.health || !h.alive || !hostile('enemy', h.effectiveFaction)) continue;
            if (this.game.combat.telegraphs.contains({ kind: 'line', origin, dir, length: 9.5, width: 3 }, h.entity.object3D.position, h.radius)) {
              this.game.combat.damage(h, { amount: T.slamDamage, type: 'physical', sourceId: this.entity.id, point: h.center(new Vector3()), direction: dir, stagger: 50, hitStop: 0.12 });
            }
          }
          this.burst.anchor.copy(this.breachTo);
          this.burst.burst(140);
          this.game.camera.shake.add(0.55);
          this.breachFrom.copy(this.head);
          this.breachTo.copy(this.head).setY(this.ground(this.head) - T.depth);
          this.setState('dive');
        }
        break;
      }
      case 'dive': {
        const u = Math.min(1, this.t / 1.2);
        this.head.lerpVectors(this.breachFrom, this.breachTo, Easing.inQuad(u));
        if (u >= 1) this.setState('burrowed');
        break;
      }
      case 'dead': {
        // Collapse: the head sinks slowly into the sand.
        this.head.y -= dt * 1.2;
        if (this.t > 5) this.entity.destroy();
        break;
      }
    }
    this.entity.object3D.position.copy(this.head);
    this.visual.moveHead(this.head);
    this.visual.update(dt, IDLE);
    // Hittable segments are the ones above the sand.
    const segs = this.visual.segmentPositions(this.segPoints);
    this.health.extraPoints = this.surfaced() ? segs.filter((p) => p.y > this.ground(p) - 0.5) : null;
    // Sand mound and spray over the swimming head.
    const surfaceY = this.ground(this.head);
    const near = this.head.y > surfaceY - T.depth - 0.5 && this.head.y < surfaceY + 1;
    this.spray.anchor.set(this.head.x, surfaceY, this.head.z);
    this.spray.config.rate = near && this.state !== 'dead' ? 60 + this.rumble * 120 : 0;
    const player = this.game.player?.entity.object3D.position;
    if (player && this.rumble > 0) {
      const dist = Math.hypot(player.x - this.head.x, player.z - this.head.z);
      if (dist < 16) this.game.camera.shake.add(dt * 0.25 * this.rumble * (1 - dist / 16));
    }
  }
}

function damp1(v: number, target: number, dt: number): number {
  return v + (target - v) * Math.min(1, dt * 3);
}

const IDLE = { speed: 0, moveLocalX: 0, moveLocalZ: 0, grounded: true, verticalVelocity: 0, turnRate: 0, sprinting: false, exhaustion: 0, combatReady: 0, tension: 0 };
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
