import { clearCache } from "@/utils/offlineCache";
import { clearChatStore } from "@/db/chatRepo";

/**
 * Wipe everything this device has cached on the signed-in user's behalf.
 *
 * Both stores hold other people's content — event details they were invited
 * to, and the full text of every chat they were in — so leaving them behind
 * after a logout would expose one account's data to the next person to sign in
 * on the same phone. Call this from EVERY logout path.
 *
 * Best-effort by design: a failure here must not block the logout itself, or a
 * user who can't sign out is worse off than one with a stale cache.
 */
export async function clearLocalData(): Promise<void> {
  await Promise.allSettled([clearCache(), clearChatStore()]);
}
