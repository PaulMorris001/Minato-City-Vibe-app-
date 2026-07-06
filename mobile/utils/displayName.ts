/**
 * The name to show for a user anywhere in the app. Vendors are shown by
 * their business name; everyone else by their username.
 */
export function displayName(user?: {
  isVendor?: boolean;
  businessName?: string;
  username?: string;
  name?: string;
} | null): string {
  if (!user) return "";
  if (user.isVendor && user.businessName?.trim()) return user.businessName.trim();
  return user.username || user.name || "";
}
