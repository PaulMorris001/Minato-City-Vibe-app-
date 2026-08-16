/**
 * One-off backfill: fill in `location.country` for users who have a city but
 * no country.
 *
 * Payout routing is a pure function of `location.country`
 * (src/services/payments/resolveProvider.js), and an empty one lands in the
 * same "no rail reaches you" bucket as a genuinely unsupported country. Older
 * vendor onboarding only captured city + street address, so those accounts were
 * told payouts would never be available to them — in Houston and Lagos alike.
 *
 * What it can infer: the City collection that powers vendor discovery already
 * stores name + state + country, so a user whose `location.city` matches one
 * (and whose state matches, when both have one) gets that City's country.
 * Accounts with no city at all are NOT guessed — they're asked in the app
 * instead (Settings → Payout Setup, and the interests step on signup).
 *
 * Step 1 repairs the City collection itself: the original seed batch predates
 * the `country` field, so those docs have none stored even though the schema
 * declares `default: "United States"`. Writing the default in isn't a guess —
 * it's what the model already says a country-less City means — and without it
 * the users sitting in those cities can't be resolved either.
 *
 * Idempotent: cities and users that already have a non-empty country are never
 * touched, and a city name that matches several countries is skipped rather
 * than guessed.
 *
 * Usage:
 *   node scripts/backfill-user-country.mjs --dry-run   # report only
 *   node scripts/backfill-user-country.mjs             # apply
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/user.model.js";
import { City } from "../src/models/vendor.model.js";

const DRY_RUN = process.argv.includes("--dry-run");

const norm = (s) => (s || "").trim().toLowerCase();

// The City schema's own default. Legacy seed docs stored no country at all;
// this is the value the model says they have.
const CITY_DEFAULT_COUNTRY = City.schema.path("country").defaultValue;

async function backfillCities() {
  const missing = { $or: [{ country: { $exists: false } }, { country: null }, { country: "" }] };
  const count = await City.countDocuments(missing);
  console.log(`cities with no country: ${count}`);
  if (count === 0) return;

  if (DRY_RUN) {
    console.log(`  [dry run] would set country="${CITY_DEFAULT_COUNTRY}" on ${count} cities`);
    return;
  }
  const result = await City.updateMany(missing, { $set: { country: CITY_DEFAULT_COUNTRY } });
  console.log(`  set country="${CITY_DEFAULT_COUNTRY}" on ${result.modifiedCount} cities`);
}

async function run() {
  await connectDB();

  await backfillCities();

  const candidates = await User.find({
    "location.city": { $exists: true, $nin: [null, ""] },
    $or: [
      { "location.country": { $exists: false } },
      { "location.country": null },
      { "location.country": "" },
    ],
  }).select("_id username location");

  console.log(`users with a city but no country: ${candidates.length}`);
  if (candidates.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // One pass over the City collection — it's small, and this avoids a query
  // per user. The default fallback keeps --dry-run honest: step 1 hasn't
  // written it yet, but the apply run would see it.
  const cityDocs = await City.find({}).select("name state country").lean();

  const byCity = new Map();
  for (const city of cityDocs) {
    const key = norm(city.name);
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push({ ...city, country: city.country || CITY_DEFAULT_COUNTRY });
  }

  let filled = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const user of candidates) {
    const matches = byCity.get(norm(user.location.city)) || [];
    const state = norm(user.location.state);
    // Prefer a state match when the user has one; otherwise the city name alone
    // has to be unambiguous across countries.
    const scoped = state ? matches.filter((c) => norm(c.state) === state) : matches;
    const countries = [...new Set(scoped.map((c) => c.country))];

    if (countries.length === 0) {
      unmatched += 1;
      console.log(`  ~ ${user.username}: no City doc for "${user.location.city}"`);
      continue;
    }
    if (countries.length > 1) {
      ambiguous += 1;
      console.log(
        `  ? ${user.username}: "${user.location.city}" matches ${countries.join(", ")} — skipped`
      );
      continue;
    }

    console.log(`  ✓ ${user.username}: ${user.location.city} → ${countries[0]}`);
    if (!DRY_RUN) {
      user.location.country = countries[0];
      await user.save();
    }
    filled += 1;
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] would fill" : "filled"}: ${filled}, ` +
      `ambiguous: ${ambiguous}, unmatched: ${unmatched}`
  );

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("backfill-user-country failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
