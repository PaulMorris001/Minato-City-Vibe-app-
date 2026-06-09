import { ingestCities, deactivateExpiredEvents } from "../services/ticketmaster.service.js";

/**
 * Cities we actively ingest external events for.
 *
 * Add cities as you launch in new markets. Each city × source costs a handful
 * of API calls per run — Ticketmaster's 5K/day free tier comfortably supports
 * 50+ cities at 6h refresh.
 *
 * `countryCode` is ISO-3166 alpha-2. Required for Ticketmaster outside the US
 * because city names collide across countries (Lagos, Nigeria vs Lagos,
 * Portugal vs Lagos, NY).
 */
const TICKETMASTER_CITIES = [
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

  // Top Nigerian cities. Ticketmaster has near-zero coverage in Nigeria so
  // these will mostly return empty for now — including them is essentially
  // free and ready if coverage expands. For real Nigerian event coverage we
  // need a second provider (Tix.africa, Naijaticketshop, etc.) — TODO.
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

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function refreshExternalEvents() {
  console.log("[ExternalEvents] Refresh starting");
  const t0 = Date.now();

  try {
    const tmResults = await ingestCities(TICKETMASTER_CITIES);
    const upserted = tmResults.reduce((s, r) => s + (r.upserted || 0), 0);
    const failures = tmResults.filter((r) => !r.ok).length;
    console.log(
      `[ExternalEvents] Ticketmaster: upserted ${upserted} across ${tmResults.length} cities (${failures} failed)`
    );

    const deactivated = await deactivateExpiredEvents();
    if (deactivated > 0) {
      console.log(`[ExternalEvents] Deactivated ${deactivated} expired events`);
    }
  } catch (err) {
    console.error("[ExternalEvents] Refresh threw:", err);
  }

  console.log(`[ExternalEvents] Refresh done in ${Date.now() - t0}ms`);
}

/**
 * Start the refresh loop. Called once from server bootstrap.
 * Skips entirely if no API key is configured so dev environments don't spam logs.
 */
export function startExternalEventsRefresh() {
  if (!process.env.TICKETMASTER_API_KEY) {
    console.log("[ExternalEvents] TICKETMASTER_API_KEY not set — skipping refresh job");
    return;
  }

  // Wait 30s before the first run. On Render cold-starts, outbound
  // networking isn't always fully ready in the first few seconds — we've
  // observed simultaneous fetch failures across Ticketmaster + the location
  // proxy in the immediate-boot window. The cron-level refresh below is the
  // steady-state anyway; the boot run just primes data after a deploy.
  setTimeout(() => refreshExternalEvents().catch(console.error), 30_000);

  // Then every REFRESH_INTERVAL_MS
  setInterval(() => refreshExternalEvents().catch(console.error), REFRESH_INTERVAL_MS);
}
