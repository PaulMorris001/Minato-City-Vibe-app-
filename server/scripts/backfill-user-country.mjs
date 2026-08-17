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
 * Some of those legacy cities were later re-created through findOrCreateCity,
 * WITH a country — so the collection holds two docs for the same place and
 * filling the country in blindly trips the unique (country, state, name) index.
 * Those pairs are reported, not merged: the legacy doc is the orphan (nothing
 * references it, and it double-lists the city in the vendor picker), so
 * --prune-duplicate-cities deletes it, but only when no vendor points at it.
 *
 * Usage:
 *   node scripts/backfill-user-country.mjs --dry-run   # report only
 *   node scripts/backfill-user-country.mjs             # apply
 *   node scripts/backfill-user-country.mjs --prune-duplicate-cities
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/user.model.js";
import { City, Vendor } from "../src/models/vendor.model.js";

const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE_DUPES = process.argv.includes("--prune-duplicate-cities");

const norm = (s) => (s || "").trim().toLowerCase();

// The City schema's own default. Legacy seed docs stored no country at all;
// this is the value the model says they have.
const CITY_DEFAULT_COUNTRY = City.schema.path("country").defaultValue;

async function backfillCities() {
  const stale = await City.find({
    $or: [{ country: { $exists: false } }, { country: null }, { country: "" }],
  }).select("name state");
  console.log(`cities with no country: ${stale.length}`);
  if (stale.length === 0) return;

  let filled = 0;
  let duplicates = 0;
  let pruned = 0;

  for (const city of stale) {
    // Per-doc rather than one updateMany: a single collision aborts the whole
    // batch, and half of these legacy docs collide.
    const twin = await City.findOne({
      _id: { $ne: city._id },
      name: city.name,
      state: city.state,
      country: CITY_DEFAULT_COUNTRY,
    }).select("_id");

    if (twin) {
      duplicates += 1;
      // Vendor.city is the only reference to a City anywhere in the schema, so
      // an unreferenced duplicate is inert data — safe to drop, and dropping it
      // stops the city appearing twice in the vendor picker.
      const referencedBy = await Vendor.countDocuments({ city: city._id });
      if (referencedBy > 0) {
        console.log(
          `  ! ${city.name} / ${city.state}: duplicate of ${twin._id} but ${referencedBy} vendor(s) point at it — left alone`
        );
        continue;
      }
      if (!PRUNE_DUPES) {
        console.log(
          `  ? ${city.name} / ${city.state}: duplicate of ${twin._id}, unreferenced — rerun with --prune-duplicate-cities to remove`
        );
        continue;
      }
      if (!DRY_RUN) await City.deleteOne({ _id: city._id });
      pruned += 1;
      console.log(`  − ${city.name} / ${city.state}: removed duplicate ${city._id}`);
      continue;
    }

    if (!DRY_RUN) await City.updateOne({ _id: city._id }, { $set: { country: CITY_DEFAULT_COUNTRY } });
    filled += 1;
    console.log(`  ✓ ${city.name} / ${city.state} → ${CITY_DEFAULT_COUNTRY}`);
  }

  console.log(
    `  ${DRY_RUN ? "[dry run] would fill" : "filled"}: ${filled}, ` +
      `duplicates: ${duplicates}${PRUNE_DUPES ? ` (pruned ${pruned})` : ""}`
  );
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
