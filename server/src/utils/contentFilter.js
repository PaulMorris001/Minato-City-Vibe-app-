import { Filter } from "bad-words";

const filter = new Filter();

export const containsProfanity = (text) => {
  if (!text || typeof text !== "string") return false;
  try {
    return filter.isProfane(text);
  } catch {
    return false;
  }
};

export const cleanText = (text) => {
  if (!text || typeof text !== "string") return text;
  try {
    return filter.clean(text);
  } catch {
    return text;
  }
};

/**
 * Returns true if `text` reads like a real, human-meaningful name rather than a
 * payload or keyboard-mash. Rejects values that:
 *   - are empty / whitespace-only,
 *   - contain no letters at all (pure symbols/numbers),
 *   - look like a JSON/object literal or contain MongoDB operators,
 *   - are mostly non-alphanumeric punctuation.
 * Used to validate event titles so input like `{ "$ne": null }` can't be
 * stored and displayed as a title.
 */
export const isMeaningfulText = (text) => {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;

  // Must contain at least one letter (any script / accented chars included).
  const letters = (trimmed.match(/\p{L}/gu) || []).length;
  if (letters === 0) return false;

  // Reject obvious JSON/object/operator payloads.
  if (/^[\[{].*[\]}]$/s.test(trimmed)) return false;
  if (/\$(ne|eq|gt|gte|lt|lte|in|nin|or|and|where|regex|exists)\b/i.test(trimmed)) return false;

  // At least 40% of characters should be letters/digits/spaces — filters out
  // strings that are mostly punctuation or symbol soup.
  const meaningful = (trimmed.match(/[\p{L}\p{N}\s]/gu) || []).length;
  if (meaningful / trimmed.length < 0.4) return false;

  return true;
};

/**
 * Throws a 400 Error if any provided field is not meaningful text.
 * Each entry is { field: "Title", value: "..." }.
 */
export const assertMeaningful = (entries) => {
  for (const { field, value } of entries) {
    if (!isMeaningfulText(value)) {
      const err = new Error(
        `Please enter a valid ${field.toLowerCase()}. Avoid code, symbols, or placeholder text.`
      );
      err.statusCode = 400;
      throw err;
    }
  }
};

/**
 * Throws an Error with a clear message if any of the provided text fields
 * contain profanity. Each entry is { field: "title", value: "..." }.
 */
export const assertClean = (entries) => {
  for (const { field, value } of entries) {
    if (containsProfanity(value)) {
      const err = new Error(
        `${field} contains language that violates our content policy. Please revise and try again.`
      );
      err.statusCode = 400;
      throw err;
    }
  }
};
