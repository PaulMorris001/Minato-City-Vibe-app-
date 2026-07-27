/**
 * Manually run Eventbrite ingestion for one city.
 *
 * The refresh job only fires 30s after boot and then every 6h, so this is the
 * practical way to test the integration — and, because the endpoint it reads
 * is undocumented and unversioned, the way to check whether it still works
 * after it inevitably changes one day.
 *
 * Usage:
 *   node scripts/ingest-eventbrite.mjs --city=Lagos --country=NG --pages=2 --dry-run
 *   node scripts/ingest-eventbrite.mjs --city=Lagos --country=NG --pages=2
 *
 * Flags:
 *   --city=<name>       required
 *   --country=<ISO2>    required (e.g. NG, US, GB)
 *   --pages=<n>         pages to pull, 20 events each (default 2)
 *   --place-id=<id>     bypass place-ID resolution; pass a deliberately wrong
 *                       one to exercise the country-mismatch guard
 *   --dry-run           normalize + print, write nothing to ExternalEvent
 *
 * Note --dry-run still writes the resolved place ID to the eventbritePlace
 * cache; that's a lookup table, not event data.
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import ExternalEvent from "../src/models/externalEvent.model.js";
import { fetchCityEvents, normalize } from "../src/services/eventbrite.service.js";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const CITY = arg("city");
const COUNTRY = (arg("country") || "").toUpperCase();
const PAGES = parseInt(arg("pages", "2"), 10);
const PLACE_ID = arg("place-id");
const DRY_RUN = process.argv.includes("--dry-run");

if (!CITY || !COUNTRY) {
  console.error("Usage: node scripts/ingest-eventbrite.mjs --city=Lagos --country=NG [--pages=2] [--place-id=N] [--dry-run]");
  process.exit(1);
}

async function run() {
  await connectDB();

  let seen = 0;
  let written = 0;
  const skips = { total: 0, wrongCountry: 0, online: 0, other: 0 };

  for (let page = 1; page <= PAGES; page++) {
    const { results = [], pagination = {}, placeId } = await fetchCityEvents({
      city: CITY,
      countryCode: COUNTRY,
      page,
      placeId: PLACE_ID,
    });

    if (page === 1) {
      if (!placeId) {
        console.log(`No Eventbrite destination page for ${CITY} (${COUNTRY}) — nothing to ingest.`);
        break;
      }
      console.log(`place_id=${placeId}  total_upstream=${pagination.object_count ?? "?"}\n`);
    }
    if (results.length === 0) break;
    seen += results.length;

    for (const raw of results) {
      const doc = normalize(raw, COUNTRY);
      if (!doc) {
        skips.total++;
        // Re-derive why, purely for the report.
        const c = (raw.primary_venue?.address?.country || "").toUpperCase();
        if (raw.is_online_event) skips.online++;
        else if (c && c !== COUNTRY) skips.wrongCountry++;
        else skips.other++;
        continue;
      }

      if (DRY_RUN) {
        const price =
          doc.priceMin === 0 && doc.priceMax === 0
            ? "free"
            : `${doc.priceMin ?? "?"}-${doc.priceMax ?? "?"} ${doc.currency}`;
        console.log(
          `${doc.date.toISOString().slice(0, 16).replace("T", " ")}  ` +
            `${doc.title.slice(0, 42).padEnd(44)}` +
            `${(doc.city + ", " + doc.country).padEnd(20)}` +
            `${price.padEnd(18)}${doc.hasRealImage ? "img" : "---"}  ${doc.ticketUrl.slice(0, 60)}`
        );
      } else {
        await ExternalEvent.updateOne(
          { source: doc.source, sourceId: doc.sourceId },
          { $set: doc },
          { upsert: true }
        );
      }
      written++;
    }

    if (results.length < 20) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `\n${CITY} (${COUNTRY}): ${seen} seen, ${written} ${DRY_RUN ? "would upsert" : "upserted"}, ` +
      `${skips.total} skipped (${skips.wrongCountry} wrong country, ${skips.online} online, ${skips.other} other)`
  );

  if (!DRY_RUN) {
    const total = await ExternalEvent.countDocuments({ source: "eventbrite", country: COUNTRY });
    console.log(`ExternalEvent now holds ${total} eventbrite rows for ${COUNTRY}.`);
  }

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
