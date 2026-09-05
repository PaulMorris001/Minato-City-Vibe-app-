/**
 * A user's real name — "" for an account that hasn't set firstName/lastName
 * yet (pre-migration, or mid "complete your name" gate).
 */
export function fullName(user?: { firstName?: string; lastName?: string } | null): string {
  if (!user) return "";
  return [user.firstName, user.lastName]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * The name to show for a user anywhere personal identity matters (home
 * greeting, their profile, followers/following, Discover People, chat).
 * Real name first, falling back to the username for an account that hasn't
 * completed the name gate.
 */
export function displayName(user?: {
  firstName?: string;
  lastName?: string;
  username?: string;
  name?: string;
} | null): string {
  if (!user) return "";
  return fullName(user) || user.username || user.name || "";
}

/**
 * The vendor-side identity: business name first, falling back to the
 * personal name. Use this on vendor chrome (nav header, account card, the
 * business side of a vendor-context chat) — everywhere else, use
 * displayName.
 */
export function vendorDisplayName(user?: {
  businessName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  name?: string;
} | null): string {
  if (!user) return "";
  if (user.businessName?.trim()) return user.businessName.trim();
  return displayName(user);
}
