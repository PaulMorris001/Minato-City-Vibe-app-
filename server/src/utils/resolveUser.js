import mongoose from "mongoose";
import User from "../models/user.model.js";

/**
 * Resolve a user route param that may be an `_id` OR a share slug.
 *
 * Profile links are human-readable (`/user/setemil`), so every user-scoped
 * endpoint the profile screen calls — events, guides, follow counts/status —
 * can receive a slug where it used to get an ObjectId. Passing that straight
 * into a query cast-errors into a 500 (or a 400), which is what left shared
 * profiles rendering with missing values.
 *
 * Old slugs live in `slugHistory` after a rename, so links shared before a
 * username change keep resolving. Returns null when nothing matches, letting
 * callers answer 404 instead of throwing.
 *
 * @param {string} param  raw route param (`_id`, current slug, or old slug)
 * @returns {Promise<string|null>} the user's `_id` as a string, or null
 */
export async function resolveUserId(param) {
  if (!param) return null;
  // An ObjectId-shaped param is taken at face value — same as before slugs
  // existed, so id-based links keep their single-query cost.
  if (mongoose.isValidObjectId(param)) return String(param);

  const p = String(param).toLowerCase();
  const user = await User.findOne({ $or: [{ slug: p }, { slugHistory: p }] })
    .select("_id")
    .lean();
  return user ? String(user._id) : null;
}
