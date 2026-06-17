/**
 * Escape a user-supplied string so it can be safely embedded in a RegExp.
 *
 * Without this, raw user input passed to `$regex` queries is both a
 * regex-injection and a ReDoS vector (e.g. a username of `.*` would match
 * everyone, and a crafted pattern can pin the event loop). Use this for every
 * query that builds a RegExp from user input.
 */
export function escapeRegex(input) {
  if (typeof input !== "string") return "";
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build an anchored, case-insensitive RegExp that matches `value` exactly
 * (the whole string, ignoring case). Used for case-insensitive uniqueness
 * checks and lookups (e.g. usernames) without a DB migration.
 */
export function exactCaseInsensitive(value) {
  return new RegExp(`^${escapeRegex(String(value).trim())}$`, "i");
}
