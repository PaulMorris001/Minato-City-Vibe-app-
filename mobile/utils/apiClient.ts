import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import * as SecureStore from "expo-secure-store";

import { remoteLog } from "@/utils/remoteLog";

/**
 * Global axios behavior for the whole app.
 *
 * The codebase has 150+ call sites that use the default `axios` import. Instead
 * of refactoring each one to use a shared instance, we mutate the defaults +
 * install interceptors on the singleton. Every call inherits:
 *
 *   - A 20s timeout. Without this, hung TCP connections (Private Relay flake,
 *     hotel WiFi captive portal, Render hiccup) leave the user staring at a
 *     spinner forever.
 *   - Automatic retry on transient errors (no response received, or 5xx /
 *     408 / 429-without-Retry-After). Up to 2 retries with 1s and 3s backoff.
 *     Idempotent methods only (GET/HEAD/OPTIONS) AND explicit-opt-in POSTs
 *     (login, register, google/apple auth) where a duplicate is safe.
 *   - A request fingerprint added to the log so we can correlate retries.
 *
 * `fetch()` is NOT covered. Most of the app uses axios, but a few utilities
 * (logger, analytics, web-browser-ed Google flow) call fetch directly — those
 * are fire-and-forget and don't need retry.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
// 1s, then 3s — total worst-case extra wait is 4s on top of the timeout for
// each attempt, capped at ~ (20s + 1 + 20s + 3 + 20s) = 64s. Long, but
// finite and explained to the user.
const RETRY_BACKOFF_MS = [1_000, 3_000];

// POSTs that are safe to retry (the server idempotency comes from us looking
// up the user before mutating, or from these endpoints being read-shaped).
const RETRYABLE_POSTS: string[] = [
  "/login",
  "/register",
  "/google-auth",
  "/apple-auth",
  "/auth/google/web/start",
  "/auth/forgot-password",
  "/auth/verify-otp",
  "/auth/verify-signup-email",
  "/auth/resend-signup-otp",
  "/stripe/config",
];

// URLs we deliberately don't retry — they're fire-and-forget telemetry that
// must never delay a real request behind it.
const NEVER_RETRY = ["/logs"];

interface RetryConfig extends AxiosRequestConfig {
  _retryCount?: number;
  _reqId?: string;
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

// The auth middleware silently reissues a token (past a certain age) on any
// request that verifies fine, so an actively-used app never hits the flat
// server-side expiry mid-session — see server/src/middleware/auth.middleware.js.
// This is the client half: persist whatever comes back so the next request
// authenticates with the renewed token instead of the aging one.
async function applyRefreshedToken(response: AxiosResponse) {
  const refreshed = response.headers?.["x-refreshed-token"];
  if (typeof refreshed !== "string" || !refreshed) return;
  try {
    await SecureStore.setItemAsync("token", refreshed);
  } catch {
    // Best-effort — a failed write just means the next renewed request tries again.
  }
}

function shouldRetry(error: AxiosError, config: RetryConfig): boolean {
  const url = (config.url || "").toString();
  if (NEVER_RETRY.some((p) => url.includes(p))) return false;
  if ((config._retryCount ?? 0) >= MAX_RETRIES) return false;

  const method = (config.method || "get").toLowerCase();
  const isIdempotent = ["get", "head", "options"].includes(method);
  const isRetryablePost =
    method === "post" && RETRYABLE_POSTS.some((p: string) => url.endsWith(p));
  if (!isIdempotent && !isRetryablePost) return false;

  // No response at all → DNS / connect / TLS / timeout failure → retry.
  if (!error.response) return true;

  const status = error.response.status;
  if (status >= 500 && status < 600) return true;
  if (status === 408) return true;
  // 429 without a Retry-After is worth a single shot at backoff; with one,
  // axios doesn't know what to do so don't pretend.
  if (status === 429 && !error.response.headers["retry-after"]) return true;
  return false;
}

let configured = false;

export function setupApiClient() {
  if (configured) return;
  configured = true;

  axios.defaults.timeout = DEFAULT_TIMEOUT_MS;

  axios.interceptors.request.use((config) => {
    const c = config as unknown as RetryConfig;
    if (!c._reqId) c._reqId = shortId();
    return config;
  });

  axios.interceptors.response.use(
    async (response) => {
      await applyRefreshedToken(response);
      return response;
    },
    async (error: AxiosError) => {
      const config = (error.config || {}) as RetryConfig;
      const url = (config.url || "").toString();
      const method = (config.method || "get").toUpperCase();
      const status = error.response?.status;

      if (!shouldRetry(error, config)) {
        // Don't log /logs failures — that's the destination, would loop.
        if (!NEVER_RETRY.some((p) => url.includes(p))) {
          remoteLog("warn", "http.failure", {
            reqId: config._reqId,
            method,
            url,
            status,
            code: error.code,
            message: error.message,
            retried: config._retryCount ?? 0,
          });
        }
        return Promise.reject(error);
      }

      config._retryCount = (config._retryCount ?? 0) + 1;
      const wait = RETRY_BACKOFF_MS[config._retryCount - 1] ?? 3_000;

      remoteLog("warn", "http.retry", {
        reqId: config._reqId,
        method,
        url,
        attempt: config._retryCount,
        wait,
        status,
        code: error.code,
        message: error.message,
      });

      await new Promise((r) => setTimeout(r, wait));
      return axios.request(config);
    }
  );
}
