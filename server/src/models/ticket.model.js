import mongoose from "mongoose";

const ticketSchema = mongoose.Schema({
  // Event reference
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "event",
    required: true
  },

  // The ticket holder / attendee — whose account the pass belongs to. For a
  // gifted ticket this is the recipient (a guest user keyed by their email), NOT
  // the payer.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  // Who paid for the ticket, when different from `user` (gifts / buying for
  // others). Defaults to the holder for a normal self-purchase.
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  },

  // The email the QR pass was sent to (recipient for gifts, else the buyer's).
  recipientEmail: { type: String },

  // Ticket details
  purchaseDate: { type: Date, default: Date.now },
  ticketPrice: { type: Number, required: true },

  // Tier purchased (events with ticketTiers). Name/price are snapshotted so the
  // ticket stays meaningful even if the event's tiers are later edited.
  tierId: { type: mongoose.Schema.Types.ObjectId },
  tierName: { type: String },

  // Ticket status
  isValid: { type: Boolean, default: true },

  // Unique ticket code for verification
  ticketCode: { type: String, unique: true, sparse: true },

  // Which provider collected this payment. Drives how refunds are issued.
  provider: { type: String, enum: ["stripe", "paystack"], default: "stripe" },

  // Which provider settles the seller's share. Stripe-collected sales settle
  // via Wise; Paystack collects and settles its own. Drives the payout job's
  // transfer branch.
  payoutProvider: { type: String, enum: ["wise", "paystack"], default: "wise" },

  // Stripe payment tracking
  stripePaymentIntentId: { type: String },

  // Paystack payment tracking. Amounts below are interpreted in the ticket's
  // `currency` major units for Paystack (whole NGN, not kobo), and in cents
  // for Stripe — `currency` disambiguates.
  paystackReference: { type: String },
  paystackRefundId: { type: String },
  currency: { type: String, default: "usd" },

  // Platform-charge / delayed-payout accounting.
  // Stripe: cents. Paystack: major currency units.
  // Set when the ticket is created so the payout job knows what to transfer.
  platformFeeCents: { type: Number, default: 0 },
  sellerNetCents: { type: Number, default: 0 },

  // Set true once the payout job successfully transfers the seller's share.
  transferred: { type: Boolean, default: false },
  transferId: { type: String },

  // Refund tracking
  refunded: { type: Boolean, default: false },
  refundedAt: { type: Date },
  stripeRefundId: { type: String },
}, {
  timestamps: true
});

// Generate unique ticket code before saving
ticketSchema.pre('save', function(next) {
  if (!this.ticketCode) {
    this.ticketCode = new mongoose.Types.ObjectId().toString();
  }
  next();
});

export default mongoose.model("ticket", ticketSchema);
