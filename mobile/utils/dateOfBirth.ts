/**
 * Client-side mirror of server/src/utils/dateOfBirth.js.
 *
 * The server is the authority — it rejects an under-age signup regardless of
 * what the app sends. This exists so the user finds out on the step they're
 * standing on instead of after submitting the whole form, and so signup and
 * edit-profile can't disagree about the rule.
 *
 * Dates are held as "YYYY-MM-DD" strings: that's what the signup wizard's
 * value map stores, and it round-trips to the API without a timezone shifting
 * a birthday across midnight.
 */

export const MIN_AGE_YEARS = 13;

const MAX_AGE_YEARS = 120;

/** Whole years elapsed, calendar-correct. Mirrors the server's ageInYears. */
export function ageInYears(dob: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const monthDelta = on.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Parse "YYYY-MM-DD" as a LOCAL date — `new Date(str)` would treat it as UTC. */
export function parseDobString(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects impossible days that Date would silently roll over (e.g. Feb 30).
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1) return null;
  return date;
}

export function toDobString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Human-readable for display fields. Empty string in, empty string out. */
export function formatDob(value: string): string {
  const date = parseDobString(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The latest date a picker should allow: the day someone turns MIN_AGE_YEARS. */
export function maxDobDate(on: Date = new Date()): Date {
  return new Date(on.getFullYear() - MIN_AGE_YEARS, on.getMonth(), on.getDate());
}

/** Null when acceptable, otherwise a user-facing message. */
export function dobError(value: string): string | null {
  const date = parseDobString(value);
  if (!date) return "Pick your date of birth.";

  const now = new Date();
  if (date.getTime() > now.getTime()) return "Date of birth can't be in the future.";

  const age = ageInYears(date, now);
  if (age < MIN_AGE_YEARS) {
    return `You must be at least ${MIN_AGE_YEARS} years old to use OurCityvibe.`;
  }
  if (age > MAX_AGE_YEARS) return "Please check the year of birth.";

  return null;
}
