import { Vector3 } from 'three';
import { createLogger } from '../core/Log';
import { clamp, DEG } from '../core/math/MathUtil';
import type { GameContext, GameSystem } from '../game/GameContext';
import { Masks } from '../physics/Physics';
import { Interactable, type InteractionContext } from './Interactable';

const log = createLogger('Interaction');

/**
 * Chooses what the player can interact with and runs interactions.
 *
 * Candidate scoring blends distance, how centred the object is in the
 * camera view and whether the character is facing it, with hysteresis so
 * the prompt doesn't flicker between two nearby objects. Line of sight is
 * checked so you can't read a book through a wall.
 *
 * Running an interaction: lock player control → walk to the approach point
 * (if any) → turn to face → play the contextual animation → run the handler
 * at the animation's contact moment → wait for the handler → release.
 */
export class InteractionManager implements GameSystem {
  readonly name = 'interaction';
  focused: Interactable | null = null;
  private holdProgress = 0;
  private running: Interactable | null = null;
  private scanTimer = 0;
  private suppressed = new Set<string>();

  constructor(private readonly game: GameContext) {}

  /** Temporarily disable all prompts (combat, cinematics). */
  suppress(reason: string, on: boolean): void {
    if (on) this.suppressed.add(reason);
    else this.suppressed.delete(reason);
  }

  get busy(): boolean {
    return this.running !== null;
  }

  get holdFraction(): number {
    return this.focused && this.focused.hold > 0 ? clamp(this.holdProgress / this.focused.hold, 0, 1) : 0;
  }

  update(dt: number): void {
    const g = this.game;
    const player = g.player;
    const canInteract =
      player !== null &&
      this.running === null &&
      this.suppressed.size === 0 &&
      (g.mode === 'exploration' || g.mode === 'combat') &&
      player.hasControl &&
      player.motor.grounded;

    if (!canInteract) {
      this.setFocus(null);
      this.holdProgress = 0;
      return;
    }

    // Re-scan at 15 Hz; cheap enough and avoids jitter.
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 1 / 15;
      this.setFocus(this.findBest());
    }

    const f = this.focused;
    if (!f) return;
    const input = g.input;
    const locked = f.lockedMessage(g);

    if (f.hold > 0 && !locked) {
      if (input.held('interact')) {
        this.holdProgress += dt;
        if (this.holdProgress >= f.hold) {
          this.holdProgress = 0;
          void this.execute(f);
        }
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
      }
      if (input.pressed('interact')) input.consume('interact');
      return;
    }

    if (input.pressed('interact')) {
      input.consume('interact');
      if (locked) {
        g.ui.notify(locked, 'warning');
        g.events.emit('bark:play', { speakerId: 'subaru', text: locked, duration: 2.5 });
        return;
      }
      void this.execute(f);
    }
  }

  private findBest(): Interactable | null {
    const g = this.game;
    const player = g.player!;
    const origin = _origin.copy(player.entity.object3D.position);
    origin.y += 1.2;
    const camFwd = _camFwd.set(0, 0, -1).applyQuaternion(g.camera.camera.quaternion);
    const facing = _facing.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));

    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of Interactable.registry) {
      if (!it.enabled || !it.entity.active) continue;
      if (!it.isAvailable(g) && !it.lockedMessage(g)) continue;
      const anchor = it.worldAnchor(_anchor);
      const to = _to.subVectors(anchor, origin);
      const dist = to.length();
      const flatDist = Math.hypot(to.x, to.z);
      if (flatDist > it.range || Math.abs(to.y) > it.range + 1.2) continue;
      to.divideScalar(Math.max(dist, 1e-4));
      const flatTo = _flat.set(to.x, 0, to.z).normalize();
      const facingDot = facing.dot(flatTo);
      const camDot = camFwd.dot(to);
      const cosLimit = Math.cos(it.angle * DEG);
      // Must be roughly in front of either the character or the camera.
      if (facingDot < cosLimit && camDot < cosLimit) continue;
      if (it.requiresLineOfSight) {
        // Stop the ray just short of the anchor so the object's own collider doesn't block it.
        const seeTo = _see.copy(anchor).addScaledVector(to, -0.25);
        if (!g.physics.lineOfSight(origin, seeTo, Masks.lineOfSight, player.motor.collider)) continue;
      }
      let score = (1 - flatDist / it.range) * 1.2 + Math.max(facingDot, 0) * 0.8 + Math.max(camDot, 0) * 1.0 + it.priority;
      if (it === this.focused) score += 0.25; // hysteresis
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  private setFocus(it: Interactable | null): void {
    if (it === this.focused) return;
    this.focused = it;
    this.holdProgress = 0;
    this.game.events.emit('interaction:focusChanged', { interactableId: it?.id ?? null });
  }

  /** Run an interaction (also callable from scripts to force one). */
  async execute(it: Interactable): Promise<void> {
    const g = this.game;
    const player = g.player;
    if (!player || this.running) return;
    this.running = it;
    it.busy = true;
    this.setFocus(null);
    player.lock('interaction');
    g.events.emit('interaction:started', { interactableId: it.id, kind: it.kind });
    try {
      const anchor = it.worldAnchor(new Vector3());
      if (it.approach) {
        const obj = it.anchorObject();
        obj.updateWorldMatrix(true, false);
        const spot = it.approach.offset.clone().applyMatrix4(obj.matrixWorld);
        spot.y = player.entity.object3D.position.y;
        await player.moveTo(spot, player.movement.walkSpeed, 0.1, 3);
      }
      if (it.approach?.face !== false) await player.faceTowards(anchor, 600);

      let contactResolve!: () => void;
      const contact = new Promise<void>((r) => (contactResolve = r));
      let animDone: Promise<void> = Promise.resolve();
      if (it.animation !== 'none') {
        player.visual.lookAt(anchor, 1);
        animDone = player.visual.play(it.animation, { onContact: () => contactResolve() });
      } else {
        contactResolve();
      }
      // Safety: never wait forever on a missing contact event.
      const contactOrTimeout = Promise.race([contact, g.scheduler.wait(1.5)]);
      const ctx: InteractionContext = { game: g, interactable: it, contact: contactOrTimeout };
      await contactOrTimeout;
      await it.run(ctx);
      await animDone;
      it.used = true;
      g.events.emit('interaction:completed', { interactableId: it.id, kind: it.kind });
    } catch (err) {
      log.error(`Interaction "${it.id}" failed`, err);
    } finally {
      player.visual.lookAt(null);
      player.unlock('interaction');
      it.busy = false;
      this.running = null;
      this.scanTimer = 0.2;
    }
  }
}

const _origin = new Vector3();
const _camFwd = new Vector3();
const _facing = new Vector3();
const _anchor = new Vector3();
const _to = new Vector3();
const _flat = new Vector3();
const _see = new Vector3();
