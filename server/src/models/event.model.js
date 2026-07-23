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
  // Virtual events have no physical venue; location is stored as "Online".
  isVirtual: { type: Boolean, default: false },
  // Optional meeting URL (Zoom/Meet/etc). Only returned to attendees.
  meetingLink: { type: String, default: "" },
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
  // Named price tiers ("Basic", "VIP", …) for public paid events — max 10,
  // organizer-defined names and prices, all in the event's `currency`.
  // When present, buyers pick a tier at checkout and `ticketPrice` mirrors the
  // cheapest tier so legacy display/sort code keeps working. Subdocument _ids
  // are the tierIds the payment flow references.
  ticketTiers: [
    {
      name: { type: String, trim: true, maxlength: 40 },
      price: { type: Number, min: 0 },
      // Per-tier ticket allocation. When set (> 0), sold-out is enforced against
      // this count for the tier (Ticket.countDocuments({ event, tierId })), and
      // the event's `maxGuests` mirrors the sum of tier quantities. Optional for
      // back-compat: legacy tiers with no `quantity` fall back to the shared
      // event-level `maxGuests` pool.
      quantity: { type: Number, min: 0 },
    },
  ],
  // Currency the organizer prices tickets in (USD for Stripe sellers, e.g. NGN
  // for Paystack sellers). Drives the provider charge currency.
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

  // Creator edits to an already-public event that touch "material" fields
  // (date, pricing, tiers, capacity, currency, paid flag) are held here until an
  // admin approves them — the live doc keeps serving the old values meanwhile.
  // Minor fields (title/description/photos/location/meetingLink) are applied to
  // the live doc immediately and never enter this holder. `reviewedBy` is the
  // admin username string (the admin JWT carries no user id — mirrors
  // verification.model.js).
  pendingEdits: {
    fields: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["none", "pending", "rejected"],
      default: "none",
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: String },
    rejectReason: { type: String },
  },

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
  // "awaiting_approval" = the hold window elapsed and a Payout record was created
  // for an admin to review; "released" = admin approved and the transfer ran.
  payoutStatus: {
    type: String,
    enum: ["none", "pending", "awaiting_approval", "released", "failed"],
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
