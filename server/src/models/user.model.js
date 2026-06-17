import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  // Display case is preserved (e.g. "JohnDoe"), but uniqueness and lookups are
  // case-insensitive — enforced at the application layer in the auth controller
  // and via case-insensitive queries (see utils/escapeRegex.js). This avoids a
  // forced data migration on existing mixed-case usernames. To additionally
  // enforce at the DB layer, dedupe existing rows then add a unique index with
  // collation { locale: "en", strength: 2 }.
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: false }, // Optional for OAuth users

  // OAuth authentication fields
  authProvider: { type: String, enum: ['local', 'google', 'apple'], default: 'local' },
  googleId: { type: String, sparse: true, unique: true },
  appleId: { type: String, sparse: true, unique: true },

  // User is always a client by default, can optionally become a vendor
  isVendor: { type: Boolean, default: false },

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

  // Stripe Connect fields (for sellers receiving payouts)
  stripeAccountId: { type: String },
  stripeOnboardingComplete: { type: Boolean, default: false },

  // Paid-event organizer trust: false until an admin approves their first paid event.
  // After approval, subsequent paid events skip the approval queue.
  paidEventsApproved: { type: Boolean, default: false },
  // Lifetime count of approved paid events. Drives the "new organizer" caps —
  // until this passes a threshold, ticket price and quantity are capped.
  paidEventsCount: { type: Number, default: 0 },

  // Email verification (OTP at signup). Required to create paid events.
  emailVerifiedAt: { type: Date },
  signupOTP: { type: String },
  signupOTPExpires: { type: Date },

  // Favorited events
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "event" }],

  // FCM push notification token (updated on each app launch)
  fcmToken: { type: String, default: null },

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

export default mongoose.model("user", userSchema);
