// ── Sync hook (used by src/lib/sync.ts to register Supabase callbacks) ───
type SyncCallback = (value: any) => void | Promise<void>;
const syncCallbacks = new Map<string, SyncCallback>();

export function onStorageWrite(key: string, cb: SyncCallback) {
  syncCallbacks.set(key, cb);
}

// ── Storage ───────────────────────────────────────────────────────────────
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
    const cb = syncCallbacks.get(key);
    if (cb) {
      const result = cb(value);
      if (result instanceof Promise) result.catch(e => console.warn("[sync]", e));
    }
  },
  remove(key: string) {
    localStorage.removeItem(key);
  }
};
