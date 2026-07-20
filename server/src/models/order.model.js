import mongoose from "mongoose";

/**
 * A multi-item order placed by a client against a single vendor's catalogue.
 *
 * This is the payable counterpart of the client-side cart. Flow:
 *   requested → the client checked out; an order card is posted to the vendor chat
 *   quoted    → the vendor added any extra fees and sent a payable invoice
 *   paid      → the client paid; funds collected into the platform balance
 *   cancelled → client cancelled before paying
 *   declined  → vendor declined the request
 *
 * The payment block mirrors booking.model.js so the order plugs straight into
 * the /payments/init|confirm dispatcher, computeSplit, and the payout pipeline.
 * Prices are always snapshotted / re-derived server-side, never trusted from
 * the client.
 */
const orderItemSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "service",
      required: true,
    },
    // Snapshot so later catalogue edits don't rewrite order history.
    name: { type: String, required: true },
    priceSnapshot: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
    },
    quantity: { type: Number, default: 1, min: 1 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // The vendor's User account (matches Service.vendor), not the Vendor doc.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // The conversation this order lives in.
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chat",
    },

    items: { type: [orderItemSchema], required: true },

    // Server-computed from the item snapshots (Σ amount × quantity).
    itemsSubtotal: { type: Number, default: 0 },
    // Vendor-added at quote time (delivery, setup, etc.).
    additionalFees: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],
    // Server-computed: itemsSubtotal + Σ additionalFees. This is the payable amount.
    total: { type: Number, default: 0 },
    // Single currency — one vendor per order ⇒ currencyForUser(vendor).
    currency: { type: String, required: true },

    status: {
      type: String,
      enum: ["requested", "quoted", "paid", "cancelled", "declined"],
      default: "requested",
    },

    // ── Payment block (mirrors booking.model.js) ──
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
    provider: { type: String, enum: ["stripe", "paystack"] },
    payoutProvider: { type: String, enum: ["wise", "paystack"] },
    platformFee: { type: Number, default: 0 },
    vendorNet: { type: Number, default: 0 },
    paymentRef: { type: String },
    transferRef: { type: String },
    refundRef: { type: String },
    paidAt: { type: Date },

    // The two order cards posted into chat (request summary + payable invoice).
    requestMessage: { type: mongoose.Schema.Types.ObjectId, ref: "message" },
    invoiceMessage: { type: mongoose.Schema.Types.ObjectId, ref: "message" },
  },
  { timestamps: true }
);

orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

export const Order = mongoose.model("order", orderSchema);
