import { config } from "../config/env.js";

/**
 * Official support account helpers.
 *
 * The support account is an ordinary user document — it just happens to be the
 * one the company owns. Rather than adding a role field to every user, the
 * special behaviour is keyed off a single configured ID so it can differ per
 * environment and be switched off entirely by leaving SUPPORT_USER_ID unset.
 *
 * Always compare through these helpers instead of inlining the ID, so the
 * "support is disabled" case stays consistent everywhere.
 */

export const SUPPORT_USER_ID = config.support.userId;

/** True when `id` is the configured support account. */
export const isSupportUser = (id) =>
  !!SUPPORT_USER_ID && !!id && String(id) === SUPPORT_USER_ID;

/** True when either side of a pair is the support account. */
export const involvesSupport = (a, b) => isSupportUser(a) || isSupportUser(b);

/**
 * Stamp `isSupport` (and the verified badge that goes with it) on the support
 * account wherever it appears in a chat's participants.
 *
 * Clients must not have to recognise support from an id they carry in their
 * own bundle: the mobile constant has drifted from the configured
 * SUPPORT_USER_ID before, which silently disabled every support-specific
 * behaviour in the shipped app. Same reasoning as the marker on
 * GET /users/:userId.
 *
 * Returns a plain object — `isSupport` isn't a schema field, so a Mongoose
 * document would drop it on serialisation. A no-op when support is unset.
 *
 * `flattenMaps` is load-bearing, not tidiness: toObject() leaves Map paths as
 * real Maps (unlike toJSON()), and JSON.stringify(new Map(...)) is "{}". Without
 * it every chat here shipped `unreadCount`, `isMuted` and `isArchived` as empty
 * objects, which silently emptied every unread badge in the app.
 */
export function withSupportMarkers(chat) {
  if (!chat || !SUPPORT_USER_ID) return chat;
  const plain =
    typeof chat.toObject === "function" ? chat.toObject({ flattenMaps: true }) : chat;
  if (!Array.isArray(plain.participants)) return plain;
  plain.participants = plain.participants.map((p) =>
    p && isSupportUser(p._id) ? { ...p, isSupport: true, verified: true } : p
  );
  return plain;
}
