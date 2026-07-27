import ExternalEvent from "../models/externalEvent.model.js";
import EventbritePlace from "../models/eventbritePlace.model.js";

const ORIGIN = "https://www.eventbrite.com";
const SEARCH_URL = `${ORIGIN}/api/v3/destination/search/`;

// Eventbrite's edge rejects obvious bot UAs outright; a normal desktop UA is
// required for both the landing pages and the search endpoint.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Eventbrite ingestion.
 *
 * ── Why this looks different from ticketmaster.service.js ──────────────────
 * Eventbrite RETIRED its public event-search API in February 2020. The
 * supported v3 API can only fetch an event by ID, list events for a known
 * venue ID, or list events for an organization you hold a token for. There is
 * no sanctioned "public events in city X" endpoint outside their gated
 * Distribution Partner programme.
 *
 * So this reads the same internal endpoint eventbrite.com's own search page
 * calls. That means:
 *   - It is UNDOCUMENTED and outside Eventbrite's Terms of Service.
 *   - It is unversioned and can change shape or start blocking without notice.
 *
 * Everything here is built on the assumption that it will eventually break:
 *   - Gated behind config.eventbrite.enabled (default OFF) so it can be killed
 *     without a deploy.
 *   - normalize() returns null rather than writing a half-parsed record.
 *   - A run that returns nothing NEVER deletes or deactivates existing rows.
 *
 * ── Request shape ─────────────────────────────────────────────────────────
 * The endpoint is CSRF-protected against its own web session:
 *   1. GET any /d/<country>--<city>/all-events/ page → sets a `csrftoken` cookie
 *   2. POST the search with that cookie + a matching X-CSRFToken header
 *      + Referer/Origin on eventbrite.com
 * Omitting any of those returns 401 ACCESS_DENIED.
 */

/** Wait helper used between retries + page iterations. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ── Session (CSRF) ─────────────────────────────────────────────────────────

/**
 * Cached CSRF session. Long-lived — we bootstrap lazily and only re-handshake
 * when the endpoint actually rejects us, never per request.
 */
let session = null;

function readSetCookies(res) {
  // getSetCookie() is the correct API (multiple Set-Cookie headers), but it
  // only landed in newer undici. Fall back to the folded single header.
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

/**
 * Fetch a landing page and harvest the CSRF cookie from it.
 * Returns { cookie, token } — `cookie` is the full Cookie header value to
 * replay, `token` is the csrftoken value the X-CSRFToken header must match.
 */
async function bootstrapSession() {
  const res = await fetchWithRetry(`${ORIGIN}/d/nigeria--lagos/all-events/`, {
    headers: { "User-Agent": USER_AGENT },
  });
  await res.text(); // drain so the socket can be reused

  const jar = [];
  let token = "";
  for (const raw of readSetCookies(res)) {
    const pair = raw.split(";")[0];
    jar.push(pair);
    const m = pair.match(/^csrftoken=(.+)$/);
    if (m) token = m[1];
  }

  if (!token) {
    throw new Error("Eventbrite: no csrftoken cookie in landing page response");
  }
  return { cookie: jar.join("; "), token };
}

async function getSession() {
  if (!session) session = await bootstrapSession();
  return session;
}

// ── HTTP ───────────────────────────────────────────────────────────────────

/**
 * fetch() with retry/backoff on transient failures. Mirrors the Ticketmaster
 * helper: retries network errors and 5xx/429, never other 4xx.
 */
async function fetchWithRetry(url, { timeoutMs = 15_000, retries = 3, ...init } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`Eventbrite ${res.status}`);
      } else {
        const body = await res.text().catch(() => "");
        const err = new Error(`Eventbrite ${res.status}: ${body.slice(0, 200)}`);
        err.statusCode = res.status;
        throw err;
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.statusCode) throw err; // 4xx re-thrown above — retrying won't help
    }
    if (attempt < retries - 1) {
      // Exponential backoff: 500ms, 1.5s, 4.5s
      await sleep(500 * Math.pow(3, attempt));
    }
  }
  throw lastErr ?? new Error("fetch failed after retries");
}

/**
 * POST the search endpoint with the CSRF session attached.
 *
 * A 401/403 means our session went stale — we drop it, re-handshake once, and
 * retry. If it fails again the endpoint has genuinely changed and we give up
 * rather than hammering it.
 */
async function postSearch(body, { referer, _retried = false } = {}) {
  const { cookie, token } = await getSession();
  try {
    const res = await fetchWithRetry(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-CSRFToken": token,
        Cookie: cookie,
        Referer: referer || `${ORIGIN}/d/nigeria--lagos/all-events/`,
        Origin: ORIGIN,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (err) {
    if (!_retried && (err.statusCode === 401 || err.statusCode === 403)) {
      session = null;
      return postSearch(body, { referer, _retried: true });
    }
    throw err;
  }
}

// ── Place IDs ──────────────────────────────────────────────────────────────

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** ISO-3166 alpha-2 → the country segment Eventbrite uses in /d/ slugs. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countrySlug(countryCode) {
  try {
    return slugify(regionNames.of(countryCode.toUpperCase()));
  } catch {
    return "";
  }
}

/**
 * Resolve Eventbrite's internal numeric place ID for a city.
 *
 * The ID only appears inside the embedded server data on the city's landing
 * page. We match it with a bounded pattern — a greedy `.*` against this ~700KB
 * page catastrophically backtracks.
 *
 * Results (including "no such place") are cached in Mongo forever; these are
 * stable registry IDs, not session values.
 */
export async function resolvePlaceId(city, countryCode) {
  const cached = await EventbritePlace.findOne({ city, countryCode }).lean();
  if (cached) return cached.placeId;

  const slug = `${countrySlug(countryCode)}--${slugify(city)}`;
  let placeId = null;

  try {
    const res = await fetchWithRetry(`${ORIGIN}/d/${slug}/all-events/`, {
      headers: { "User-Agent": USER_AGENT },
    });
    // A city Eventbrite doesn't recognise does NOT 404 — it 301s to the
    // country-level page (/d/nigeria--nowherecity/ → /d/nigeria/), which
    // carries a perfectly valid place ID for the whole COUNTRY. Taking that at
    // face value would quietly turn one unknown city into a country-wide
    // sweep, duplicated under every such city. Landing on a different slug
    // than we asked for means the city doesn't exist: record null.
    const landedOn = new URL(res.url).pathname;
    if (!landedOn.includes(`/d/${slug}/`)) {
      return await cachePlaceId({ city, countryCode, placeId: null, slug });
    }

    const html = await res.text();
    // Two independent anchors for the same value — the search filter array and
    // the page's own placeId key. Either alone has worked in testing; trying
    // both means a rename of one doesn't take resolution down with it.
    // Both patterns are bounded: a greedy `.*` against this ~700KB page
    // catastrophically backtracks (observed hanging a grep for minutes).
    const m =
      html.match(/"places"\s*:\s*\[\s*"?(\d{4,20})/) ||
      html.match(/"placeId"\s*:\s*"?(\d{4,20})/);
    placeId = m ? m[1] : null;
  } catch (err) {
    // A 404 means Eventbrite has no destination page for this city — that's a
    // real answer worth caching. Anything else is transient; don't poison the
    // cache with it.
    if (err.statusCode !== 404) throw err;
  }

  return await cachePlaceId({ city, countryCode, placeId, slug });
}

/** Persist a resolution result (including a null "no such place") and return it. */
async function cachePlaceId({ city, countryCode, placeId, slug }) {
  await EventbritePlace.updateOne(
    { city, countryCode },
    { $set: { placeId, slug, resolvedAt: new Date() } },
    { upsert: true }
  );
  return placeId;
}

// ── Normalization ──────────────────────────────────────────────────────────

/**
 * Convert a local wall-clock date+time in an IANA zone into a UTC instant.
 *
 * Eventbrite gives `start_date: "2026-08-21"`, `start_time: "19:00"` and
 * `timezone: "Africa/Lagos"` — but never a UTC instant, unlike Ticketmaster
 * which hands us `dateTime` directly. We derive the zone's offset at that
 * moment via Intl and subtract it. No dependency needed.
 *
 * Two passes: the first offset is measured at the naive instant, which can be
 * on the wrong side of a DST boundary; re-measuring at the corrected instant
 * settles it. Genuinely ambiguous/nonexistent local times (the DST fold) land
 * on one valid side, which is all any library can do either.
 */
function zonedToUtc(dateStr, timeStr, tz) {
  if (!dateStr) return null;
  const naive = new Date(`${dateStr}T${timeStr || "00:00"}:00Z`);
  if (isNaN(naive.getTime())) return null;
  if (!tz) return naive;

  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return naive; // unknown zone string — treat the wall clock as UTC
  }

  const offsetAt = (instant) => {
    const p = Object.fromEntries(
      fmt
        .formatToParts(instant)
        .filter((x) => x.type !== "literal")
        .map((x) => [x.type, x.value])
    );
    const asIfUtc = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +(p.hour === "24" ? "0" : p.hour),
      +p.minute,
      +p.second
    );
    return asIfUtc - instant.getTime();
  };

  let utc = new Date(naive.getTime() - offsetAt(naive));
  utc = new Date(naive.getTime() - offsetAt(utc));
  return isNaN(utc.getTime()) ? null : utc;
}

/**
 * Currency for free events, by country.
 *
 * Eventbrite's currency field is meaningless when an event is free — Lagos
 * events come back tagged 0.00 GBP / 0.00 EUR / 0.00 USD interchangeably,
 * reflecting the organizer's account rather than the event. So for free events
 * we derive from the venue country instead of trusting the payload.
 */
const COUNTRY_CURRENCY = {
  NG: "NGN",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  ZA: "ZAR",
  GH: "GHS",
  KE: "KES",
  AU: "AUD",
  AE: "AED",
  IN: "INR",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
};

/** Pull a tag's display name by Eventbrite's tag prefix. */
function tagByPrefix(tags, prefix) {
  return (tags || []).find((t) => t.prefix === prefix)?.display_name || "";
}

/**
 * Normalize one Eventbrite search result into our ExternalEvent shape.
 * Returns null for anything we should skip.
 *
 * `expectedCountry` is REQUIRED and load-bearing. A `places` filter that
 * Eventbrite doesn't recognise fails OPEN, not closed — a bad place ID returns
 * an unfiltered global dump (object_count 10000) rather than an error. Without
 * this guard one stale ID silently floods the feed with wrong-continent events.
 */
export function normalize(e, expectedCountry) {
  if (!e || e.is_cancelled) return null;

  // The model has no isVirtual field, and online events aren't tied to the
  // city we queried — they'd pollute every city feed with the same listings.
  if (e.is_online_event) return null;

  const venue = e.primary_venue || {};
  const addr = venue.address || {};
  const country = (addr.country || "").toUpperCase();

  if (!country) return null;
  if (expectedCountry && country !== expectedCountry.toUpperCase()) return null;

  const date = zonedToUtc(e.start_date, e.start_time, e.timezone);
  if (!date) return null;

  const ticketUrl = e.url || e.tickets_url;
  if (!e.name || !ticketUrl) return null;

  const endDate = zonedToUtc(e.end_date, e.end_time, e.timezone);

  // Eventbrite omits the image object entirely when there's no cover art —
  // there's no stock-fallback tier to detect like Ticketmaster has.
  const image = e.image?.original?.url || e.image?.url || "";

  const ticket = e.ticket_availability || {};
  const isFree = ticket.is_free === true;
  const minPrice = ticket.minimum_ticket_price;
  const maxPrice = ticket.maximum_ticket_price;
  const num = (v) => (v == null || v === "" ? null : Number(v));

  const lat = addr.latitude ? parseFloat(addr.latitude) : null;
  const lng = addr.longitude ? parseFloat(addr.longitude) : null;

  return {
    source: "eventbrite",
    sourceId: String(e.id),
    title: e.name,
    description: e.summary || "",
    image,
    hasRealImage: !!image,
    images: image ? [image] : [],
    date,
    endDate: endDate || undefined,
    timezone: e.timezone || "",
    location: [venue.name, addr.city].filter(Boolean).join(", "),
    venueName: venue.name || "",
    address: addr.localized_address_display || "",
    city: addr.city || "",
    state: addr.region || "",
    country,
    geo:
      lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
        ? { type: "Point", coordinates: [lng, lat] }
        : undefined,
    priceMin: isFree ? 0 : num(minPrice?.major_value),
    priceMax: isFree ? 0 : num(maxPrice?.major_value),
    currency: isFree
      ? COUNTRY_CURRENCY[country] || "USD"
      : minPrice?.currency || COUNTRY_CURRENCY[country] || "USD",
    ticketUrl,
    category: tagByPrefix(e.tags, "EventbriteCategory"),
    genre: "",
    subGenre: tagByPrefix(e.tags, "EventbriteSubCategory"),
    performers: [], // not exposed by this endpoint
    fetchedAt: new Date(),
    // Hide after the event ends (or 24h after start if no end given)
    expiresAt: endDate || new Date(date.getTime() + 24 * 60 * 60 * 1000),
    isActive: true,
  };
}

// ── Ingestion ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/** Fetch one page of results for a resolved place ID. */
async function fetchPlacePage({ placeId, page, referer }) {
  const data = await postSearch(
    {
      event_search: {
        dates: "current_future",
        dedup: true,
        places: [String(placeId)],
        page,
        page_size: PAGE_SIZE,
      },
      "expand.destination_event": [
        "primary_venue",
        "image",
        "ticket_availability",
        "primary_organizer",
      ],
    },
    { referer }
  );
  return data?.events || { results: [], pagination: {} };
}

/**
 * Fetch one page of RAW (un-normalized, un-persisted) results for a city.
 * Exported for the ingest script's --dry-run mode and for probing the endpoint
 * when it misbehaves. `placeId` may be passed to bypass resolution.
 */
export async function fetchCityEvents({ city, countryCode, page = 1, placeId }) {
  const resolved = placeId ?? (await resolvePlaceId(city, countryCode));
  if (!resolved) return { results: [], pagination: {}, placeId: null };
  const referer = `${ORIGIN}/d/${countrySlug(countryCode)}--${slugify(city)}/all-events/`;
  const data = await fetchPlacePage({ placeId: resolved, page, referer });
  return { ...data, placeId: resolved };
}

/**
 * Pull pages for one city, upsert into Mongo, return counts.
 * Stops at `maxPages` to bound how hard we lean on the endpoint.
 */
export async function ingestCity({ city, countryCode = "US", maxPages = 10 }) {
  const placeId = await resolvePlaceId(city, countryCode);
  if (!placeId) {
    return { city, countryCode, upserted: 0, skipped: 0, seen: 0, noPlace: true };
  }

  const referer = `${ORIGIN}/d/${countrySlug(countryCode)}--${slugify(city)}/all-events/`;
  let upserted = 0;
  let skipped = 0;
  let seen = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { results = [] } = await fetchPlacePage({ placeId, page, referer });
    if (results.length === 0) break;
    seen += results.length;

    for (const raw of results) {
      const doc = normalize(raw, countryCode);
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

    if (results.length < PAGE_SIZE) break; // partial page = last page

    // Soft pacing. We're a guest on an endpoint that owes us nothing.
    await sleep(1000);
  }

  return { city, countryCode, upserted, skipped, seen };
}

/**
 * Hide Eventbrite events outside the countries we currently ingest for.
 *
 * Keeps the collection consistent with EVENTBRITE_COUNTRIES when that list is
 * narrowed, without needing a migration. Deliberately a soft delete: if the
 * list is widened again the next run re-upserts these rows with isActive true,
 * so nothing is lost either way.
 */
export async function deactivateOutOfScope(countryCodes) {
  if (!countryCodes?.length) return 0;
  const res = await ExternalEvent.updateMany(
    {
      source: "eventbrite",
      isActive: true,
      country: { $nin: countryCodes.map((c) => c.toUpperCase()) },
    },
    { $set: { isActive: false } }
  );
  return res.modifiedCount;
}

/**
 * Ingest a list of cities, aggregate the results.
 * Failures on one city don't poison the others.
 */
export async function ingestCities(cities, { maxPages } = {}) {
  const results = [];
  for (const { city, countryCode } of cities) {
    try {
      const r = await ingestCity({ city, countryCode, maxPages });
      if (r.noPlace) {
        console.log(`[EB] ${city} (${countryCode}): no Eventbrite destination page`);
      } else {
        console.log(
          `[EB] ${city} (${countryCode}): upserted ${r.upserted}, skipped ${r.skipped} of ${r.seen} seen`
        );
      }
      results.push({ ok: true, ...r });
    } catch (err) {
      const reason = describeFetchError(err);
      console.error(`[EB] ${city} (${countryCode}) failed: ${reason}`);
      results.push({ ok: false, city, countryCode, error: reason });
    }
    await sleep(1500); // pacing between cities
  }
  return results;
}
