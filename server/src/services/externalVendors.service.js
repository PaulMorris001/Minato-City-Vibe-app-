import ExternalVendor from "../models/externalVendor.model.js";
import ExternalVendorFetch from "../models/externalVendorFetch.model.js";
import { VendorType } from "../models/vendor.model.js";
import config from "../config/env.js";

/**
 * External vendor discovery — Yelp Fusion + Google Places (New).
 *
 * On-demand, stale-while-revalidate: browse requests never block on these
 * APIs. They read whatever is already cached in Mongo and fire an async
 * freshness check per (source, city, vendorType) with a 7-day TTL, so quota
 * is only spent on cities users actually browse. Follows the
 * ticketmaster.service.js retry/normalize/upsert pattern.
 */

const YELP_BASE = "https://api.yelp.com/v3";
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

// How long a (source, city, type) fetch stays fresh before re-querying
const FETCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PAGE_SIZE = 20;

/**
 * VendorType name → provider queries. Types not listed here (e.g. "Other")
 * are never fetched externally. Yelp uses category aliases
 * (https://docs.developer.yelp.com/docs/resources-categories); Google uses
 * free-text queries against Places Text Search.
 */
export const CATEGORY_MAP = {
  "DJs": { yelp: "djs", google: "DJ for hire" },
  "Photographers": { yelp: "photographers,eventphotography", google: "event photographer" },
  "Makeup Artists": { yelp: "makeupartists", google: "makeup artist" },
  "Event Planners": { yelp: "eventplanning", google: "event planner" },
  "Security": { yelp: "securityservices", google: "event security company" },
  "Caterers": { yelp: "catering", google: "caterer" },
  "Chefs": { yelp: "personalchefs", google: "private chef" },
  "Restaurants": { yelp: "restaurants", google: "restaurants" },
  "Music and Bands": { yelp: "musicians", google: "live band for hire" },
  "Bars and Clubs": { yelp: "bars,danceclubs", google: "bars and nightclubs" },
  "Casinos": { yelp: "casinos", google: "casinos" },
  "Concerts": { yelp: "musicvenues", google: "concert venue" },
  "Transportation": { yelp: "limos,partybusrentals", google: "limo and party bus service" },
  "Venues": { yelp: "venues", google: "event venue rental" },
  "Florists": { yelp: "florists", google: "florist" },
  "Decorations": { yelp: "partyequipmentrentals,balloonservices", google: "party decoration service" },
  "Desserts": { yelp: "desserts,bakeries", google: "dessert and cake shop" },
  "Beverages": { yelp: "bartenders", google: "mobile bartending service" },
};

/** Format Node fetch errors into something humans can actually debug. */
function describeFetchError(err) {
  if (!err) return "unknown";
  const cause = err.cause;
  if (cause) {
    const code = cause.code || cause.errno;
    const sub = cause.message || cause.errorMessage || "";
    return `${err.message} → ${code || "?"} ${sub}`.trim();
  }
  return err.message || String(err);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with retry/backoff on transient failures (network, 5xx, 429).
 * Other 4xx are not retried — they won't resolve by trying again.
 */
async function fetchWithRetry(url, options = {}, { timeoutMs = 15_000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`External vendors ${res.status}`);
      } else {
        const body = await res.text().catch(() => "");
        throw new Error(`External vendors ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.message?.match(/External vendors 4\d\d/)) throw err;
    }
    if (attempt < retries - 1) {
      // Exponential backoff: 500ms, 1.5s, 4.5s
      await sleep(500 * Math.pow(3, attempt));
    }
  }
  throw lastErr ?? new Error("fetch failed after retries");
}

// ─── Yelp ────────────────────────────────────────────────────────────────────

async function fetchYelp({ city, state, aliases }) {
  const params = new URLSearchParams({
    location: `${city}, ${state}`,
    categories: aliases,
    limit: String(PAGE_SIZE),
    sort_by: "best_match",
  });
  const res = await fetchWithRetry(`${YELP_BASE}/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${config.yelp.apiKey}` },
  });
  const data = await res.json();
  return data.businesses || [];
}

function normalizeYelp(biz, { vendorTypeId, city, state, country }) {
  return {
    source: "yelp",
    sourceId: biz.id,
    name: biz.name,
    vendorType: vendorTypeId,
    description: (biz.categories || []).map((c) => c.title).join(" · "),
    images: biz.image_url ? [biz.image_url] : [],
    rating: biz.rating || 0,
    reviewCount: biz.review_count || 0,
    // Yelp price is "$".."$$$$"
    priceRange: biz.price ? biz.price.length : null,
    address: (biz.location?.display_address || []).join(", "),
    city,
    state,
    country,
    ...(biz.coordinates?.longitude != null && biz.coordinates?.latitude != null
      ? { geo: { type: "Point", coordinates: [biz.coordinates.longitude, biz.coordinates.latitude] } }
      : {}),
    phone: biz.display_phone || biz.phone || "",
    website: "", // Yelp Fusion doesn't expose the business's own site
    externalUrl: biz.url,
    categoriesRaw: (biz.categories || []).map((c) => c.alias),
    fetchedAt: new Date(),
    isActive: true,
  };
}

// ─── Google Places (New) ─────────────────────────────────────────────────────

const GOOGLE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.photos",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.location",
].join(",");

// PRICE_LEVEL_* → 1–4 ($ to $$$$); FREE/UNSPECIFIED → null
const GOOGLE_PRICE_LEVELS = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function fetchGoogle({ query }) {
  const res = await fetchWithRetry(`${GOOGLE_PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googlePlaces.apiKey,
      "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, pageSize: PAGE_SIZE }),
  });
  const data = await res.json();
  return data.places || [];
}

/**
 * Resolve a place photo reference to a stable image URL. skipHttpRedirect
 * makes the endpoint return {photoUri} JSON, so the API key is never baked
 * into URLs we serve to clients. Failures just mean no image.
 */
async function resolveGooglePhoto(photoName) {
  try {
    const url = `${GOOGLE_PLACES_BASE}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${config.googlePlaces.apiKey}`;
    const res = await fetchWithRetry(url, {}, { retries: 2 });
    const data = await res.json();
    return data.photoUri || null;
  } catch {
    return null;
  }
}

function normalizeGoogle(place, { vendorTypeId, city, state, country, imageUrl }) {
  return {
    source: "google",
    sourceId: place.id,
    name: place.displayName?.text || place.displayName || "",
    vendorType: vendorTypeId,
    description: "",
    images: imageUrl ? [imageUrl] : [],
    rating: place.rating || 0,
    reviewCount: place.userRatingCount || 0,
    priceRange: GOOGLE_PRICE_LEVELS[place.priceLevel] ?? null,
    address: place.formattedAddress || "",
    city,
    state,
    country,
    ...(place.location?.longitude != null && place.location?.latitude != null
      ? { geo: { type: "Point", coordinates: [place.location.longitude, place.location.latitude] } }
      : {}),
    phone: place.nationalPhoneNumber || "",
    website: place.websiteUri || "",
    externalUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    categoriesRaw: [],
    fetchedAt: new Date(),
    isActive: true,
  };
}

// ─── Freshness + upsert core ─────────────────────────────────────────────────

// Cached VendorType list — names change essentially never
let vendorTypeCache = null;
let vendorTypeCacheAt = 0;
async function getVendorTypes() {
  if (!vendorTypeCache || Date.now() - vendorTypeCacheAt > 60 * 60 * 1000) {
    vendorTypeCache = await VendorType.find().lean();
    vendorTypeCacheAt = Date.now();
  }
  return vendorTypeCache;
}

const cityKeyOf = (city, state, country) =>
  [city, state, country].map((s) => (s || "").trim().toLowerCase()).join("|");

async function upsertVendors(docs) {
  if (docs.length === 0) return;
  await ExternalVendor.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { source: doc.source, sourceId: doc.sourceId },
        update: { $set: doc },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

async function markFetched(source, cityKey, vendorTypeId, resultCount) {
  await ExternalVendorFetch.findOneAndUpdate(
    { source, cityKey, vendorType: vendorTypeId },
    { $set: { fetchedAt: new Date(), resultCount } },
    { upsert: true }
  );
}

// Concurrent browse requests for the same combo await one upstream fetch
// instead of stampeding the provider APIs.
const inFlight = new Map();

/**
 * Ensure external vendors for one (city, vendorType) are fresh, fetching from
 * any configured provider whose log entry is missing or older than the TTL.
 * NEVER throws — designed to be fired without awaiting from request handlers.
 */
export async function ensureFreshExternalVendors({ city, state, country, vendorTypeId, vendorTypeName }) {
  const mapping = CATEGORY_MAP[vendorTypeName];
  if (!mapping || !city) return;

  const cityKey = cityKeyOf(city, state, country);
  const flightKey = `${cityKey}::${vendorTypeId}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);

  const run = (async () => {
    const sources = [
      { source: "yelp", enabled: !!config.yelp.apiKey },
      { source: "google", enabled: !!config.googlePlaces.apiKey },
    ];

    for (const { source, enabled } of sources) {
      if (!enabled) continue;
      try {
        const log = await ExternalVendorFetch.findOne({ source, cityKey, vendorType: vendorTypeId }).lean();
        if (log && Date.now() - new Date(log.fetchedAt).getTime() < FETCH_TTL_MS) continue;

        let docs = [];
        if (source === "yelp") {
          const businesses = await fetchYelp({ city, state, aliases: mapping.yelp });
          docs = businesses.map((biz) =>
            normalizeYelp(biz, { vendorTypeId, city, state, country })
          );
        } else {
          const places = await fetchGoogle({ query: `${mapping.google} in ${city}, ${state}` });
          // Resolve photos only for places we haven't stored yet — each photo
          // resolution is its own billable request.
          const known = new Set(
            (await ExternalVendor.find(
              { source: "google", sourceId: { $in: places.map((p) => p.id) } }
            ).select("sourceId").lean()).map((d) => d.sourceId)
          );
          docs = [];
          for (const place of places) {
            let imageUrl = null;
            if (!known.has(place.id) && place.photos?.[0]?.name) {
              imageUrl = await resolveGooglePhoto(place.photos[0].name);
            }
            const doc = normalizeGoogle(place, { vendorTypeId, city, state, country, imageUrl });
            // Keep an existing image if we skipped re-resolving it
            if (known.has(place.id)) delete doc.images;
            docs.push(doc);
          }
        }

        await upsertVendors(docs);
        await markFetched(source, cityKey, vendorTypeId, docs.length);
        console.log(`[externalVendors] ${source}: ${docs.length} for "${vendorTypeName}" in ${city}, ${state}`);
      } catch (err) {
        // A failed source must not block the other or the request path
        console.error(`[externalVendors] ${source} fetch failed for ${cityKey}/${vendorTypeName}: ${describeFetchError(err)}`);
      }
    }
  })().finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, run);
  return run;
}

/**
 * Fire freshness checks for every mapped vendor type in a city, without
 * awaiting. Used by browse; per-type screens pass a single type instead.
 */
export async function ensureFreshExternalVendorsForCity({ city, state, country }) {
  const types = await getVendorTypes();
  for (const t of types) {
    if (!CATEGORY_MAP[t.name]) continue;
    void ensureFreshExternalVendors({
      city,
      state,
      country,
      vendorTypeId: t._id,
      vendorTypeName: t.name,
    }).catch(() => {});
  }
}

/**
 * Read cached external vendors for a city (optionally one vendorType).
 * Pure Mongo read — never triggers upstream calls.
 */
export async function getCachedExternalVendors({ city, vendorTypeId = null }) {
  if (!city) return [];
  const query = {
    city: new RegExp(`^${String(city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    isActive: true,
  };
  if (vendorTypeId) query.vendorType = vendorTypeId;
  return ExternalVendor.find(query)
    .populate("vendorType", "name icon")
    .sort({ rating: -1 })
    .lean();
}

const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Drop Google entries duplicating a Yelp entry with the same normalized name
 * (Yelp preferred — richer photos and price data).
 */
export function dedupeExternalVendors(externalVendors) {
  const yelpNames = new Set(
    externalVendors.filter((v) => v.source === "yelp").map((v) => normalizeName(v.name))
  );
  return externalVendors.filter(
    (v) => v.source !== "google" || !yelpNames.has(normalizeName(v.name))
  );
}
