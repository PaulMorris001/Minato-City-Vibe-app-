import crypto from "crypto";

/**
 * URL-safe slug from a human title/username. Port of the algorithm in
 * mobile/utils/qrShare.ts — lowercase, strip accents, collapse anything
 * non-alphanumeric to "-". Returns "" when nothing latin survives (emoji-only
 * or fully non-latin input); callers leave the slug unset in that case and
 * links fall back to shareToken/_id.
 */
export function slugify(input) {
  if (typeof input !== "string") return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Find a slug not already taken on `Model`: try `base`, then `base-2` …
 * `base-50`, then give up and append 4 random hex chars. The unique sparse
 * index on the field is the concurrency backstop — this loop just keeps
 * collisions rare rather than guaranteeing them away. When `historyField` is
 * given (user slugHistory), candidates a renamed user still answers to are
 * rejected too. Takes the model as a parameter on purpose — no model imports
 * here, so no import cycles with the schemas that use it.
 */
export async function generateUniqueSlug(
  Model,
  base,
  { field = "slug", excludeId, historyField } = {}
) {
  if (!base) return null;

  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const excludeSelf = excludeId ? { _id: { $ne: excludeId } } : {};
    const taken = await Model.exists({ [field]: candidate, ...excludeSelf });
    if (taken) continue;
    if (historyField) {
      const inHistory = await Model.exists({
        [historyField]: candidate,
        ...excludeSelf,
      });
      if (inHistory) continue;
    }
    return candidate;
  }

  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}
