import mongoose from "mongoose";
import { slugify, generateUniqueSlug } from "../utils/slug.js";

const userSchema = mongoose.Schema({
  // Display case is preserved (e.g. "JohnDoe"), but uniqueness and lookups are
  // case-insensitive — enforced at the application layer in the auth controller
  // and via case-insensitive queries (see utils/escapeRegex.js). This avoids a
  // forced data migration on existing mixed-case usernames. To additionally
  // enforce at the DB layer, dedupe existing rows then add a unique index with
  // collation { locale: "en", strength: 2 }.
  username: { type: String, required: true, trim: true },
  // Human-readable share slug generated from the username. Regenerated on
  // username change (see auth.controller updateProfilePicture), with the old
  // slug pushed onto slugHistory so already-shared profile links keep
  // resolving. Unset (sparse) for non-latin usernames.
  slug: { type: String, unique: true, sparse: true },
  slugHistory: { type: [String], index: true, default: [] },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: false }, // Optional for OAuth users

  // OAuth authentication fields
  authProvider: { type: String, enum: ['local', 'google', 'apple'], default: 'local' },
  googleId: { type: String, sparse: true, unique: true },
  appleId: { type: String, sparse: true, unique: true },

  // User is always a client by default, can optionally become a vendor
  isVendor: { type: Boolean, default: false },

  // Set when someone signs up *as a business* rather than upgrading later.
  // A vendor account can't exist until the business details are filled in
  // (becomeVendor needs a name, type and city), and that form comes after email
  // verification — so this records the intent in between. Every entry point
  // that routes a user after auth reads it to resume onboarding instead of
  // dropping them into the client app, and becomeVendor clears it.
  vendorSignupPending: { type: Boolean, default: false },

  // Passwordless "guest" account, created the first time someone buys a ticket
  // (for themselves or as a gift recipient) without signing up. Keyed by email,
  // so it upgrades seamlessly if they later register with the same address.
  isGuest: { type: Boolean, default: false },

  // Profile picture for all users
  profilePicture: { type: String, default: "" },

  // Short bio shown on the user's profile
  bio: { type: String, default: "", maxlength: 500 },

  // Client-specific fields (everyone has these)
  preferences: {
    type: [String],
    default: []
  },

  // Vendor-specific fields (only filled when isVendor = true)
  businessName: { type: String },
  businessDescription: { type: String },
  businessPicture: { type: String, default: "" },
  vendorType: { type: String },
  location: {
    city: { type: String },
    state: { type: String },
    country: { type: String },
    address: { type: String }
  },
  contactInfo: {
    phone: { type: String },
    website: { type: String },
    instagram: { type: String },
    twitter: { type: String },
    tiktok: { type: String },
    facebook: { type: String }
  },
  verified: { type: Boolean, default: false },

  // Paystack payout fields (Nigerian sellers). Collected during vendor
  // onboarding; the bank is registered as a Paystack transfer recipient and
  // payouts are sent to that recipient code.
  paystackBank: {
    accountNumber: { type: String },
    bankCode: { type: String },
    bankName: { type: String },
    accountName: { type: String },
  },
  paystackRecipientCode: { type: String },
  paystackOnboardingComplete: { type: Boolean, default: false },

  // Stripe Connect payout fields (sellers inside Stripe's cross-border-payouts
  // footprint: US, UK, EEA, CA, CH). They COLLECT via the platform Stripe
  // account; settlement is a Transfer from the platform balance to their Express
  // account once an admin approves the payout.
  stripeAccountId: { type: String },
  // ISO-3166-1 alpha-2 the Express account was opened in. Immutable on Stripe's
  // side, so it's kept here to detect a later country change on the profile.
  stripeAccountCountry: { type: String },
  stripeAccountCurrency: { type: String },
  stripeOnboardingComplete: { type: Boolean, default: false },
  // account.payouts_enabled. A Transfer still succeeds while this is false —
  // funds land in the vendor's Stripe balance but don't reach their bank — so
  // it's surfaced in the UI rather than gating onboarding.
  stripePayoutsEnabled: { type: Boolean, default: false },

  // Paid-event organizer history. Neither field gates anything: every public
  // paid event goes through the admin approval queue, every time, and there are
  // no price/capacity caps. They exist so a reviewer can tell a first-timer
  // apart from an organizer with a track record (see admin PaidEvents).
  // True once an admin has approved any paid event of theirs.
  paidEventsApproved: { type: Boolean, default: false },
  // Lifetime count of approved paid events.
  paidEventsCount: { type: Number, default: 0 },

  // Email verification (OTP at signup). Required to create paid events.
  emailVerifiedAt: { type: Date },
  signupOTP: { type: String },
  signupOTPExpires: { type: Date },

  // Favorited events
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "event" }],

  // FCM push notification token (updated on each app launch)
  fcmToken: { type: String, default: null },

  // Last "come see what's on" nudge (jobs/engagementPush.job.js). This stamp,
  // not the job's tick rate, is what actually caps the send rate — the job runs
  // hourly and would otherwise re-send all evening. Null means never sent.
  lastEngagementPushAt: { type: Date, default: null },

  // The city the user is actually browsing, refreshed by the mobile app every
  // launch when it registers its push token. `location.city` can't stand in for
  // this: it's the vendor/payments account address, only ~a third of users set
  // it, and it's where they live rather than where they're looking for events.
  pushCity: { type: String, default: null },

  // Email/push channel preferences. Push follows the OS permission; these
  // cover the channels we control. Default on — users opt out, not in.
  notificationPrefs: {
    eventReminderEmails: { type: Boolean, default: true },
  },
  // Minted the first time we email this user, so the reminder footer can carry
  // a one-click unsubscribe that needs no login.
  unsubscribeToken: { type: String, index: true, sparse: true },

  // Password reset fields
  resetPasswordOTP: { type: String },
  resetPasswordOTPExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordTokenExpires: { type: Date },

  // Moderation / safety (Apple Guideline 1.2)
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "user", default: [] }],
  termsAcceptedAt: { type: Date },
  isBanned: { type: Boolean, default: false },
  bannedAt: { type: Date },
  tokenVersion: { type: Number, default: 0 }
}, {
  timestamps: true
});

// The Connect webhook resolves the vendor by account id on every
// `account.updated`, which Stripe emits liberally. Sparse — only Connect
// vendors carry the field.
userSchema.index({ stripeAccountId: 1 }, { sparse: true });

// Generate the share slug before saving — covers register, OAuth sign-in and
// guest-account creation alike. Async hook: mongoose waits on the returned
// promise, so no next() callback is needed.
userSchema.pre('save', async function() {
  if (!this.slug && this.username) {
    const base = slugify(this.username);
    // Only assign when a slug was produced — an explicit null would still be
    // indexed by the sparse unique index and collide with other null slugs.
    const slug = await generateUniqueSlug(this.constructor, base, {
      excludeId: this._id,
      historyField: "slugHistory",
    });
    if (slug) this.slug = slug;
  }
});

export default mongoose.model("user", userSchema);
