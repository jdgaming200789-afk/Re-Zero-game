import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { CharacterVisual, LocomotionState, PlayActionOptions } from './CharacterVisual';
import type { Scheduler } from '../core/Scheduler';

/**
 * TEMPORARY development stand-in used only until the procedural anime
 * character framework (Phase 3) is in place. Implements the full
 * CharacterVisual contract so gameplay code is written against the real API.
 */
export class PlaceholderVisual implements CharacterVisual {
  readonly root = new Group();
  readonly eyeHeight = 1.58;
  private readonly body: Mesh;
  private readonly head: Mesh;
  private phase = 0;
  private actionTimer = 0;

  constructor(
    private readonly scheduler: Scheduler,
    color = 0x1a1d24,
    accent = 0xe07a2e,
  ) {
    const mat = new MeshStandardMaterial({ color, roughness: 0.8 });
    const accentMat = new MeshStandardMaterial({ color: accent, roughness: 0.7 });
    this.body = new Mesh(new CapsuleGeometry(0.26, 0.9, 6, 12), mat);
    this.body.position.y = 0.73;
    this.head = new Mesh(new SphereGeometry(0.17, 20, 14), new MeshStandardMaterial({ color: 0xe8c9b0, roughness: 0.6 }));
    this.head.position.y = 1.52;
    const stripe = new Mesh(new CapsuleGeometry(0.265, 0.2, 4, 12), accentMat);
    stripe.position.y = 1.05;
    const nose = new Mesh(new SphereGeometry(0.05, 8, 8), accentMat);
    nose.position.set(0, 1.52, 0.17);
    for (const m of [this.body, this.head, stripe, nose]) {
      m.castShadow = true;
      this.root.add(m);
    }
  }

  update(dt: number, loco: LocomotionState): void {
    this.phase += dt * (2 + loco.speed * 2.2);
    const bob = Math.abs(Math.sin(this.phase)) * Math.min(loco.speed, 6) * 0.012;
    this.root.position.y = bob;
    this.root.rotation.z = -loco.turnRate * 0.02;
    if (this.actionTimer > 0) this.actionTimer -= dt;
  }

  play(_action: string, opts: PlayActionOptions = {}): Promise<void> {
    this.actionTimer = 0.6;
    void this.scheduler.wait(0.28).then(() => opts.onContact?.());
    return this.scheduler.wait(0.6);
  }

  stopAction(): void {
    this.actionTimer = 0;
  }
  lookAt(): void {}
  setExpression(): void {}
  setSpeaking(): void {}
  socketPosition(_name: string, out: Vector3): Vector3 {
    return this.head.getWorldPosition(out);
  }
  dispose(): void {}
}
