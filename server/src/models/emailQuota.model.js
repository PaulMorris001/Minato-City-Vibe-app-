import mongoose from "mongoose";

/**
 * Broadcast emails sent per UTC day, shared by every broadcast. Stored rather
 * than kept in memory so a restart mid-day can't reset the count and blow
 * through the mailbox's daily sending limit — which would also stop password
 * resets and signup codes, since they go out through the same account.
 */
const emailQuotaSchema = mongoose.Schema({
  day: { type: String, required: true, unique: true }, // "YYYY-MM-DD" (UTC)
  count: { type: Number, default: 0 },
});

export default mongoose.model("emailQuota", emailQuotaSchema);
