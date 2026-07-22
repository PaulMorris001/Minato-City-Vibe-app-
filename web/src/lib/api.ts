import { API_BASE } from "../config";

// The mobile app stores its JWT in expo-secure-store; on the web we keep it in
// localStorage and send it as a Bearer token, exactly like mobile/libs/api.ts.
const TOKEN_KEY = "cv_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Attach the stored Bearer token (default: true when a token exists). */
  auth?: boolean;
}

/**
 * Thin fetch wrapper around the CityVibe backend. Paths are appended to
 * `${API_BASE}/api`, so callers pass e.g. "/login", "/events/public/explore".
 * Throws an ApiError (with status/code) on non-2xx so pages can branch on it.
 */
export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (auth !== false && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Request failed") as ApiError;
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data as T;
}
