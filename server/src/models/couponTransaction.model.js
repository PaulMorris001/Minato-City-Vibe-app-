import mongoose from "mongoose";

/**
 * Append-only ledger of every change to a user's OurCityVibe credit balance —
 * backs the "history of spending" list on mobile/app/wallet-rewards.tsx.
 *
 * The balance itself still lives on User.couponBalanceNGN/USD (see
 * services/payments/coupon.service.js) — this collection is a read-side
 * record of *why* it changed, never the source of truth for its current
 * value. Every balance-changing function in coupon.service.js writes one row
 * here in the same operation that touches the balance, so the two can never
 * drift.
 */
const couponTransactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    // "earned" (raffle win), "spent" (checkout), "refunded" (order
    // cancelled/declined after a coupon was reserved), "expired" (30-day
    // inactivity sweep), "adjusted" (an admin correction that reduced a
    // previously-credited amount).
    type: {
      type: String,
      enum: ["earned", "spent", "refunded", "expired", "adjusted"],
      required: true,
    },
    // Always positive — the ledger's `type` carries the sign, not this field.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["NGN", "USD"], required: true },
    // Human-readable line for the wallet history list, e.g. "1st place —
    // Birthday Raffle" or "Order payment".
    description: { type: String, required: true, trim: true },
    // Set for spent/refunded rows — which order the credit went toward.
    order: { type: mongoose.Schema.Types.ObjectId, ref: "order" },
  },
  { timestamps: true }
);

couponTransactionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("couponTransaction", couponTransactionSchema);
