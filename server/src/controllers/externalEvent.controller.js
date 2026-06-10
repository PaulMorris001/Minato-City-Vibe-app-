import ExternalEvent from "../models/externalEvent.model.js";

/** Escape a string for safe use as a literal inside a regex. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Map between ISO-2 country codes and display names so callers can pass
 * either format and we'll match upstream-stored events regardless. Covers the
 * markets we actively ingest (top US event cities + Nigeria + likely
 * expansion markets); extend as we add more.
 *
 * Returns case-insensitive RegExp candidates so a query for "Nigeria" finds
 * documents stored as "NG", and vice versa.
 */
const COUNTRY_ALIASES = [
  ["US", ["United States", "USA", "U.S.", "U.S.A."]],
  ["NG", ["Nigeria"]],
  ["GB", ["United Kingdom", "UK", "Great Britain", "England"]],
  ["CA", ["Canada"]],
  ["AU", ["Australia"]],
  ["DE", ["Germany"]],
  ["FR", ["France"]],
  ["IE", ["Ireland"]],
  ["ES", ["Spain"]],
  ["IT", ["Italy"]],
  ["NL", ["Netherlands"]],
  ["MX", ["Mexico"]],
  ["BR", ["Brazil"]],
  ["ZA", ["South Africa"]],
];

function countryMatchCandidates(input) {
  const v = String(input).trim();
  const upper = v.toUpperCase();
  // Find a matching row in either direction.
  const row = COUNTRY_ALIASES.find(
    ([iso, names]) =>
      iso.toUpperCase() === upper ||
      names.some((n) => n.toLowerCase() === v.toLowerCase())
  );
  const out = new Set([v]);
  if (row) {
    out.add(row[0]); // ISO code
    row[1].forEach((n) => out.add(n));
  }
  // Build case-insensitive exact-match regexes so the $in array works
  // against whatever case the DB happens to store.
  return Array.from(out).map(
    (s) => new RegExp(`^${escapeRegex(s)}$`, "i")
  );
}

/**
 * Public feed of upcoming external events.
 * Mobile app calls this alongside `/events/public/explore` to fill the feed.
 *
 * Query params:
 *   - city:      optional, exact match. e.g. "Lagos"
 *   - country:   optional, ISO-2. e.g. "NG"
 *   - source:    optional, "ticketmaster" | "bandsintown"
 *   - category:  optional, e.g. "Music"
 *   - limit:     1..100, default 20
 *   - cursor:    ISO date string — return events with date > cursor (pagination)
 */
export const getExternalEventsExplore = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const { city, country, source, category, cursor } = req.query;
    // When `includePlaceholders=true`, low-quality entries (those with only
    // generic Ticketmaster fallback art) are included. Default off to keep
    // the feed visually clean.
    const includePlaceholders = req.query.includePlaceholders === "true";

    const match = {
      isActive: true,
      date: { $gt: cursor ? new Date(cursor) : new Date() },
    };
    /*
     * City matching is fuzzy on purpose:
     *   - Case-insensitive (Ticketmaster: "New York"; some pickers: "new york")
     *   - Anchored exact match by default but ignores trailing " City" so e.g.
     *     "New York City" from the CSC API matches our stored "New York".
     */
    if (city) {
      const trimmed = String(city).trim().replace(/\s+City$/i, "");
      match.city = { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" };
    }
    /*
     * Country accepts either the ISO 2-letter code (what TM stores) OR the
     * full display name (what the picker typically sends). We match the
     * known mapping in both directions so callers can send whichever they
     * have. If we don't recognize the value, fall back to a case-insensitive
     * exact match — covers ISO codes verbatim.
     */
    if (country) {
      const candidates = countryMatchCandidates(country);
      match.country = { $in: candidates };
    }
    if (source) match.source = source;
    if (category) match.category = category;
    if (!includePlaceholders) match.hasRealImage = true;

    /*
     * Dedup pipeline.
     *
     * Same-show / same-tour entries appear many times (Beyoncé residency
     * across 6 nights, NBA playoff series, recurring weekly trivia). They
     * all share (title, venueName) but differ by date / sourceId.
     *
     * We bucket by (title, venueName) and return only the soonest event
     * per bucket. The detail screen can later query the rest of the
     * bucket as "more dates available."
     */
    const pipeline = [
      { $match: match },
      { $sort: { date: 1 } }, // soonest first, so $first below is "the soonest"
      {
        $group: {
          _id: {
            title: { $toLower: "$title" },
            venue: { $toLower: { $ifNull: ["$venueName", ""] } },
          },
          // Keep the soonest event of each duplicate-set as the canonical one.
          event: { $first: "$$ROOT" },
          // Track how many other dates exist for this (title, venue) so the
          // mobile card can show "+ N more dates" affordance.
          additionalDates: { $sum: 1 },
        },
      },
      { $replaceRoot: { newRoot: { $mergeObjects: ["$event", { additionalDates: { $subtract: ["$additionalDates", 1] } }] } } },
      { $sort: { date: 1 } },
      { $limit: limit + 1 }, // +1 to detect "has more"
    ];

    const events = await ExternalEvent.aggregate(pipeline);

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? page[page.length - 1].date.toISOString() : null;

    res.json({ events: page, nextCursor });
  } catch (err) {
    console.error("getExternalEventsExplore error:", err);
    res.status(500).json({ message: "Failed to load external events" });
  }
};

/**
 * Detail of one external event. Used when a user taps a card before tapping
 * "Get Tickets" so we can show the full description, gallery, etc.
 */
export const getExternalEventById = async (req, res) => {
  try {
    const event = await ExternalEvent.findOne({
      _id: req.params.id,
      isActive: true,
    }).lean();
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json({ event });
  } catch (err) {
    console.error("getExternalEventById error:", err);
    res.status(500).json({ message: "Failed to load event" });
  }
};

/**
 * "Near me" geo query — events within `radiusKm` of (lng, lat).
 * Mobile uses this for the location-aware feed surface.
 */
export const getExternalEventsNearby = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: "lat and lng query params required" });
    }
    const radiusKm = Math.min(500, parseFloat(req.query.radiusKm) || 50);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);

    const events = await ExternalEvent.find({
      isActive: true,
      date: { $gt: new Date() },
      geo: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000, // meters
        },
      },
    })
      .limit(limit)
      .lean();

    res.json({ events });
  } catch (err) {
    console.error("getExternalEventsNearby error:", err);
    res.status(500).json({ message: "Failed to load nearby events" });
  }
};
