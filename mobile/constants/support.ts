/**
 * Official support account — client-side mirror of the server's
 * SUPPORT_USER_ID (see server/src/utils/supportAccount.js).
 *
 * This is used only to decide where a tap goes; the server remains the
 * authority on what the account can and can't do. EXPO_PUBLIC_* values are
 * baked in at build time, so the literal below is the shipping default —
 * and a stale client is harmless because GET /users/:id returns an
 * `isSupport` marker that user-profile.tsx redirects on regardless.
 */
export const SUPPORT_USER_ID =
  process.env.EXPO_PUBLIC_SUPPORT_USER_ID || "6a6f6ab3115a6ccf63b487d5";

export const isSupportUser = (id?: string | null) =>
  !!SUPPORT_USER_ID && !!id && String(id) === SUPPORT_USER_ID;
