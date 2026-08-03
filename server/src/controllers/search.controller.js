/**
 * Unified search — one query across events, guides, vendors and users.
 *
 * Results come back as per-type BUCKETS rather than one relevance-ranked list.
 * Ranking a flat union across four heterogeneous collections needs a scoring
 * function we don't have (no text indexes, no engagement signal), and a single
 * merged page number would be meaningless. Buckets are honest about what the
 * data supports, and the client needs per-type counts for its filter chips
 * anyway.
 *
 * Every collection's filter is built by the same helper its own endpoint uses,
 * so visibility rules (paid-event approval, blocked authors, banned users, the
 * support account) can't drift between here and there.
 */

import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import ExternalEvent from "../models/externalEvent.model.js";
import { Vendor } from "../models/vendor.model.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { getCache, setCache } from "../utils/cache.js";
import { buildPublicEventQuery, attachTicketInfo } from "./event.controller.js";
import { buildExternalExplorePipeline } from "./externalEvent.controller.js";
import { buildGuideQuery } from "./guide.controller.js";
import { buildVendorSearchQuery } from "./vendors.controller.js";
import { searchUsersQuery } from "../services/userSearch.js";

const ALL_TYPES = ["events", "guides", "vendors", "users"];
const MIN_QUERY_LENGTH = 2;
/** Bound the regex cost — nobody searches with a paragraph. */
const MAX_QUERY_LENGTH = 100;

/** Shape one bucket consistently. */
const bucket = (items, total, skip, extra = {}) => ({
  items,
  total,
  hasMore: skip + items.length < total,
  ...extra,
});

const empty = (extra = {}) => ({ items: [], total: 0, hasMore: false, ...extra });

/** $match for external (Ticketmaster etc.) listings matching `q`. */
function externalMatch({ q, city }) {
  const rx = { $regex: escapeRegex(q), $options: "i" };
  return {
    isActive: true,
    hasRealImage: true,
    date: { $gt: new Date() },
    ...(city ? { city: { $regex: `^${escapeRegex(city)}$`, $options: "i" } } : {}),
    $or: [
      { title: rx },
      { description: rx },
      { venueName: rx },
      { location: rx },
      // $regex matches elementwise against array fields.
      { performers: rx },
      { category: rx },
    ],
  };
}

/**
 * Events bucket — native events CONCATENATED with external listings. Someone
 * searching "Beyonce" whose only match is a promoted external listing must not
 * see an empty page.
 *
 * The two collections are paginated independently, so rather than interleaving
 * them by date behind a composite cursor, the bucket is treated as one list:
 * all natives (date-ascending), then all externals (date-ascending). A page
 * spanning the boundary draws from both. The seam means the bucket isn't
 * globally date-sorted, which is the deliberate v1 trade — but pagination is
 * stable and every match is reachable, which "pad page 1 only" was not.
 */
async function searchEvents({ q, city, skip, limit }) {
  const query = buildPublicEventQuery({ city, q });
  const match = externalMatch({ q, city });

  const [nativeTotal, externalTotal] = await Promise.all([
    Event.countDocuments(query),
    ExternalEvent.countDocuments(match),
  ]);

  // How much of this page falls in the native range vs. past the seam.
  const nativeSkip = Math.min(skip, nativeTotal);
  const nativeWanted = Math.max(0, Math.min(limit, nativeTotal - skip));
  const externalSkip = Math.max(0, skip - nativeTotal);
  const externalWanted = limit - nativeWanted;

  const [events, externalRows] = await Promise.all([
    nativeWanted > 0
      ? Event.find(query)
          .populate("createdBy", "username email profilePicture")
          // _id breaks date ties so paging is stable — see the same note in
          // buildExternalExplorePipeline.
          .sort({ date: 1, _id: 1 })
          .skip(nativeSkip)
          .limit(nativeWanted)
      : [],
    externalWanted > 0
      ? ExternalEvent.aggregate([
          ...buildExternalExplorePipeline({ match, limit: externalSkip + externalWanted }),
          { $skip: externalSkip },
        ])
      : [],
  ]);

  const native = (await attachTicketInfo(events, null)).map((e) => ({
    ...(e.toObject ? e.toObject() : e),
    kind: "native",
  }));
  const external = externalRows.map((e) => ({ ...e, kind: "external" }));

  return bucket([...native, ...external], nativeTotal + externalTotal, skip);
}

async function searchGuides({ q, city, blockedIds, skip, limit }) {
  const filter = buildGuideQuery({ city, search: q, blockedIds });
  const [total, guides] = await Promise.all([
    Guide.countDocuments(filter),
    Guide.find(filter)
      .populate("author", "username email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);
  return bucket(guides, total, skip);
}

async function searchVendorsBucket({ q, city, skip, limit }) {
  const filter = await buildVendorSearchQuery({ q, city });
  const [total, vendors] = await Promise.all([
    Vendor.countDocuments(filter),
    Vendor.find(filter)
      .populate("city", "name state country")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 })
      .skip(skip)
      .limit(limit),
  ]);
  return bucket(vendors, total, skip);
}

/**
 * GET /search?q=&types=&city=&page=&limit=
 *
 * optionalAuth. Guests get events/guides/vendors — all guest-browsable
 * elsewhere in the app — and an empty `users` bucket flagged `requiresAuth`,
 * rather than a 401 that would block the three they're entitled to. User search
 * stays auth-gated because it depends on the viewer's block list and is an
 * obvious scraping target.
 */
export const unifiedSearch = async (req, res) => {
  try {
    const raw = (req.query.q || "").trim();
    if (raw.length < MIN_QUERY_LENGTH) {
      return res
        .status(400)
        .json({ message: `Search query must be at least ${MIN_QUERY_LENGTH} characters` });
    }
    const q = raw.slice(0, MAX_QUERY_LENGTH);

    const city = (req.query.city || "").trim() || undefined;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const requested = (req.query.types || "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => ALL_TYPES.includes(t));
    const types = requested.length > 0 ? requested : ALL_TYPES;

    const userId = req.user?.id || null;

    // Own cache namespace, short TTL, and only for queries long enough to be
    // deliberate. utils/cache.js is an unbounded Map with no eviction, so
    // caching the whole 2-character keyspace would grow memory without bound.
    const cacheKey = `search_${userId || "guest"}_${q}_${types.join("+")}_${city || ""}_${page}_${limit}`;
    const cacheable = q.length >= 3;
    if (cacheable) {
      const cached = getCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const blockedIds = userId ? await getBlockedIds(userId) : [];

    const [events, guides, vendors, users] = await Promise.all([
      types.includes("events") ? searchEvents({ q, city, skip, limit }) : empty(),
      types.includes("guides") ? searchGuides({ q, city, blockedIds, skip, limit }) : empty(),
      types.includes("vendors") ? searchVendorsBucket({ q, city, skip, limit }) : empty(),
      types.includes("users") && userId
        ? searchUsersQuery({ viewerId: userId, q, page, limit }).then(({ users: items, total }) =>
            bucket(items, total, skip, { requiresAuth: false })
          )
        : empty({ requiresAuth: types.includes("users") && !userId }),
    ]);

    const result = { q, buckets: { events, guides, vendors, users } };
    if (cacheable) setCache(cacheKey, result, 30); // 30s TTL
    res.status(200).json(result);
  } catch (error) {
    console.error("Unified search error:", error);
    res.status(500).json({ message: "Search failed", details: error.message });
  }
};

export default { unifiedSearch };
