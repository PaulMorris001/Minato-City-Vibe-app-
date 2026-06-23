import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "https://api.ourcityvibe.com/api";

console.log(BASE_URL)

const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("adminToken");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Client-side GET cache ──────────────────────────────────────────────────

const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
const DEFAULT_TTL = 60_000; // 60 seconds

function cacheKey(url: string, params?: object): string {
  return params ? `${url}?${new URLSearchParams(params as Record<string, string>).toString()}` : url;
}

export function cachedGet<T = unknown>(
  url: string,
  config?: { params?: object; ttl?: number }
): Promise<{ data: T }> {
  const key = cacheKey(url, config?.params);
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return Promise.resolve({ data: entry.data as T });
  }
  return client.get<T>(url, { params: config?.params }).then((res) => {
    responseCache.set(key, {
      data: res.data,
      expiresAt: Date.now() + (config?.ttl ?? DEFAULT_TTL),
    });
    return res;
  });
}

/** Invalidate cache entries whose key starts with the given prefix (or all if omitted). */
export function bustCache(prefix?: string) {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

export default client;
