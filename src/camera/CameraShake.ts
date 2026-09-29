import { Euler, Vector3 } from 'three';
import { noise1D } from '../core/math/MathUtil';

/**
 * Trauma-based camera shake (Squirrel Eiserloh's model): impacts add trauma,
 * shake amplitude is trauma², trauma decays linearly. Smooth noise, not
 * random jitter, so it reads as weight rather than a glitch.
 */
export class CameraShake {
  private trauma = 0;
  private t = 0;
  /** Player setting multiplier (accessibility). */
  scale = 1;
  decay = 1.4;
  maxAngle = 0.06;
  maxOffset = 0.12;
  frequency = 18;
  /** Low-frequency handheld sway for cinematics and unsettling areas. */
  sway = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  get current(): number {
    return this.trauma;
  }

  update(dt: number, outOffset: Vector3, outRot: Euler): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    const shake = this.trauma * this.trauma * this.scale;
    const f = this.frequency;
    outRot.set(
      this.maxAngle * shake * noise1D(this.t * f, 1) + this.sway * 0.006 * noise1D(this.t * 0.35, 11),
      this.maxAngle * shake * noise1D(this.t * f, 2) + this.sway * 0.008 * noise1D(this.t * 0.3, 12),
      this.maxAngle * 0.6 * shake * noise1D(this.t * f, 3),
    );
    outOffset.set(
      this.maxOffset * shake * noise1D(this.t * f, 4),
      this.maxOffset * shake * noise1D(this.t * f, 5),
      this.maxOffset * 0.5 * shake * noise1D(this.t * f, 6),
    );
  }
}
