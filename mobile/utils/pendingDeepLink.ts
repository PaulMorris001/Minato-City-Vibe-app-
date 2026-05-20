/**
 * Shared store for a deep link that arrived before the router / auth state
 * was ready to handle it.
 *
 * The typical flow is:
 *   1. User taps a push notification while the app is killed.
 *   2. _layout.tsx's notification handler fires almost immediately, before
 *      expo-router has finished mounting the initial route (`index.tsx`).
 *   3. We park the intended destination here.
 *   4. index.tsx reads it AFTER deciding the user is authenticated and
 *      redirects to it instead of `/(tabs)/home`.
 *
 * It is intentionally a module-level variable (not state) because we need
 * it before any provider has mounted.
 */

export type PendingDeepLink =
  | { kind: "chat"; chatId: string }
  | { kind: "user"; userId: string }
  | { kind: "event"; token: string }
  | { kind: "guide"; token: string };

let pending: PendingDeepLink | null = null;

export function setPendingDeepLink(link: PendingDeepLink | null) {
  pending = link;
  if (link) console.log("[DeepLink] queued:", link);
}

/** Reads and clears the pending link in one step. */
export function consumePendingDeepLink(): PendingDeepLink | null {
  const link = pending;
  pending = null;
  if (link) console.log("[DeepLink] consumed:", link);
  return link;
}

export function peekPendingDeepLink(): PendingDeepLink | null {
  return pending;
}

/** Returns the route path for the link, or null if invalid. */
export function deepLinkToPath(link: PendingDeepLink): string | null {
  switch (link.kind) {
    case "chat":
      return link.chatId ? `/chat/${link.chatId}` : null;
    case "user":
      return link.userId ? `/user-profile?userId=${encodeURIComponent(link.userId)}` : null;
    case "event":
      return link.token ? `/share/${link.token}` : null;
    case "guide":
      return link.token ? `/guide/${link.token}` : null;
  }
}

/** Loose validity check — accepts 24-char hex (Mongo ObjectId) for IDs. */
export function looksLikeObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}
