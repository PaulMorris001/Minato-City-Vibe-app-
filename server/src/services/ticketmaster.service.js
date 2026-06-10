import ExternalEvent from "../models/externalEvent.model.js";

const API_BASE = "https://app.ticketmaster.com/discovery/v2";

/**
 * Ticketmaster Discovery API v2 ingestion.
 *
 * Pulls upcoming events for a list of cities, normalizes the upstream payload
 * into our ExternalEvent shape, and upserts on (source="ticketmaster", sourceId).
 *
 * Free tier: 5000 calls / day, 5 req/sec. Each city → ~1-3 calls (paginated
 * 200 events/page). Reasonable for daily refresh of 20+ cities.
 *
 * Set TICKETMASTER_API_KEY in env. Get one at:
 *   https://developer.ticketmaster.com/products-and-docs/apis/getting-started/
 */

/**
 * Pick the best cover image from Ticketmaster's image array.
 *
 * Ticketmaster marks generic category-stock images with `fallback: true`
 * (e.g., "generic concert silhouette" for events the promoter never uploaded
 * a real image for). Those make the feed look like a wall of placeholders,
 * so we strictly prefer real images and only fall back to fallbacks when
 * there's nothing else.
 *
 * Returns { url, isFallback } so the caller can decide whether to skip the
 * event entirely if every available image is generic.
 */
function pickCoverImage(images = []) {
  if (!images.length) return { url: "", isFallback: true };

  // Bucket by quality: real-image > 16:9-real > 16:9-fallback > anything
  const real = images.filter((i) => !i.fallback);
  const real169 = real.filter((i) => i.ratio === "16_9");
  const fallback169 = images.filter((i) => i.ratio === "16_9");

  const pickLargest = (arr) =>
    arr.length
      ? [...arr].sort((a, b) => (b.width || 0) - (a.width || 0))[0]
      : null;

  const chosen =
    pickLargest(real169) ||
    pickLargest(real) ||
    pickLargest(fallback169) ||
    pickLargest(images);

  return {
    url: chosen?.url || "",
    isFallback: !!chosen?.fallback || real.length === 0,
  };
}

/** Normalize one Ticketmaster event into our ExternalEvent shape. */
function normalize(tm) {
  const venue = tm._embedded?.venues?.[0] || {};
  const attractions = tm._embedded?.attractions || [];
  const classification = tm.classifications?.[0] || {};
  const price = tm.priceRanges?.[0] || {};

  const lat = venue.location?.latitude ? parseFloat(venue.location.latitude) : null;
  const lng = venue.location?.longitude ? parseFloat(venue.location.longitude) : null;

  const startDate = tm.dates?.start?.dateTime
    ? new Date(tm.dates.start.dateTime)
    : tm.dates?.start?.localDate
    ? new Date(tm.dates.start.localDate)
    : null;
  if (!startDate || isNaN(startDate.getTime())) return null;

  // Cover image: prefer real (non-fallback) photos so the feed isn't a sea
  // of generic stock images. We tolerate fallbacks but tag them so consumers
  // can filter the worst noise later.
  const cover = pickCoverImage(tm.images);

  return {
    source: "ticketmaster",
    sourceId: tm.id,
    title: tm.name,
    description: tm.info || tm.pleaseNote || "",
    image: cover.url,
    hasRealImage: !cover.isFallback,
    // Detail-page gallery: ONLY real images, deduped by URL, sorted by width.
    // Skips the generic fallbacks so the gallery doesn't repeat the same
    // stock photo at 6 sizes.
    images: (() => {
      const seen = new Set();
      return (tm.images || [])
        .filter((i) => !i.fallback && i.url && !seen.has(i.url) && seen.add(i.url))
        .sort((a, b) => (b.width || 0) - (a.width || 0))
        .map((i) => i.url);
    })(),
    date: startDate,
    endDate: tm.dates?.end?.dateTime ? new Date(tm.dates.end.dateTime) : undefined,
    timezone: tm.dates?.timezone || "",
    location: [venue.name, venue.city?.name].filter(Boolean).join(", "),
    venueName: venue.name || "",
    address: venue.address?.line1 || "",
    city: venue.city?.name || "",
    state: venue.state?.stateCode || venue.state?.name || "",
    country: venue.country?.countryCode || venue.country?.name || "",
    geo:
      lat != null && lng != null
        ? { type: "Point", coordinates: [lng, lat] }
        : undefined,
    priceMin: price.min ?? null,
    priceMax: price.max ?? null,
    currency: price.currency || "USD",
    ticketUrl: tm.url,
    category: classification.segment?.name || "",
    genre: classification.genre?.name || "",
    subGenre: classification.subGenre?.name || "",
    performers: attractions.map((a) => a.name).filter(Boolean),
    fetchedAt: new Date(),
    // Hide after the event ends (or 24h after start if no end given)
    expiresAt: tm.dates?.end?.dateTime
      ? new Date(tm.dates.end.dateTime)
      : new Date(startDate.getTime() + 24 * 60 * 60 * 1000),
    isActive: true,
  };
}

/**
 * Fetch events for one city from Ticketmaster. Returns the upstream events
 * array (raw) — caller handles normalization + upsert.
 *
 * `city` is a city name string. Ticketmaster also accepts `latlong`,
 * `dmaId`, `marketId` — we use city name for simplicity and let upstream
 * resolve.
 */
/** Format Node fetch errors into something humans can actually debug. */
function describeFetchError(err) {
  if (!err) return "unknown";
  // Node's native fetch wraps the real reason in `cause` (DNS, TLS, timeout…)
  const cause = err.cause;
  if (cause) {
    const code = cause.code || cause.errno;
    const sub = cause.message || cause.errorMessage || "";
    return `${err.message} → ${code || "?"} ${sub}`.trim();
  }
  return err.message || String(err);
}

/** Wait helper used between retries + city iterations. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with retry/backoff on transient failures. We retry network errors
 * (DNS hiccup, socket reset, timeout) and 5xx/429 responses up to 3 times.
 * 4xx other than 429 are NOT retried — they're our fault, won't resolve by
 * trying again.
 */
async function fetchWithRetry(url, { timeoutMs = 15_000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`Ticketmaster ${res.status}`);
      } else {
        const body = await res.text().catch(() => "");
        throw new Error(`Ticketmaster ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // Don't retry 4xx (they were re-thrown above)
      if (err.message?.match(/Ticketmaster 4\d\d/)) throw err;
    }
    if (attempt < retries - 1) {
      // Exponential backoff: 500ms, 1.5s, 4.5s
      await sleep(500 * Math.pow(3, attempt));
    }
  }
  throw lastErr ?? new Error("fetch failed after retries");
}

async function fetchCityPage({ city, countryCode, page = 0, size = 200, apiKey }) {
  const params = new URLSearchParams({
    apikey: apiKey,
    city,
    size: String(size),
    page: String(page),
    sort: "date,asc",
    // Only pull future events
    startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
  if (countryCode) params.set("countryCode", countryCode);

  const url = `${API_BASE}/events.json?${params.toString()}`;
  const res = await fetchWithRetry(url);
  return res.json();
}

/**
 * Pull all pages for a city, upsert into Mongo, return counts.
 * Stops at `maxPages` to bound free-tier consumption.
 */
export async function ingestCity({ city, countryCode = "US", maxPages = 3 }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("TICKETMASTER_API_KEY not configured");

  let upserted = 0;
  let skipped = 0;

  for (let page = 0; page < maxPages; page++) {
    const data = await fetchCityPage({ city, countryCode, page, apiKey });
    const events = data._embedded?.events || [];
    if (events.length === 0) break;

    // Sequential upserts (small batches; avoid rate-limit blowouts)
    for (const tm of events) {
      const doc = normalize(tm);
      if (!doc) {
        skipped++;
        continue;
      }
      await ExternalEvent.updateOne(
        { source: doc.source, sourceId: doc.sourceId },
        { $set: doc },
        { upsert: true }
      );
      upserted++;
    }

    // Stop early if this was the last page
    const totalPages = data.page?.totalPages ?? 1;
    if (page + 1 >= totalPages) break;

    // Soft pacing: Ticketmaster allows 5 req/sec, but we don't need to push it
    await new Promise((r) => setTimeout(r, 250));
  }

  return { city, countryCode, upserted, skipped };
}

/**
 * Ingest a list of cities, aggregate the results.
 * Failures on one city don't poison the others.
 */
export async function ingestCities(cities) {
  const results = [];
  for (const { city, countryCode } of cities) {
    try {
      const r = await ingestCity({ city, countryCode });
      console.log(`[TM] ${city} (${countryCode}): upserted ${r.upserted}, skipped ${r.skipped}`);
      results.push({ ok: true, ...r });
    } catch (err) {
      // Surface the real underlying cause (DNS, TLS, timeout) so we can
      // actually diagnose instead of staring at "fetch failed".
      const reason = describeFetchError(err);
      console.error(`[TM] ${city} (${countryCode}) failed: ${reason}`);
      results.push({ ok: false, city, countryCode, error: reason });
    }
  }
  return results;
}

/** Soft-delete events that have ended. Called from the same job. */
export async function deactivateExpiredEvents() {
  const res = await ExternalEvent.updateMany(
    { isActive: true, expiresAt: { $lt: new Date() } },
    { $set: { isActive: false } }
  );
  return res.modifiedCount;
}
