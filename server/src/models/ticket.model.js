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
  stripePaymentIntentId: { type: String }
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
