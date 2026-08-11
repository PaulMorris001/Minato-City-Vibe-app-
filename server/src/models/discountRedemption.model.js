import mongoose from "mongoose";

/**
 * One buyer's use of a discount code. Created as "pending" at payment init
 * (the reserve step that increments the code's counter) and flipped to
 * "applied" once the payment settles. Stale pendings are released by the
 * cleanup job. The unique { code, user } index enforces once-per-buyer —
 * guest checkout tokens carry a real user id, so this covers guests too.
 */
const discountRedemptionSchema = mongoose.Schema(
  {
    code: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "discountCode",
      required: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "event",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    // Stripe PaymentIntent id | Paystack reference | "free-<id>" for 100%-off.
    // Set (and refreshed on retry) at payment init.
    reference: { type: String, index: true },

    status: { type: String, enum: ["pending", "applied"], default: "pending" },

    // Major currency units, snapshot of what this redemption knocked off.
    amountDiscounted: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Once per buyer per code.
discountRedemptionSchema.index({ code: 1, user: 1 }, { unique: true });

export default mongoose.model("discountRedemption", discountRedemptionSchema);
