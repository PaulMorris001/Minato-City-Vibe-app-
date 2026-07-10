import mongoose from "mongoose";

/**
 * Freshness log for external vendor fetches — one row per
 * (source, city, vendorType) combo. Lets the on-demand fetcher answer
 * "did we already query Yelp/Google for caterers in Miami this week?"
 * including combos that returned zero results (which the externalVendor
 * collection alone can't distinguish from never-fetched).
 */
const externalVendorFetchSchema = mongoose.Schema(
  {
    source: { type: String, enum: ["yelp", "google"], required: true },
    // "city|state|country" lowercased — matches ensureFreshExternalVendors
    cityKey: { type: String, required: true },
    vendorType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vendorType",
      required: true,
    },
    fetchedAt: { type: Date, default: Date.now },
    resultCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

externalVendorFetchSchema.index(
  { source: 1, cityKey: 1, vendorType: 1 },
  { unique: true }
);

export default mongoose.model("externalVendorFetch", externalVendorFetchSchema);
