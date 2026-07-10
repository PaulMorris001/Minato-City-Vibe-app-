import mongoose from "mongoose";

/**
 * Vendors discovered via external APIs (Yelp Fusion, Google Places).
 *
 * Kept separate from the `vendor` collection on purpose: external vendors
 * have no linked user account, no services, no bookings, and their rating
 * comes from the provider — mixing them in would force every internal-vendor
 * code path (details, reviews, event attachment) to branch on source.
 * Mirrors the externalEvent.model.js pattern.
 */
const externalVendorSchema = mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["yelp", "google"],
      required: true,
      index: true,
    },
    // Provider's own id (Yelp business id / Google place id)
    sourceId: { type: String, required: true },

    name: { type: String, required: true },
    vendorType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vendorType",
      required: true,
      index: true,
    },
    // Short blurb — Yelp category titles joined, or empty for Google
    description: { type: String, default: "" },
    images: { type: [String], default: [] },

    // Provider rating 0–5 and how many reviews it's based on
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    // 1–4 ($ to $$$$); null when the provider has no price data
    priceRange: { type: Number, default: null },

    address: { type: String, default: "" },
    city: { type: String, index: true },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    geo: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    phone: { type: String, default: "" },
    website: { type: String, default: "" },
    // Where "Open in Yelp / Google Maps" goes — always present
    externalUrl: { type: String, required: true },

    // Raw provider categories, useful for debugging the type mapping
    categoriesRaw: { type: [String], default: [] },

    fetchedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Upsert key — one doc per provider listing
externalVendorSchema.index({ source: 1, sourceId: 1 }, { unique: true });
// The merge query: cached externals for a city (+ optionally a type)
externalVendorSchema.index({ city: 1, vendorType: 1, isActive: 1 });

export default mongoose.model("externalVendor", externalVendorSchema);
