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
  // Real name, split from the single "full name" field collected at signup
  // (see utils/personName.js). Empty on any account created before this field
  // existed — the client forces a one-time "complete your name" screen on
  // next login when firstName is unset, so old accounts backfill themselves
  // instead of needing a migration script.
  firstName: { type: String, default: "", trim: true },
  lastName: { type: String, default: "", trim: true },
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

  // Self-reported date of birth. Optional at the model layer — null means
  // unset, which is every account created before this field existed. New
  // signups always supply one (see register + the profile setup checklist,
  // which is what backfills the rest). Enforced at 13+ by utils/dateOfBirth.js.
  dateOfBirth: { type: Date, default: null },

  // Self-reported gender. Optional — "" means unset (every existing account).
  gender: {
    type: String,
    enum: ["", "male", "female", "non-binary", "prefer-not-to-say"],
    default: "",
  },

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

  // PayPal payout field (every seller outside Nigeria). Settlement sends a
  // PayPal Payout to this address once an admin approves. There is no account id
  // or KYC state to mirror here: PayPal addresses a recipient by email and runs
  // its own checks at payout time, which is why this replaced the six Stripe
  // Connect fields below with one.
  paypalPayoutEmail: { type: String },
  paypalOnboardingComplete: { type: Boolean, default: false },

  // Stripe Connect payout fields — LEGACY. The Connect rail was retired in Sep
  // 2026 and nothing writes these any more; they are kept because payouts
  // created before the cutover still execute against them, and because they are
  // the only record of where a pre-cutover seller was paid.
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

  // OurCityVibe credit balances — 1 unit = 1 unit of that same currency (₦1
  // in Nigeria, $1 elsewhere). Kept as two separate balances, not one
  // converted total: credit is only ever spent against an order priced in
  // its own currency, so there's no exchange rate between them to get wrong.
  // Credited when a Birthday Raffle prize carries a coupon value (see
  // raffleCampaign.model.js's prizeSchema and admin.controller.js's
  // setRaffleWinner); spent at checkout against any vendor order in that
  // currency (see services/payments/coupon.service.js). Never negative in
  // steady state — reservations are only ever for an amount already on the
  // balance — but stored as a plain Number rather than unsigned so a manual
  // admin correction can't be rejected by the schema.
  couponBalanceNGN: { type: Number, default: 0 },
  couponBalanceUSD: { type: Number, default: 0 },
  // When each balance was last touched (awarded, spent, refunded, or expired)
  // — jobs/couponExpiration.job.js sweeps a balance to 0 once its timestamp is
  // 30+ days old, so unused credit doesn't sit on the books forever. Null
  // means the balance has never been touched and isn't on an expiry
  // countdown; every write to the balance above sets this in the same
  // operation, so the two never drift apart.
  couponBalanceNGNUpdatedAt: { type: Date, default: null },
  couponBalanceUSDUpdatedAt: { type: Date, default: null },
  // Which vendor (a user with isVendor:true) each balance is redeemable at —
  // set from raffleCampaign.model.js's vendorNGN/vendorUSD the moment credit
  // is awarded (see coupon.service.js's setCouponVendorLock, called from
  // admin.controller.js's reconcileWinnerCoupon). Null means the balance is
  // spendable at any vendor — the case for a campaign with no vendor
  // assigned, or a balance earned before this field existed. Simplest model:
  // one lock per currency, not a per-award ledger — winning a later campaign
  // with a different assigned vendor overwrites the lock, even over any
  // leftover balance from an earlier win. That's a deliberate simplification
  // for a rare edge case (winning twice within the same ~30-day window), not
  // an oversight.
  couponVendorNGN: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  couponVendorUSD: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },

  // Email/push channel preferences. Push follows the OS permission; these
  // cover the channels we control. Default on — users opt out, not in.
  // The category flags gate push delivery per notification type (see the
  // type→prefKey map in services/notification.service.js); the in-app
  // Notification record is always written regardless.
  notificationPrefs: {
    eventReminderEmails: { type: Boolean, default: true },
    newFollowers: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    eventUpdates: { type: Boolean, default: true },
    sales: { type: Boolean, default: true },
    payouts: { type: Boolean, default: true },
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
