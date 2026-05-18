import mongoose from "mongoose";

const ticketSchema = mongoose.Schema({
  // Event reference
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "event",
    required: true
  },

  // User who purchased the ticket
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  // Ticket details
  purchaseDate: { type: Date, default: Date.now },
  ticketPrice: { type: Number, required: true },

  // Ticket status
  isValid: { type: Boolean, default: true },

  // Unique ticket code for verification
  ticketCode: { type: String, unique: true, sparse: true },

  // Stripe payment tracking
  stripePaymentIntentId: { type: String },

  // Platform-charge / delayed-payout accounting (cents).
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
