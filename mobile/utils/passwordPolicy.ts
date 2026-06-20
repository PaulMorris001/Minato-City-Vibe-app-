// Shared password strength policy. Keep this in lockstep with the server
// validator at server/src/utils/passwordPolicy.js so the client-side checklist
// and the server-side guard never disagree.
//
// Rule: at least 8 characters, and at least one of each — lowercase letter,
// uppercase letter, number, and symbol (any non-alphanumeric character).

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  key: "length" | "lower" | "upper" | "number" | "symbol";
  label: string;
  met: boolean;
}

/** Per-rule breakdown, used to render a live requirements checklist. */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { key: "length", label: "At least 8 characters", met: password.length >= PASSWORD_MIN_LENGTH },
    { key: "lower", label: "A lowercase letter", met: /[a-z]/.test(password) },
    { key: "upper", label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { key: "number", label: "A number", met: /[0-9]/.test(password) },
    { key: "symbol", label: "A symbol", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return passwordChecks(password).every((c) => c.met);
}

/** First unmet rule's message, or "" when the password is valid. */
export function passwordError(password: string): string {
  const failed = passwordChecks(password).find((c) => !c.met);
  if (!failed) return "";
  switch (failed.key) {
    case "length":
      return "Password must be at least 8 characters long.";
    case "lower":
      return "Password must include a lowercase letter.";
    case "upper":
      return "Password must include an uppercase letter.";
    case "number":
      return "Password must include a number.";
    case "symbol":
      return "Password must include a symbol.";
  }
}
