/**
 * Shared localStorage helpers — every piece of persisted client state
 * (session, and later things like a POS cart draft) should read/write
 * through these, not call `JSON.parse(localStorage.getItem(...))` directly.
 *
 * `readJson` self-heals: a corrupted or stale entry (e.g. the literal
 * string "undefined", which `JSON.parse` rejects as invalid JSON) is
 * wiped and the fallback is returned, instead of throwing at module-load
 * time and blanking the whole app.
 */

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw == null || raw === "undefined") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (value === undefined) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeKeys(...keys: string[]): void {
  keys.forEach((key) => localStorage.removeItem(key));
}