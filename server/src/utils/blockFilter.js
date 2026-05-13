import User from "../models/user.model.js";

/**
 * Returns the array of user ObjectIds that should be hidden from `userId`'s
 * feeds — both users that `userId` has blocked AND users who have blocked `userId`.
 * Used to filter content authored by these users out of public-facing queries.
 */
export const getBlockedIds = async (userId) => {
  if (!userId) return [];

  const [me, blockedByOthers] = await Promise.all([
    User.findById(userId).select("blockedUsers").lean(),
    User.find({ blockedUsers: userId }).select("_id").lean(),
  ]);

  const ids = new Set();
  (me?.blockedUsers || []).forEach((id) => ids.add(String(id)));
  (blockedByOthers || []).forEach((u) => ids.add(String(u._id)));
  return Array.from(ids);
};
