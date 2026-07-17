import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "service",
      required: true,
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    message: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "cancelled"],
      default: "pending",
    },
    // Snapshot of price at time of booking so vendor price changes don't affect history
    priceSnapshot: {
      amount: { type: Number },
      currency: { type: String },
    },

    // Payment is collected only after the vendor confirms the booking.
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
    // Which provider collected the payment + accounting (interpreted in
    // priceSnapshot.currency major units for Paystack, cents for Stripe).
    provider: { type: String, enum: ["stripe", "paystack"] },
    // Which provider settled the vendor's net — Stripe-collected bookings
    // settle via Wise; Paystack collects and settles its own.
    payoutProvider: { type: String, enum: ["wise", "paystack"] },
    platformFee: { type: Number, default: 0 },
    vendorNet: { type: Number, default: 0 },
    // Provider references for the charge / payout / refund.
    paymentRef: { type: String },
    transferRef: { type: String },
    refundRef: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ vendor: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });

export const Booking = mongoose.model("booking", bookingSchema);
