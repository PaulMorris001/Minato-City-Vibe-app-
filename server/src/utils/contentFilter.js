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
