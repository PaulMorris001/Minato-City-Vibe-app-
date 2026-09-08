import mongoose from "mongoose";

/**
 * A signup that has been submitted but not yet proven.
 *
 * Registration used to create the User outright and treat the OTP screen as a
 * soft gate, which meant abandoning that screen left a permanent unverified
 * account squatting on an email and username the person may not even own. The
 * form data now lives here until the emailed code is entered; only then is a
 * real User created.
 *
 * Nothing here reserves the username — see verifySignup, which re-checks both
 * uniqueness constraints against User at the moment of creation.
 */
const pendingSignupSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // Split into firstName/lastName (see utils/personName.js) when the real
    // User is created in verifySignup. Optional so an app build older than
    // this field can still complete /register — that account just lands on
    // the "complete your name" gate on its next login, like any pre-existing
    // account (see login.tsx / (tabs)/_layout.tsx).
    fullName: { type: String, default: "", trim: true },
    // Carried through to the User in verifySignup. Optional for the same
    // reason as fullName above — an older app build sends no birthday, and
    // that account gets nudged by the profile setup checklist instead.
    dateOfBirth: { type: Date, default: null },
    // Unique so a second attempt for the same address replaces the first
    // (upsert) rather than accumulating stale pending rows with live codes.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Already bcrypt-hashed by register. A plaintext password must never reach
    // this collection, even though it is short-lived.
    passwordHash: { type: String, required: true },
    vendorSignupPending: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, required: true },
    otp: { type: String, required: true },
    otpExpires: { type: Date, required: true },
    // Guards against someone brute-forcing a 6-digit code on one pending row.
    attempts: { type: Number, default: 0 },
    // Drives the TTL below. An explicit field rather than a TTL on `createdAt`:
    // Mongoose puts `createdAt` in $setOnInsert for a timestamped upsert, so
    // also $set-ing it to refresh the window is a MongoDB path conflict.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Abandoned signups delete themselves, so no cleanup job is needed. Callers set
// `expiresAt` further out than the 10-minute OTP so a resend can refresh the
// code on an existing row instead of racing the row's own expiry.
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PendingSignup", pendingSignupSchema);
