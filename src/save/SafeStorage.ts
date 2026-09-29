/**
 * localStorage wrapper that never throws. Storage can be unavailable (private
 * browsing, blocked site data, quota exceeded); the game must keep running
 * and fall back to an in-memory store for the session.
 */
class SafeStorage {
  private readonly memory = new Map<string, string>();
  private available: boolean;

  constructor() {
    this.available = SafeStorage.probe();
  }

  private static probe(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const k = '__rzp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  get persistent(): boolean {
    return this.available;
  }

  getItem(key: string): string | null {
    if (this.available) {
      try {
        return localStorage.getItem(key);
      } catch {
        /* fall through */
      }
    }
    return this.memory.get(key) ?? null;
  }

  /** Returns false if the write could not be persisted. */
  setItem(key: string, value: string): boolean {
    this.memory.set(key, value);
    if (!this.available) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  removeItem(key: string): void {
    this.memory.delete(key);
    if (!this.available) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  keys(prefix: string): string[] {
    const out = new Set<string>();
    for (const k of this.memory.keys()) if (k.startsWith(prefix)) out.add(k);
    if (this.available) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) out.add(k);
        }
      } catch {
        /* ignore */
      }
    }
    return Array.from(out);
  }
}

export const safeStorage = new SafeStorage();
