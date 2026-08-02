import Follow from "../models/follow.model.js";
import User from "../models/user.model.js";
import { isSupportUser } from "./supportAccount.js";

/**
 * Everyone the support account "represents" — i.e. the real user base.
 *
 * The support account is the app's official channel, so it's shown as being
 * followed by every user rather than by whoever happened to tap follow. That
 * relationship is computed rather than stored: no Follow rows are written, so
 * the number is always live as people sign up and nobody's own "Following"
 * list is polluted with an account they never chose.
 *
 * Guests (checkout-only accounts) and banned users don't count as audience.
 */
export function supportAudienceFilter(supportId) {
  return {
    _id: { $ne: supportId },
    isBanned: { $ne: true },
    isGuest: { $ne: true },
  };
}

/**
 * Follower/following counts for a user, with the support account's virtual
 * audience substituted in. Used by both GET /profile and GET /follow/:id/counts
 * so the two can't drift.
 */
export async function countFollows(userId) {
  if (isSupportUser(userId)) {
    const audience = await User.countDocuments(supportAudienceFilter(userId));
    // Mirror the two so the profile reads as "follows everyone back" rather
    // than showing a bare 0 alongside the full user count.
    return { followersCount: audience, followingCount: audience };
  }

  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
  ]);

  return { followersCount, followingCount };
}
