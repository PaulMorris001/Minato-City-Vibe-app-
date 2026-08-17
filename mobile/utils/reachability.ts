import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";

import { BASE_URL } from "@/constants/constants";
import { remoteLog } from "@/utils/remoteLog";

/**
 * Whether the app can talk to the backend right now.
 *
 * Two signals feed one state:
 *
 *   1. A `/health` probe fired once at launch. The point isn't to keep the
 *      server warm (we're on Render Starter — it's always on). It's to detect
 *      a user's network that can't reach our backend AT ALL (Private Relay
 *      weirdness, ISP filtering, captive portal, dead WiFi), separately from
 *      per-request flakes, and to emit ONE Sentry event when that happens —
 *      exactly the "major error" category that belongs in Sentry. If we see a
 *      cluster (region, ISP, app version) we know to investigate DNS / certs.
 *   2. The OS network state, watched continuously, so losing signal mid-session
 *      flips the state immediately instead of at the next failed request. This
 *      is what the offline banner and the payment guards read.
 *
 * A device that is offline is unreachable, full stop. A device that is online
 * still might not reach us, which is what the launch probe catches — so the
 * network listener can only ever *downgrade* to "unreachable" or clear a
 * network-caused one; it never overrides a failed probe with "ok".
 *
 * The probe uses raw `fetch` instead of the axios interceptor stack on purpose:
 * we want raw reachability without our own retry logic in the way.
 */

export type Reachability = "unknown" | "ok" | "unreachable";

let currentState: Reachability = "unknown";
// What the last `/health` probe concluded, kept separate from `currentState`
// so a network blip that later clears can restore the probe's verdict rather
// than optimistically declaring us reachable.
let probeState: Reachability = "unknown";
let deviceOnline = true;
const listeners = new Set<(s: Reachability) => void>();

export function getReachability(): Reachability {
  return currentState;
}

/**
 * True when the device has a usable network. Distinct from `getReachability()`:
 * this answers "can anything leave the phone", which is the right question for
 * "don't start a payment" and for the offline banner.
 */
export function isOnline(): boolean {
  return deviceOnline && currentState !== "unreachable";
}

export function onReachabilityChange(cb: (s: Reachability) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(next: Reachability) {
  if (currentState === next) return;
  currentState = next;
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      // ignore listener errors
    }
  }
}

/** Recompute the public state from the two inputs that feed it. */
function recompute() {
  emit(deviceOnline ? probeState : "unreachable");
}

function setState(next: Reachability) {
  probeState = next;
  recompute();
}

let watching = false;

/**
 * Start watching the OS network state. Call once from `_layout.tsx`, next to
 * `checkBackendReachable()`.
 */
export function watchNetworkState(): void {
  if (watching) return;
  watching = true;

  const apply = (state: { isConnected?: boolean; isInternetReachable?: boolean }) => {
    // ONLY `isConnected` — deliberately not `isInternetReachable`.
    //
    // `isInternetReachable` is a heuristic the OS derives from its own probing.
    // It reports false on a perfectly working iOS Simulator, and can go
    // false-negative on real devices too. Because this flag gates payments via
    // ensureOnline(), a false "offline" refuses a legitimate purchase — far
    // more costly than the opposite, where the request simply fails and the
    // caller shows an error like it did before 1.2.0.
    const next = state.isConnected !== false;
    if (next === deviceOnline) return;
    deviceOnline = next;
    // Coming back online clears a network-caused "unreachable"; whether the
    // backend itself is reachable is the probe's call, not ours.
    recompute();
  };

  Network.getNetworkStateAsync().then(apply).catch(() => {});
  Network.addNetworkStateListener(apply);
}

const HEALTH_URL = `${BASE_URL.replace(/\/api\/?$/, "")}/health`;
const ATTEMPT_TIMEOUT_MS = 8_000;
const ATTEMPT_DELAYS_MS = [0, 2_000, 5_000]; // 3 attempts total

async function pingOnce(timeoutMs: number): Promise<{ ok: boolean; status?: number; message?: string; elapsedMs: number }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, elapsedMs: Date.now() - startedAt };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || String(err),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget. Call once from `_layout.tsx` on app launch. The function
 * does its own backoff; don't await it from the UI path or you'll block the
 * first paint behind 3 staggered network calls.
 */
export function checkBackendReachable(): void {
  (async () => {
    let lastError: { status?: number; message?: string; elapsedMs?: number } = {};
    for (let i = 0; i < ATTEMPT_DELAYS_MS.length; i++) {
      if (ATTEMPT_DELAYS_MS[i] > 0) {
        await new Promise((r) => setTimeout(r, ATTEMPT_DELAYS_MS[i]));
      }
      const result = await pingOnce(ATTEMPT_TIMEOUT_MS);
      remoteLog("info", "reachability.ping", {
        attempt: i + 1,
        url: HEALTH_URL,
        ok: result.ok,
        status: result.status,
        message: result.message,
        elapsedMs: result.elapsedMs,
      });
      if (result.ok) {
        setState("ok");
        return;
      }
      lastError = result;
    }

    // All 3 attempts failed → the backend is unreachable from this device.
    // This IS a major user-facing failure (no part of the app will work), so
    // it earns one Sentry capture, tagged so we can aggregate by app version /
    // platform / OS to spot patterns.
    setState("unreachable");
    Sentry.captureMessage("Backend unreachable from device", {
      level: "error",
      tags: {
        action: "reachability.unreachable",
        platform: Platform.OS,
        osVersion: String(Platform.Version ?? ""),
      },
      contexts: {
        reachability: {
          url: HEALTH_URL,
          attempts: ATTEMPT_DELAYS_MS.length,
          lastStatus: lastError.status,
          lastMessage: lastError.message,
          lastElapsedMs: lastError.elapsedMs,
        },
      },
    });
    // Also log to Render in case ONE of the subsequent calls in the app
    // happens to get through — gives us a paper trail there too.
    remoteLog("error", "reachability.unreachable", {
      url: HEALTH_URL,
      lastStatus: lastError.status,
      lastMessage: lastError.message,
      lastElapsedMs: lastError.elapsedMs,
    });
  })();
}
