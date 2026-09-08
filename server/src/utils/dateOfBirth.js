/**
 * Date-of-birth parsing and the age floor, shared by register (via
 * PendingSignup) and the profile update handler so the two can't drift.
 *
 * 13 is not arbitrary: mobile/app/terms.tsx already tells every user "You must
 * be at least 13 years old to use OurCityvibe". Collecting a birthday and then
 * not checking it would leave that promise unenforced.
 */

export const MIN_AGE_YEARS = 13;

/** Oldest plausible birthday. Guards against a typo'd century, not fraud. */
const MAX_AGE_YEARS = 120;

/** Whole years elapsed from `dob` to `on`, calendar-correct (leap years included). */
export function ageInYears(dob, on = new Date()) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * Validate a client-supplied date of birth.
 *
 * Returns `{ date }` on success or `{ error }` with a user-facing message.
 * An absent value is NOT an error — callers decide whether it's required, the
 * same way `fullName` is optional in register so older app builds keep working.
 */
export function parseDateOfBirth(value) {
  if (value === undefined || value === null || value === "") return { date: null };

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return { error: "That date of birth isn't a valid date." };
  }

  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return { error: "Date of birth can't be in the future." };
  }

  const age = ageInYears(date, now);
  if (age < MIN_AGE_YEARS) {
    return { error: `You must be at least ${MIN_AGE_YEARS} years old to use OurCityvibe.` };
  }
  if (age > MAX_AGE_YEARS) {
    return { error: "Please check the year of birth." };
  }

  return { date };
}
