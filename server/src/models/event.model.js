import mongoose from "mongoose";

const eventSchema = mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  // Precise street address / venue so attendees know exactly where to go
  address: { type: String, default: "" },
  // Structured location captured from the picker (location stays the display string)
  city: { type: String },
  state: { type: String },
  country: { type: String },
  image: { type: String, default: "" }, // primary/cover image (first of images)
  images: { type: [String], default: [] }, // gallery — all event photos
  description: { type: String, default: "" },

  // Creator of the event
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  // Co-hosts who can manage the event (invite, manage vendors, edit) alongside the creator
  cohosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Unique users (excluding the creator) who opened the event detail — drives
  // the "N seen" count shown to the organizer.
  viewedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Confirmed attendees (accepted the invite or joined via link/purchase)
  invitedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Users who have been invited but have not yet responded
  pendingInvites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Event visibility
  isPublic: { type: Boolean, default: false },

  // Pricing options (only for public events)
  isPaid: { type: Boolean, default: false },
  ticketPrice: { type: Number, default: 0 },
  // Currency the organizer prices tickets in (USD for Stripe sellers, e.g. NGN
  // for Flutterwave sellers). Drives the provider charge currency.
  currency: { type: String, default: "USD" },
  maxGuests: { type: Number, default: 0 },

  // Group chat for this event (auto-created when first user is invited)
  groupChatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "chat",
    default: null
  },

  // Shareable link token
  shareToken: { type: String, unique: true, sparse: true },

  // RSVP: users who confirmed attendance
  rsvpUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Users who have requested to join an invite-only event. Distinct from
  // `pendingInvites` (which is organizer-initiated) — these are user-initiated
  // requests the organizer can accept or decline.
  joinRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Vendors attached to this event by the creator
  vendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "vendor"
  }],

  // Vendor invitations awaiting a response. A vendor with a linked user account
  // is invited (status "pending") and only moves into `vendors` once accepted.
  // Vendors without a linked account are added straight to `vendors`.
  vendorInvites: [{
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "vendor", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    invitedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
  }],

  // Event status
  isActive: { type: Boolean, default: true },

  // Prevents the 24-hour reminder from firing more than once
  reminderSent: { type: Boolean, default: false },

  // Approval queue for paid events. Free events default to "approved" and never
  // hit the queue. Paid events from an unapproved organizer start as "pending".
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "approved",
  },
  approvalReviewedAt: { type: Date },
  approvalReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  approvalRejectReason: { type: String },

  // Paid events must include proof the venue is real — booking confirmation,
  // signed contract, screenshot of reservation, etc. Required for paid events
  // at creation time; surfaced to admins in the approval queue.
  venueProofImage: { type: String, default: "" },

  // Event cancellation tracking — set when the organizer (or admin) cancels.
  // Triggers automatic refunds for all valid tickets.
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  cancellationReason: { type: String },

  // Delayed-payout tracking. For paid events we charge the platform account
  // first and transfer to the seller's Connect account `payoutDelayHours`
  // after `date` via a scheduled job.
  payoutStatus: {
    type: String,
    enum: ["none", "pending", "released", "failed"],
    default: "none",
  },
  payoutDelayHours: { type: Number, default: 48 },
  payoutReleasedAt: { type: Date },
  payoutTransferIds: [{ type: String }],
  payoutError: { type: String },
}, {
  timestamps: true
});

// Generate share token before saving
eventSchema.pre('save', function(next) {
  if (!this.shareToken) {
    this.shareToken = new mongoose.Types.ObjectId().toString();
  }
  next();
});

export default mongoose.model("event", eventSchema);
