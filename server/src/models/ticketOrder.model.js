import mongoose from "mongoose";

/**
 * A pending multi-ticket purchase (web guest/gift checkout). Created at payment
 * init to hold the per-ticket line items — chosen tier + the recipient email each
 * pass should be emailed to — since these don't fit cleanly in provider payment
 * metadata. At confirm we look the order up by `reference` (the Stripe
 * PaymentIntent id or Paystack transaction reference), fan out one ticket + pass
 * per item, and flip `status` to "paid". `status` also makes confirm idempotent.
 */
const ticketOrderItemSchema = mongoose.Schema(
  {
    tierId: { type: mongoose.Schema.Types.ObjectId },
    tierName: { type: String },
    price: { type: Number, required: true },
    recipientEmail: { type: String, required: true },
    recipientName: { type: String },
  },
  { _id: false }
);

const ticketOrderSchema = mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "event", required: true },
    // The payer (a guest user or a real account).
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },

    currency: { type: String, default: "USD" },
    total: { type: Number, required: true },
    provider: { type: String, enum: ["stripe", "paystack"], required: true },

    // Stripe PaymentIntent id / Paystack transaction reference. Unique so a
    // duplicate confirm can't double-fulfill.
    reference: { type: String, unique: true, sparse: true },

    items: { type: [ticketOrderItemSchema], required: true },

    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    ticketIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ticket" }],
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("ticketOrder", ticketOrderSchema);
