// Shared password strength policy. Keep this in lockstep with the mobile
// validator at mobile/utils/passwordPolicy.ts so the client-side checklist and
// the server-side guard never disagree.
//
// Rule: at least 8 characters, and at least one of each — lowercase letter,
// uppercase letter, number, and symbol (any non-alphanumeric character).

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES_TEXT =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol.";

/**
 * @param {string} password
 * @returns {{ ok: boolean, message: string }}
 */
export function validatePassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: "Password must be at least 8 characters long." };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: "Password must include a lowercase letter." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "Password must include an uppercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Password must include a number." };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: "Password must include a symbol." };
  }
  return { ok: true, message: "" };
}
