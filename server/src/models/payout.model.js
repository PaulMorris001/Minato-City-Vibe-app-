import mongoose from "mongoose";

/**
 * A vendor payout awaiting (or past) admin approval.
 *
 * Every paid sale now collects into the platform balance and creates one of
 * these instead of transferring money immediately. An admin reviews the queue
 * and approves — only then does the actual provider transfer run. This is the
 * single gate the "admins approve payouts" flow hinges on.
 *
 * `amount` is stored in MAJOR units of `currency` for every live rail:
 *   - wise     → major USD (source amount; Wise converts on the quote)
 *   - stripe   → major USD (converted to cents at the Transfers API boundary)
 *   - paystack → major NGN (converted to kobo at the API boundary)
 * CAUTION: "stripe" docs created BEFORE the Connect rail was reinstated store
 * CENTS, from the era when Stripe Connect used per-charge destination transfers.
 * executePayout refuses to run any "stripe" payout predating that cutover — see
 * the date guard in payout.service.js. "flutterwave" is dead and unexecutable.
 * `displayAmount`/`displayCurrency` are the human-readable major-unit values for
 * the admin dashboard.
 */
const payoutSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },

    // What was sold. `relatedId` points at the ticket-bearing event, guide, booking, or order.
    relatedType: { type: String, enum: ["ticket", "guide", "booking", "order"], required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Settlement rail used to pay the vendor out. "stripe" (Connect) is live
    // again for sellers in the cross-border-payouts footprint. "flutterwave" is
    // legacy-read-only — old docs must still save, e.g. on rejection — and
    // executePayout refuses to run it.
    provider: {
      type: String,
      enum: ["wise", "paystack", "stripe", "flutterwave"],
      required: true,
    },

    amount: { type: Number, required: true }, // execution-native units (see model doc)
    currency: { type: String, required: true },
    displayAmount: { type: Number }, // major units, for admin UI
    displayCurrency: { type: String },

    status: {
      type: String,
      enum: ["awaiting_approval", "processing", "paid", "failed", "rejected"],
      default: "awaiting_approval",
    },

    // Idempotency: one payout per logical sale (also the provider transfer ref).
    reference: { type: String, unique: true, required: true },
    transferId: { type: String },

    approvedBy: { type: String }, // admin username (admins aren't user docs)
    approvedAt: { type: Date },
    rejectedReason: { type: String },
    error: { type: String },

    // Optional context to help execution / the admin view.
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    stripePaymentIntentId: { type: String }, // for Stripe source_transaction
  },
  { timestamps: true }
);

payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ vendor: 1, createdAt: -1 });

export default mongoose.model("payout", payoutSchema);
