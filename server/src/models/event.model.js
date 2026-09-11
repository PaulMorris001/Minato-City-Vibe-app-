import mongoose from "mongoose";
import { mediaArrayLimit } from "../utils/mediaLimit.js";
import { slugify, generateUniqueSlug } from "../utils/slug.js";

const eventSchema = mongoose.Schema({
  title: { type: String, required: true },
  // Start of the event.
  date: { type: Date, required: true },
  // Optional end. When unset the event is a single moment: `date` is the only
  // date it has, and it counts as over a day later (see utils/eventLifecycle.js).
  // Organizers routinely sell at the door, so the grace is deliberate.
  endDate: { type: Date, default: null },
  location: { type: String, required: true },
  // Precise street address / venue so attendees know exactly where to go
  address: { type: String, default: "" },
  // Structured location captured from the picker (location stays the display string)
  city: { type: String },
  state: { type: String },
  country: { type: String },
  // Map pin for the venue. Optional — events created before 1.2.0 have none and
  // the app geocodes their address on the device instead. Same shape as
  // externalEvent.model.js so both feed one map component.
  geo: {
    // GeoJSON Point; stored as [lng, lat] per spec
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },
  // Virtual events have no physical venue; location is stored as "Online".
  isVirtual: { type: Boolean, default: false },
  // Optional meeting URL (Zoom/Meet/etc). Only returned to attendees.
  meetingLink: { type: String, default: "" },
  image: { type: String, default: "" }, // primary/cover image (first of images)
  // Gallery — photos and videos, max MAX_MEDIA_ITEMS. Each entry is a
  // Cloudinary URL whose delivery path identifies the kind.
  images: {
    type: [String],
    default: [],
    validate: mediaArrayLimit("Event photos"),
  },
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

  // Organizer opt-in for public attendance numbers. Off by default: headcount
  // and capacity are the host's numbers (a half-empty room is not something an
  // organizer wants broadcast), so they stay organizer-only unless the host
  // deliberately turns them on as social proof. Never covers the guest LIST —
  // who is coming is other attendees' data and stays private either way.
  // See applyAttendanceVisibility in controllers/event.controller.js.
  showAttendance: { type: Boolean, default: false },

  // Group chat for this event (auto-created when first user is invited)
  groupChatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "chat",
    default: null
  },

  // Shareable link token
  shareToken: { type: String, unique: true, sparse: true },

  // Human-readable share slug generated from the title once at creation.
  // Never regenerated on title edits so printed QR codes and sent links stay
  // valid. Unset (sparse) when the title has no latin characters — links fall
  // back to shareToken/_id.
  slug: { type: String, unique: true, sparse: true },

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

  // Approval queue for paid events. Free and private events default to
  // "approved" and never hit the queue. EVERY public paid event starts as
  // "pending" — no matter how many the organizer has run before — because
  // ticket price and capacity are uncapped and review is what replaces them.
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

  // Organizer's manual stop switch for ticket sales. Distinct from cancelling:
  // it stops NEW sales, refunds nothing, and can be flipped back on.
  ticketSalesClosedAt: { type: Date, default: null },
  ticketSalesClosedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },

  // Event cancellation tracking — set when the organizer (or admin) cancels.
  // Triggers automatic refunds for all valid tickets.
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  cancellationReason: { type: String },

  // A cancellation the organizer asked for while tickets were outstanding,
  // held for admin review. Refunding real buyers is a decision someone signs
  // off on, not a one-tap action — so the live event keeps its state (minus
  // ticket sales, which close on request) until an admin approves and the
  // refunds run. Shape mirrors `pendingEdits`, including `reviewedBy` being
  // the admin USERNAME string: the admin JWT carries no user id.
  cancellationRequest: {
    status: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    reason: { type: String },
    requestedAt: { type: Date },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    // Outstanding refundable tickets when the request was made — what the
    // reviewer is actually deciding about.
    ticketsAtRequest: { type: Number },
    // True when the request itself closed ticket sales, so a rejection can put
    // them back exactly as the organizer had them.
    closedSalesOnRequest: { type: Boolean, default: false },
    reviewedAt: { type: Date },
    reviewedBy: { type: String },
    rejectReason: { type: String },
  },

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
  payoutDelayHours: { type: Number, default: 24 },
  payoutReleasedAt: { type: Date },
  payoutTransferIds: [{ type: String }],
  payoutError: { type: String },

  // Birthday Raffle campaign — set at creation when the host went through the
  // "Create Birthday Event & Enter" flow. Eligibility/score are computed on
  // read from invitedUsers/pendingInvites (see birthdayRaffle.controller.js)
  // rather than duplicated here, so they can never drift from the guest list.
  // `raffleWinnerRank` is the one piece of state that doesn't derive from
  // anything else — an admin sets it by hand once the campaign ends.
  isBirthdayRaffle: { type: Boolean, default: false },
  // 1..N where N is the owning campaign's prize-tier count (raffleCampaign
  // .prizes). Validated against that count in admin.controller setRaffleWinner,
  // so no fixed enum here.
  raffleWinnerRank: { type: Number, default: null, min: 1 },
}, {
  timestamps: true
});

// The public-events feed and unified search both filter on
// (isPublic, isActive, date) and narrow by city. Nothing on this collection was
// indexed at all, so every Discover load was a full scan — these help the whole
// browse path, not just search. (Text search itself stays on $regex, which
// can't use an index; see search.controller.js for why $text is the wrong tool
// for type-ahead.)
eventSchema.index({ isPublic: 1, isActive: 1, date: 1 });
eventSchema.index({ city: 1, date: 1 });

// Generate share token + slug before saving. Async hook — mongoose waits on
// the returned promise, so no next() callback is needed.
eventSchema.pre('save', async function() {
  if (!this.shareToken) {
    this.shareToken = new mongoose.Types.ObjectId().toString();
  }
  if (!this.slug && this.title) {
    const base = slugify(this.title);
    // Only assign when a slug was produced — an explicit null would still be
    // indexed by the sparse unique index and collide with other null slugs.
    const slug = await generateUniqueSlug(this.constructor, base, {
      excludeId: this._id,
    });
    if (slug) this.slug = slug;
  }
});

export default mongoose.model("event", eventSchema);
