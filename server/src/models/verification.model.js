import mongoose from "mongoose";

const verificationRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    // Optional: only the manual upload path has a document. The automated
    // paths verify against an identity check a payment provider already ran, so
    // there is no image for an admin to look at.
    documentImageUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    /**
     * How this decision was reached.
     *  manual                  — an admin looked at an uploaded ID
     *  stripe_connect          — Stripe completed its own KYC on the seller's
     *                            connected account
     *  paystack_account_name   — the seller's bank account holder name matched
     *                            their profile name
     *
     * The automated sources aren't a weaker check — they're the SAME identity
     * verification a payment provider already performed, which previously got
     * thrown away and re-done by eye.
     */
    source: {
      type: String,
      enum: ["manual", "stripe_connect", "paystack_account_name"],
      default: "manual",
      index: true,
    },
    autoApprovedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
      default: "",
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("VerificationRequest", verificationRequestSchema);
