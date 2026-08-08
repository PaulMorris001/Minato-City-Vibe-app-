/**
 * Identity verification — one place that flips a user to `verified`.
 *
 * Verification used to be entirely manual: a user uploaded a photo of their ID
 * and an admin eyeballed it. That is slow, unauditable, and — for sellers —
 * redundant, because both live payout rails ALREADY run a real identity check:
 *
 *  - Stripe Connect performs full KYC/AML on every connected account before it
 *    will enable transfers.
 *  - Paystack returns the registered account holder's name when a bank account
 *    is resolved, which is a name-match against a KYC'd bank record.
 *
 * Both signals were being discarded. This service consumes them instead, so the
 * admin queue is left holding only genuine exceptions: name mismatches, and
 * non-sellers who want a badge without ever touching a payout rail.
 *
 * Manual review is untouched and remains the override for everything else.
 */

import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";
import VerificationRequest from "../models/verification.model.js";
import { notifyUser } from "./notification.service.js";

/**
 * Mark a user verified and record how it happened. Idempotent — a user who is
 * already verified is not re-notified.
 *
 * @param {string} userId
 * @param {object} opts
 * @param {"manual"|"stripe_connect"|"paystack_account_name"} opts.source
 * @param {string} [opts.reviewedBy]  admin username, for the manual path
 * @param {string} [opts.notes]
 * @returns {Promise<boolean>} true if this call is what flipped them
 */
export async function markVerified(userId, { source, reviewedBy, notes = "" }) {
  const user = await User.findById(userId).select("verified isVendor");
  if (!user) return false;

  const alreadyVerified = !!user.verified;

  await User.findByIdAndUpdate(userId, { verified: true });
  // Vendors carry their own copy of the flag for the business profile.
  Vendor.findOneAndUpdate({ user: userId }, { verified: true }).catch(() => {});

  // Keep the request queue consistent, whichever path got here — an admin
  // looking at the queue should never see "pending" for someone already
  // verified by a provider.
  const isAutomatic = source !== "manual";
  await VerificationRequest.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      status: "approved",
      source,
      reviewNotes: notes,
      reviewedAt: new Date(),
      reviewedBy: reviewedBy || (isAutomatic ? source : "admin"),
      ...(isAutomatic ? { autoApprovedAt: new Date() } : {}),
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  if (alreadyVerified) return false;

  const title = user.isVendor ? "Business Verified!" : "You're Verified!";
  await notifyUser(userId, {
    type: "verification_approved",
    title,
    body: user.isVendor
      ? "Your business has been verified. You now have a verification badge on your profile."
      : "Your identity has been verified. You now have a verification badge on your profile and faster approval on paid events.",
  });

  return true;
}

/**
 * Queue a manual review because an automated check didn't come out clean.
 *
 * Used when a name match fails: rather than silently leaving the seller
 * unverified with no explanation, put a request in front of an admin with the
 * mismatch recorded so they can approve it by hand (people legitimately have a
 * maiden name on their bank account, a middle name, a different transliteration).
 *
 * @param {string} userId
 * @param {{source: string, notes: string}} opts
 */
export async function queueManualReview(userId, { source, notes }) {
  const existing = await VerificationRequest.findOne({ user: userId });
  // Never downgrade an approved verification into a pending one.
  if (existing?.status === "approved") return;

  await VerificationRequest.findOneAndUpdate(
    { user: userId },
    { user: userId, status: "pending", source, reviewNotes: notes },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Normalize a name for comparison: lowercase, strip accents, punctuation and
 * honorifics, collapse whitespace.
 */
function normalizeName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof|chief|alhaji|hajia|engr|barr)\b\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a bank account holder's name plausibly belongs to this user.
 *
 * Word-set comparison rather than string equality, because banks and profiles
 * disagree constantly on order and completeness: "ADEYEMI JOHN OLUWASEUN" vs
 * "John Adeyemi" is the same person. Requires at least two shared name parts,
 * so a single common first name ("John") can't match a stranger.
 *
 * @param {string} accountName  from the bank, via Paystack
 * @param {string} profileName
 * @returns {boolean}
 */
export function namesMatch(accountName, profileName) {
  const a = normalizeName(accountName).split(" ").filter((w) => w.length > 1);
  const b = normalizeName(profileName).split(" ").filter((w) => w.length > 1);
  if (a.length === 0 || b.length === 0) return false;

  const shared = a.filter((word) => b.includes(word));

  // A single-word profile name (a username, effectively) can't be confirmed by
  // one shared word — too weak to grant a verification badge on.
  const required = Math.min(2, Math.min(a.length, b.length));
  return shared.length >= required && required >= 2;
}

export default { markVerified, queueManualReview, namesMatch };
