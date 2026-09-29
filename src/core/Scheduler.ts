import { Easing, type EasingName } from './math/MathUtil';

interface Task {
  remaining: number;
  duration: number;
  scaled: boolean;
  onUpdate?: (t: number) => void;
  ease: (t: number) => number;
  resolve: () => void;
  cancelled: boolean;
}

export interface TweenOptions {
  /** Use scaled game time (paused by menus / hit-stop). Default true. */
  scaled?: boolean;
  ease?: EasingName;
}

/**
 * Game-time timers and tweens. Gameplay sequences await these instead of
 * setTimeout/requestAnimationFrame so they pause with the game, respect
 * slow motion and step deterministically in automated tests.
 */
export class Scheduler {
  private readonly tasks: Task[] = [];

  /** Wait `seconds` of game time (or real time when `scaled` is false). */
  wait(seconds: number, scaled = true): Promise<void> {
    return this.tween(seconds, undefined, { scaled });
  }

  /** Resolve at the next frame. */
  nextFrame(): Promise<void> {
    return this.tween(0, undefined, { scaled: false });
  }

  /** Call `onUpdate(t)` with eased t in [0,1] every frame for `seconds`. */
  tween(seconds: number, onUpdate?: (t: number) => void, opts: TweenOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      this.tasks.push({
        remaining: Math.max(0, seconds),
        duration: Math.max(1e-6, seconds),
        scaled: opts.scaled ?? true,
        onUpdate,
        ease: Easing[opts.ease ?? 'linear'],
        resolve,
        cancelled: false,
      });
    });
  }

  update(dt: number, unscaledDt: number): void {
    if (this.tasks.length === 0) return;
    // Iterate over a snapshot: callbacks may schedule new tasks.
    const snapshot = this.tasks.slice();
    for (const task of snapshot) {
      if (task.cancelled) continue;
      task.remaining -= task.scaled ? dt : unscaledDt;
      const t = 1 - Math.max(0, task.remaining) / task.duration;
      task.onUpdate?.(task.ease(Math.min(1, t)));
      if (task.remaining <= 0) {
        task.cancelled = true;
        task.resolve();
      }
    }
    for (let i = this.tasks.length - 1; i >= 0; i--) if (this.tasks[i]!.cancelled) this.tasks.splice(i, 1);
  }

  get pending(): number {
    return this.tasks.length;
  }
}
