/**
 * One-off backfill: mark every Apple/Google account as email-verified.
 *
 * Sign-in with Apple and Google both prove the user controls the address, but
 * the auth handlers never set `emailVerifiedAt`, so every OAuth account has sat
 * permanently "unverified". Their only route out was Settings → Verify Email,
 * which mails an OTP — a dead end for Apple private-relay addresses
 * (`@privaterelay.appleid.com`) and, in practice, the reason a real signup
 * could not verify. New OAuth signups are now verified at creation
 * (auth.controller.js); this script fixes the accounts created before that.
 *
 * Verification here means *email* verification only. The separate `verified`
 * boolean (government-ID review) is never touched.
 *
 * Idempotent: only accounts with no `emailVerifiedAt` are matched, so a re-run
 * reports 0 changes.
 *
 * Usage:
 *   node scripts/verify-oauth-accounts.mjs --dry-run   # report only
 *   node scripts/verify-oauth-accounts.mjs             # apply
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/user.model.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Match on the provider flag *and* the provider ids: an account linked to
// Google after signing up locally keeps authProvider "local" in some older
// rows, and either signal is proof enough.
const FILTER = {
  $or: [
    { authProvider: { $in: ["google", "apple"] } },
    { googleId: { $exists: true, $ne: null } },
    { appleId: { $exists: true, $ne: null } },
  ],
  emailVerifiedAt: { $in: [null, undefined] },
};

async function run() {
  await connectDB();

  const candidates = await User.find(FILTER)
    .select("_id email authProvider googleId appleId")
    .lean();

  const byProvider = candidates.reduce((acc, u) => {
    const key = u.appleId ? "apple" : u.googleId ? "google" : u.authProvider;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const relayCount = candidates.filter((u) =>
    (u.email || "").endsWith("@privaterelay.appleid.com")
  ).length;

  console.log(
    `Found ${candidates.length} unverified OAuth account(s)${DRY_RUN ? " (dry run)" : ""}`
  );
  console.log(`  by provider: ${JSON.stringify(byProvider)}`);
  console.log(`  Apple private-relay addresses: ${relayCount}`);
  for (const u of candidates.slice(0, 10)) {
    console.log(`  · ${u.email} (${u.appleId ? "apple" : "google"})`);
  }
  if (candidates.length > 10) console.log(`  … and ${candidates.length - 10} more`);

  if (!DRY_RUN && candidates.length > 0) {
    const result = await User.updateMany(FILTER, {
      $set: { emailVerifiedAt: new Date() },
      // Any pending signup OTP is moot once the account is verified.
      $unset: { signupOTP: "", signupOTPExpires: "" },
    });
    console.log(`Verified ${result.modifiedCount} account(s).`);
  }

  await mongoose.connection.close();
  console.log(DRY_RUN ? "Dry run complete (no writes)." : "Backfill complete.");
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
