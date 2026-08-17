import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Read-through cache for GET responses, so the app still shows something
 * useful with no connection.
 *
 * Scope is deliberately narrow: whole JSON responses keyed by what they are,
 * written on every successful fetch and served when the network fails. It is
 * not a query cache and does not do invalidation — a fresh response always
 * wins, and staleness is surfaced to the user rather than hidden.
 *
 * Chat does NOT go through here. Messages need pagination, ordering and search,
 * which is why they live in SQLite (db/chatRepo.ts) instead.
 */

const PREFIX = "cv:cache:";
// Bump when an entry's shape changes so old builds' payloads are discarded
// rather than crashing a screen that expects new fields.
const VERSION = 1;

interface Entry<T> {
  v: number;
  at: number;
  data: T;
}

export interface CacheHit<T> {
  data: T;
  /** Epoch ms the entry was written — screens use it for "saved X ago". */
  cachedAt: number;
}

export async function cacheRead<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry?.v !== VERSION || entry.data === undefined) return null;
    return { data: entry.data, cachedAt: entry.at };
  } catch {
    // Corrupt or unparseable — treat as a miss rather than taking the screen down.
    return null;
  }
}

export async function cacheWrite<T>(key: string, data: T): Promise<void> {
  try {
    const entry: Entry<T> = { v: VERSION, at: Date.now(), data };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // A full disk shouldn't break the request that succeeded.
  }
}

/** Drop every cached response. Called on logout — this is another user's data. */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best-effort.
  }
}

export interface CachedFetchResult<T> {
  data: T | null;
  /** True when the network failed and `data` came from a previous session. */
  fromCache: boolean;
  cachedAt?: number;
  /** The network error, present whenever the request itself failed. */
  error?: unknown;
}

/**
 * Fetch JSON, writing every success to the cache and falling back to the last
 * good copy when the request fails.
 *
 * A non-2xx response is NOT a cache fallback — a 401 or 404 is the server
 * answering, and showing a stale event instead of "log in to view" would be
 * worse than the error. Only a transport failure falls back.
 */
export async function fetchWithCache<T>(
  url: string,
  options: { headers?: Record<string, string>; cacheKey: string }
): Promise<CachedFetchResult<T> & { status?: number }> {
  try {
    const res = await fetch(url, { headers: options.headers });
    if (!res.ok) {
      return { data: null, fromCache: false, status: res.status };
    }
    const data = (await res.json()) as T;
    await cacheWrite(options.cacheKey, data);
    return { data, fromCache: false, status: res.status };
  } catch (error) {
    const hit = await cacheRead<T>(options.cacheKey);
    if (hit) {
      return { data: hit.data, fromCache: true, cachedAt: hit.cachedAt, error };
    }
    return { data: null, fromCache: false, error };
  }
}
