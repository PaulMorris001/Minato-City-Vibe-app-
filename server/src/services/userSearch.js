/**
 * User search, shared by GET /users/search and the unified GET /search.
 *
 * Kept out of the controllers so the exclusion rules — blocked users, the
 * support account, banned accounts — can't drift between the two callers. Those
 * rules are the reason user search is auth-gated in the first place.
 */

import User from "../models/user.model.js";
import Follow from "../models/follow.model.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { escapeRegex, exactCaseInsensitive } from "../utils/escapeRegex.js";
import { SUPPORT_USER_ID } from "../utils/supportAccount.js";

/**
 * Search users visible to `viewerId`, annotated with follow state.
 *
 * @param {object} args
 * @param {string} args.viewerId  required — excluded from results, and the basis
 *                                for the blocked-user and follow-state lookups
 * @param {string} args.q         search term (caller validates min length)
 * @param {number} [args.page=1]
 * @param {number} [args.limit=20]
 * @returns {Promise<{users: object[], total: number}>}
 */
export async function searchUsersQuery({ viewerId, q, page = 1, limit = 20 }) {
  const blockedIds = await getBlockedIds(viewerId);

  // Escape the term — raw user input in $regex is a ReDoS / regex-injection
  // vector (".*" would match everyone).
  const safeQuery = escapeRegex(String(q).trim());

  // Exclude the support account too — it's reached via the Contact Support
  // entry points, not by stumbling across it like a normal user.
  const excludedIds = SUPPORT_USER_ID ? [...blockedIds, SUPPORT_USER_ID] : blockedIds;

  const filter = {
    _id: { $ne: viewerId, $nin: excludedIds },
    isBanned: { $ne: true },
    $or: [
      { username: { $regex: safeQuery, $options: "i" } },
      // Business name is returned in the payload but was never searchable, so a
      // vendor's trading name couldn't be found by it.
      { businessName: { $regex: safeQuery, $options: "i" } },
      // Email is matched EXACTLY, not as a substring: substring matching turns
      // this endpoint into an address-enumeration oracle. Exact match still
      // supports "I know their email, find them".
      { email: exactCaseInsensitive(q) },
    ],
  };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("_id username email profilePicture isVendor businessName")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // Batch follow-status lookup — two queries regardless of result count.
  const userIds = users.map((u) => u._id);
  const [outgoing, incoming] = await Promise.all([
    Follow.find({ follower: viewerId, following: { $in: userIds } }).lean(),
    Follow.find({ follower: { $in: userIds }, following: viewerId }).lean(),
  ]);
  const followingSet = new Set(outgoing.map((f) => f.following.toString()));
  const followedBySet = new Set(incoming.map((f) => f.follower.toString()));

  return {
    total,
    users: users.map((user) => {
      const isFollowing = followingSet.has(user._id.toString());
      const isFollowedBy = followedBySet.has(user._id.toString());
      return {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor,
        businessName: user.businessName,
        isFollowing,
        isFollowedBy,
        isMutual: isFollowing && isFollowedBy,
      };
    }),
  };
}

export default { searchUsersQuery };
