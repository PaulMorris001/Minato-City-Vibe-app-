/**
 * Split a single "full name" input (signup, OAuth providers, the
 * complete-your-name gate) into firstName/lastName. The first word is the
 * first name; everything after it is the last name — good enough for the
 * common case and never throws on an unusual name (a one-word name just gets
 * an empty lastName rather than being rejected).
 */
export function splitFullName(fullName) {
  const words = String(fullName || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: words[0],
    lastName: words.slice(1).join(" "),
  };
}
