/**
 * Strongly-typed publish/subscribe bus.
 *
 * Systems talk to each other through events instead of holding references to
 * one another wherever the relationship is "something happened" rather than
 * "do this now". The event map type is the contract: adding an event means
 * adding a key to the map, and every emitter/listener is type-checked.
 */
export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export class EventBus<TEvents extends { [K in keyof TEvents]: unknown }> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<unknown>>>();
  /** Re-entrancy guard: listeners added during an emit take effect next emit. */
  private emitting = 0;
  private readonly pendingRemovals: Array<() => void> = [];

  on<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(type, listener);
  }

  once<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): Unsubscribe {
    const off = this.on(type, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /** Resolves the next time `type` is emitted (optionally matching a predicate). */
  wait<K extends keyof TEvents>(type: K, predicate?: (payload: TEvents[K]) => boolean): Promise<TEvents[K]> {
    return new Promise((resolve) => {
      const off = this.on(type, (payload) => {
        if (predicate && !predicate(payload)) return;
        off();
        resolve(payload);
      });
    });
  }

  off<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): void {
    const remove = () => this.listeners.get(type)?.delete(listener as Listener<unknown>);
    if (this.emitting > 0) this.pendingRemovals.push(remove);
    else remove();
  }

  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    this.emitting++;
    try {
      for (const listener of Array.from(set)) {
        try {
          listener(payload);
        } catch (err) {
          // One faulty listener must never break the rest of the frame.
          console.error(`[EventBus] listener for "${String(type)}" threw`, err);
        }
      }
    } finally {
      this.emitting--;
      if (this.emitting === 0 && this.pendingRemovals.length > 0) {
        for (const r of this.pendingRemovals.splice(0)) r();
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount<K extends keyof TEvents>(type: K): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/** Collects unsubscribe handles so a system can detach everything at once. */
export class Subscriptions {
  private readonly handles: Unsubscribe[] = [];
  add(handle: Unsubscribe): void {
    this.handles.push(handle);
  }
  dispose(): void {
    for (const h of this.handles.splice(0)) h();
  }
}
