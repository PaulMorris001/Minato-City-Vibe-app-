import { ingestCities as ingestTicketmaster, deactivateExpiredEvents } from "../services/ticketmaster.service.js";
import {
  ingestCities as ingestEventbrite,
  deactivateOutOfScope as deactivateEventbriteOutOfScope,
} from "../services/eventbrite.service.js";
import config from "../config/env.js";

/**
 * Cities we actively ingest external events for. Shared by every provider.
 *
 * Add cities as you launch in new markets. Each city × source costs a handful
 * of API calls per run — Ticketmaster's 5K/day free tier comfortably supports
 * 50+ cities at 6h refresh.
 *
 * `countryCode` is ISO-3166 alpha-2. Required outside the US because city
 * names collide across countries (Lagos, Nigeria vs Lagos, Portugal vs
 * Lagos, NY) — both providers key off it.
 */
const INGEST_CITIES = [
  // Top US event-heavy markets (where Ticketmaster has dense coverage)
  { city: "New York", countryCode: "US" },
  { city: "Los Angeles", countryCode: "US" },
  { city: "Chicago", countryCode: "US" },
  { city: "Las Vegas", countryCode: "US" },
  { city: "Atlanta", countryCode: "US" },
  { city: "Miami", countryCode: "US" },
  { city: "Dallas", countryCode: "US" },
  { city: "Houston", countryCode: "US" },
  { city: "San Francisco", countryCode: "US" },
  { city: "Nashville", countryCode: "US" },

  // Top Nigerian cities. Ticketmaster has near-zero coverage here and will
  // keep returning empty — Eventbrite is the provider that actually covers
  // this market (~160 upcoming events in Lagos alone).
  { city: "Lagos", countryCode: "NG" },
  { city: "Abuja", countryCode: "NG" },
  { city: "Port Harcourt", countryCode: "NG" },
  { city: "Ibadan", countryCode: "NG" },
  { city: "Kano", countryCode: "NG" },
  { city: "Benin City", countryCode: "NG" },
  { city: "Kaduna", countryCode: "NG" },
  { city: "Enugu", countryCode: "NG" },
  { city: "Jos", countryCode: "NG" },
  { city: "Onitsha", countryCode: "NG" },
];

/**
 * Countries Eventbrite is allowed to ingest for.
 *
 * Eventbrite was added to fill the Nigeria gap Ticketmaster can't cover, but it
 * also carries the whole class of US events Ticketmaster never lists —
 * community meetups, workshops, pop-ups, small-venue nights — so it runs over
 * the US markets too. The two sources overlap on big-ticket US shows; dedup is
 * by (source, sourceId), so an event listed on both providers appears once per
 * provider. That's accepted: they carry different ticket URLs and prices, and
 * collapsing them would mean guessing which listing is canonical.
 *
 * Add an ISO-3166 alpha-2 code here to widen it further (Ticketmaster is
 * unaffected; it still runs the full INGEST_CITIES list).
 */
const EVENTBRITE_COUNTRIES = ["NG", "US"];

const EVENTBRITE_CITIES = INGEST_CITIES.filter((c) =>
  EVENTBRITE_COUNTRIES.includes(c.countryCode)
);

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function refreshExternalEvents() {
  console.log("[ExternalEvents] Refresh starting");
  const t0 = Date.now();

  // Each provider gets its own try/catch: one going down must not abort the
  // others or the expiry sweep below.
  if (process.env.TICKETMASTER_API_KEY) {
    try {
      const tmResults = await ingestTicketmaster(INGEST_CITIES);
      const upserted = tmResults.reduce((s, r) => s + (r.upserted || 0), 0);
      const failures = tmResults.filter((r) => !r.ok).length;
      console.log(
        `[ExternalEvents] Ticketmaster: upserted ${upserted} across ${tmResults.length} cities (${failures} failed)`
      );
    } catch (err) {
      console.error("[ExternalEvents] Ticketmaster leg threw:", err);
    }
  }

  if (config.externalEvents.eventbrite.enabled) {
    try {
      const ebResults = await ingestEventbrite(EVENTBRITE_CITIES, {
        maxPages: config.externalEvents.eventbrite.maxPagesPerCity,
      });
      const upserted = ebResults.reduce((s, r) => s + (r.upserted || 0), 0);
      const failures = ebResults.filter((r) => !r.ok).length;
      const seen = ebResults.reduce((s, r) => s + (r.seen || 0), 0);

      // Health guard. We're reading an undocumented endpoint — if it changes
      // shape or starts blocking, every city goes quiet at once. Say so loudly
      // rather than letting the feed silently go stale. Note this only logs:
      // existing rows are left alone, and deactivation below is driven purely
      // by event dates, so a broken scrape can never delete good data.
      if (seen === 0) {
        console.error(
          "[ExternalEvents] Eventbrite returned 0 results across ALL cities — " +
            "endpoint may have changed or be blocking us. Existing events left untouched."
        );
      } else {
        console.log(
          `[ExternalEvents] Eventbrite: upserted ${upserted} of ${seen} seen across ${ebResults.length} cities (${failures} failed)`
        );
      }

      // Only prune once we know this run actually worked — otherwise a broken
      // endpoint would hide good rows on its way down.
      if (seen > 0) {
        const pruned = await deactivateEventbriteOutOfScope(EVENTBRITE_COUNTRIES);
        if (pruned > 0) {
          console.log(
            `[ExternalEvents] Eventbrite: hid ${pruned} events outside ${EVENTBRITE_COUNTRIES.join(", ")}`
          );
        }
      }
    } catch (err) {
      console.error("[ExternalEvents] Eventbrite leg threw:", err);
    }
  }

  try {
    const deactivated = await deactivateExpiredEvents();
    if (deactivated > 0) {
      console.log(`[ExternalEvents] Deactivated ${deactivated} expired events`);
    }
  } catch (err) {
    console.error("[ExternalEvents] Expiry sweep threw:", err);
  }

  console.log(`[ExternalEvents] Refresh done in ${Date.now() - t0}ms`);
}

/**
 * Start the refresh loop. Called once from server bootstrap.
 * Skips entirely if no provider is configured so dev environments don't spam logs.
 */
export function startExternalEventsRefresh() {
  const providers = [
    process.env.TICKETMASTER_API_KEY && "Ticketmaster",
    config.externalEvents.eventbrite.enabled && "Eventbrite",
  ].filter(Boolean);

  if (providers.length === 0) {
    console.log(
      "[ExternalEvents] No provider enabled (TICKETMASTER_API_KEY unset, " +
        "EVENTBRITE_ENABLED not true) — skipping refresh job"
    );
    return;
  }
  console.log(`[ExternalEvents] Providers enabled: ${providers.join(", ")}`);

  // Wait 30s before the first run. On Render cold-starts, outbound
  // networking isn't always fully ready in the first few seconds — we've
  // observed simultaneous fetch failures across Ticketmaster + the location
  // proxy in the immediate-boot window. The cron-level refresh below is the
  // steady-state anyway; the boot run just primes data after a deploy.
  setTimeout(() => refreshExternalEvents().catch(console.error), 30_000);

  // Then every REFRESH_INTERVAL_MS
  setInterval(() => refreshExternalEvents().catch(console.error), REFRESH_INTERVAL_MS);
}
