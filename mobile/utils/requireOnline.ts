import { Alert } from "react-native";

import { isOnline } from "@/utils/reachability";

/**
 * Gate an action that cannot possibly work offline.
 *
 * Anything that moves money or creates server state calls this first. Without
 * it the user taps Buy, the request hangs for the full 20s axios timeout (see
 * utils/apiClient.ts) and then fails with a generic error — which reads like
 * the payment broke rather than like their signal did.
 *
 * Reads only, and anything with an optimistic local path (sending a message),
 * deliberately do NOT call this: those have their own fallbacks.
 *
 * @param action what they were trying to do, lowercase, e.g. "buy a ticket"
 * @returns true when it's safe to continue
 */
export function ensureOnline(action: string): boolean {
  if (isOnline()) return true;
  Alert.alert(
    "You're offline",
    `You need a connection to ${action}. Reconnect and try again.`
  );
  return false;
}
