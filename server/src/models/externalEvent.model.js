import mongoose from "mongoose";

/**
 * Events ingested from third-party providers (Ticketmaster, Bandsintown, etc).
 *
 * Kept in a SEPARATE collection from `Event` because:
 *   - External events have no owner (no `createdBy`)
 *   - Buyers tap through to the provider's site; there's no Stripe Connect /
 *     ticket / QR flow inside our app
 *   - We're not the merchant of record, so we don't track invitedUsers,
 *     approvalStatus, refunds, etc.
 *   - Mixing them in `Event` would force most code paths to branch on `source`
 *     and quickly turn into a mess
 *
 * Mobile shows these alongside native events but renders a distinct card with
 * a provider badge ("Ticketmaster" etc.) and routes the CTA to `ticketUrl`
 * via expo-web-browser instead of the Stripe flow.
 */
const externalEventSchema = new mongoose.Schema(
  {
    // Provider identification ── (source, sourceId) is the natural unique key
    source: {
      type: String,
      enum: ["ticketmaster", "bandsintown"],
      required: true,
      index: true,
    },
    sourceId: { type: String, required: true, index: true },

    // Display
    title: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" }, // 16:9 cover for the feed card
    images: { type: [String], default: [] }, // detail-page gallery (all sizes from provider)

    // When + where
    date: { type: Date, required: true, index: true }, // event start (UTC)
    endDate: { type: Date }, // optional, providers don't always supply
    timezone: { type: String, default: "" }, // IANA tz, e.g. "America/New_York"

    location: { type: String, default: "" }, // human-readable "Venue Name, City"
    venueName: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "", index: true },
    state: { type: String, default: "" },
    country: { type: String, default: "", index: true },
    geo: {
      // GeoJSON Point for $near queries; stored as [lng, lat] per spec
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    // Pricing (optional — some events don't expose price publicly)
    priceMin: { type: Number, default: null },
    priceMax: { type: Number, default: null },
    currency: { type: String, default: "USD" },

    // Where buyers go to actually purchase ── the whole point of this collection
    ticketUrl: { type: String, required: true },

    // Provider taxonomy (free-text from the source). Used for filtering /
    // surfacing categories like Music, Sports, Comedy, etc.
    category: { type: String, default: "" },
    genre: { type: String, default: "" },
    subGenre: { type: String, default: "" },

    // Headliners / lineup, when applicable (concerts, sports teams, etc.)
    performers: { type: [String], default: [] },

    // Bookkeeping ── lets us re-fetch + age out stale records cleanly
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date }, // hide from feed once event date has passed
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One row per (provider, providerId). Lets us upsert idempotently on every refresh.
externalEventSchema.index({ source: 1, sourceId: 1 }, { unique: true });

// Feed queries: "upcoming events in city X by date"
externalEventSchema.index({ city: 1, country: 1, date: 1, isActive: 1 });

// Geo queries: "near me"
externalEventSchema.index({ geo: "2dsphere" });

export default mongoose.model("externalEvent", externalEventSchema);
