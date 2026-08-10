import mongoose from "mongoose";

/**
 * Cache of Eventbrite's internal place IDs, keyed by (city, countryCode).
 *
 * Eventbrite's search endpoint filters by an opaque numeric place ID
 * ("890437281" = Lagos, NG). The only way to discover one is to fetch the
 * city's public landing page (`/d/nigeria--lagos/all-events/`) and read the
 * ID out of the embedded server data — a ~700KB HTML download.
 *
 * Doing that for every city on every 6h refresh would dwarf the cost of the
 * actual ingestion, and the IDs are stable (they're Eventbrite's own place
 * registry, not session tokens). So we resolve once and cache here forever,
 * with `resolvedAt` available if we ever want to expire them.
 *
 * `placeId: null` is a meaningful value — it records "we looked and Eventbrite
 * has no destination page for this city", so we don't re-scrape a 404 every run.
 */
const eventbritePlaceSchema = new mongoose.Schema(
  {
    city: { type: String, required: true },
    countryCode: { type: String, required: true }, // ISO-3166 alpha-2
    placeId: { type: String, default: null },
    /** The /d/ slug we resolved through — kept for debugging bad matches. */
    slug: { type: String, default: "" },
    resolvedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

eventbritePlaceSchema.index({ city: 1, countryCode: 1 }, { unique: true });

export default mongoose.model("eventbritePlace", eventbritePlaceSchema);
