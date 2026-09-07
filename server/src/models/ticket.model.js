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

  // Discount snapshot (same convention as tierName/ticketPrice above): what the
  // buyer actually paid and which code got them there, frozen at purchase time.
  // All major currency units. Absent on legacy tickets = face price was paid.
  amountPaid: { type: Number },
  discountCode: { type: String },
  discountAmount: { type: Number },

  // Ticket status
  isValid: { type: Boolean, default: true },

  // Unique ticket code for verification
  ticketCode: { type: String, unique: true, sparse: true },

  // Which provider collected this payment. Drives how refunds are issued.
  // "none" = a 100%-discounted ticket — nothing was charged anywhere.
  // "stripe" is legacy-readable only: it stopped collecting in Sep 2026, but
  // tickets sold on it are still refundable and must keep loading.
  provider: { type: String, enum: ["stripe", "paystack", "paypal", "none"], default: "paypal" },

  // Which provider settles the seller's share. PayPal collects and settles its
  // own outside Nigeria; Paystack does the same inside it. Drives the payout
  // job's transfer branch. No default: an unset value means the seller had no
  // payout rail at sale time, which must not masquerade as a real one. "wise"
  // and "stripe" are legacy-readable only (those rails are gone).
  payoutProvider: { type: String, enum: ["wise", "paystack", "stripe", "paypal"] },

  // Stripe payment tracking (historical sales only)
  stripePaymentIntentId: { type: String },

  // PayPal payment tracking. The ORDER id, not the capture id: it is what both
  // the confirm call and the capture webhook key off, so they dedupe.
  paypalOrderId: { type: String },
  paypalRefundId: { type: String },

  // Paystack payment tracking. The fee/net amounts below are stored in the
  // ticket's `currency` MAJOR units for Paystack (whole NGN, not kobo) and in
  // CENTS for PayPal and legacy Stripe — `currency` disambiguates, which is
  // exactly why PayPal stores cents rather than the major units its API uses.
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
