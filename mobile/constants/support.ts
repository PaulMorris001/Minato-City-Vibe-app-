/**
 * Official support account — client-side mirror of the server's
 * SUPPORT_USER_ID (see server/src/utils/supportAccount.js).
 *
 * DISPLAY ONLY. This decides whether an avatar/name tap should bounce to the
 * support chat instead of a profile page. It must NOT be used to open the
 * support chat itself — use `openSupportChat()`, which asks the server who
 * support is (POST /chats/support).
 *
 * Why: EXPO_PUBLIC_* values are baked in at build time, and this literal drifted
 * out of sync with the server's, which broke every support entry point in the
 * shipped app. Getting it wrong is now cosmetic rather than fatal, because the
 * server also returns an `isSupport` marker on GET /users/:id that
 * user-profile.tsx redirects on regardless.
 */
export const SUPPORT_USER_ID =
  process.env.EXPO_PUBLIC_SUPPORT_USER_ID || "6a6f6ab3115a6ccf63b487d5";

export const isSupportUser = (id?: string | null) =>
  !!SUPPORT_USER_ID && !!id && String(id) === SUPPORT_USER_ID;
