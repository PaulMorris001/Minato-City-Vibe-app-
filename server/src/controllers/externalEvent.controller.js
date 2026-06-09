import ExternalEvent from "../models/externalEvent.model.js";

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

    const q = {
      isActive: true,
      date: { $gt: cursor ? new Date(cursor) : new Date() },
    };
    if (city) q.city = city;
    if (country) q.country = country;
    if (source) q.source = source;
    if (category) q.category = category;

    const events = await ExternalEvent.find(q)
      .sort({ date: 1 })
      .limit(limit + 1) // probe one extra to know whether more exist
      .lean();

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
