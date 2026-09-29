/**
 * Generic object pool for frequently spawned things (hit sparks, projectiles,
 * decals, audio voices). Avoids GC churn during combat.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly live = new Set<T>();

  constructor(
    private readonly create: () => T,
    private readonly onAcquire?: (item: T) => void,
    private readonly onRelease?: (item: T) => void,
    prewarm = 0,
    private readonly maxSize = Infinity,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T | null {
    let item = this.free.pop();
    if (item === undefined) {
      if (this.live.size >= this.maxSize) return null;
      item = this.create();
    }
    this.live.add(item);
    this.onAcquire?.(item);
    return item;
  }

  release(item: T): void {
    if (!this.live.delete(item)) return;
    this.onRelease?.(item);
    this.free.push(item);
  }

  releaseAll(): void {
    for (const item of Array.from(this.live)) this.release(item);
  }

  get liveCount(): number {
    return this.live.size;
  }

  forEachLive(fn: (item: T) => void): void {
    for (const item of this.live) fn(item);
  }
}
