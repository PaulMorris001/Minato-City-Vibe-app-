import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false }, // Optional for OAuth users

  // OAuth authentication fields
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId: { type: String, sparse: true, unique: true },

  // User is always a client by default, can optionally become a vendor
  isVendor: { type: Boolean, default: false },

  // Profile picture for all users
  profilePicture: { type: String, default: "" },

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
    address: { type: String }
  },
  contactInfo: {
    phone: { type: String },
    website: { type: String }
  },
  verified: { type: Boolean, default: false },

  // Stripe Connect fields (for sellers receiving payouts)
  stripeAccountId: { type: String },
  stripeOnboardingComplete: { type: Boolean, default: false },

  // Password reset fields
  resetPasswordOTP: { type: String },
  resetPasswordOTPExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordTokenExpires: { type: Date }
}, {
  timestamps: true
});

export default mongoose.model("user", userSchema);
