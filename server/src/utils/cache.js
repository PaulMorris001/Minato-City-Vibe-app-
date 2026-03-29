const cache = new Map(); // key -> { data, expiresAt }

export function setCache(key, data, ttlSeconds) {
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function invalidateCache(key) {
  cache.delete(key);
}

export function invalidateCachePattern(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
