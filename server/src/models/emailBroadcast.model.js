import mongoose from "mongoose";

/**
 * One admin broadcast email (admin "Email Users" page) and its delivery
 * progress. Sending is done by jobs/emailBroadcast.job.js, a little at a time
 * under a shared daily cap, so a big send can take more than a day — this doc
 * is the resumable state: the recipient snapshot plus how far through it we are.
 *
 * Recipients are snapshotted as ids at creation (not re-queried each tick) so
 * the audience is exactly what the admin previewed and nobody is emailed
 * twice if they change location mid-send. Opt-outs are still re-checked at
 * send time.
 */
const emailBroadcastSchema = mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    ctaLabel: { type: String, trim: true, default: "" },
    ctaUrl: { type: String, trim: true, default: "" },
    audienceSummary: { type: String, default: "Everyone" },
    sentBy: { type: String, default: "admin" },

    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    total: { type: Number, default: 0 },
    // Index into `recipients` of the next one to process.
    nextIndex: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    // Unsubscribed, no email, banned or a guest-checkout-only account.
    skipped: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["queued", "sending", "paused_daily_cap", "done", "cancelled"],
      default: "queued",
    },
    // Claim token so two server instances can't work the same broadcast.
    lockedUntil: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailBroadcastSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("emailBroadcast", emailBroadcastSchema);
