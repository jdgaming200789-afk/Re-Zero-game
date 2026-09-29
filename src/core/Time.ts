/**
 * Frame timing. `dt` is scaled game time (affected by pause, hit-stop and
 * slow motion); `unscaledDt` always advances and is what UI, menus and the
 * Return-by-Death sequence use.
 */
export class Time {
  /** Scaled delta for this frame, seconds. */
  dt = 0;
  /** Real delta for this frame, seconds (clamped to avoid tab-switch spikes). */
  unscaledDt = 0;
  /** Total scaled time. */
  elapsed = 0;
  /** Total real time. */
  unscaledElapsed = 0;
  frame = 0;
  /** Fixed physics step in seconds. */
  readonly fixedDt = 1 / 60;
  /** Interpolation alpha between the last two fixed steps (0..1). */
  fixedAlpha = 0;

  private baseScale = 1;
  private hitStopUntil = 0;
  private hitStopScale = 0.05;
  private slowMo: { scale: number; until: number } | null = null;

  get timeScale(): number {
    if (this.unscaledElapsed < this.hitStopUntil) return this.baseScale * this.hitStopScale;
    if (this.slowMo && this.unscaledElapsed < this.slowMo.until) return this.baseScale * this.slowMo.scale;
    return this.baseScale;
  }

  /** Sets the persistent scale (0 = paused). */
  setBaseScale(scale: number): void {
    this.baseScale = Math.max(0, scale);
  }

  get paused(): boolean {
    return this.baseScale === 0;
  }

  /** Brief freeze on impactful hits; sells weight without animation work. */
  hitStop(seconds: number, scale = 0.05): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, this.unscaledElapsed + seconds);
    this.hitStopScale = scale;
  }

  slowMotion(scale: number, seconds: number): void {
    this.slowMo = { scale, until: this.unscaledElapsed + seconds };
  }

  advance(realDeltaSeconds: number): void {
    this.unscaledDt = Math.min(realDeltaSeconds, 0.1);
    this.unscaledElapsed += this.unscaledDt;
    this.dt = this.unscaledDt * this.timeScale;
    this.elapsed += this.dt;
    this.frame++;
  }
}
