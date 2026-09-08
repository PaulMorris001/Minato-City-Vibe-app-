/**
 * Seed the first Birthday Raffle campaign from the old hardcoded deadline.
 *
 * Before campaigns were a collection, the single raffle window was the constant
 * RAFFLE_CAMPAIGN_END in server/src/config/birthdayRaffle.js. This creates one
 * `raffleCampaign` row matching that window so nothing changes for the campaign
 * that's already live; after this runs, admins manage dates from the dashboard.
 *
 * Idempotent — if a campaign already exists it only backfills `prizes` on any
 * row that predates that field. Run once per environment:
 *
 *   cd server && node src/scripts/seedRaffleCampaign.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import RaffleCampaign from "../models/raffleCampaign.model.js";
import { RAFFLE_CAMPAIGN_END } from "../config/birthdayRaffle.js";
import { DEFAULT_RAFFLE_PRIZES } from "../services/raffleCampaign.service.js";

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);

  const existing = await RaffleCampaign.countDocuments();
  if (existing > 0) {
    const backfilled = await RaffleCampaign.updateMany(
      { $or: [{ prizes: { $exists: false } }, { prizes: { $size: 0 } }] },
      { $set: { prizes: DEFAULT_RAFFLE_PRIZES } }
    );
    console.log(
      `✓ ${existing} campaign(s) already exist — backfilled prizes on ${backfilled.modifiedCount}.`
    );
    return;
  }

  // The old constant only ever encoded an end; entries were gated by
  // `createdAt <= END` with no lower bound, so the seed's start is the epoch.
  const campaign = await new RaffleCampaign({
    name: "Birthday Raffle",
    startDate: new Date(0),
    endDate: RAFFLE_CAMPAIGN_END,
    prizes: DEFAULT_RAFFLE_PRIZES,
    status: "active",
    createdByAdmin: "seed-script",
  }).save();

  console.log(
    `✓ Seeded campaign "${campaign.name}" (${campaign.startDate.toISOString()} → ${campaign.endDate.toISOString()}) with ${campaign.prizes.length} prize tiers`
  );
}

main()
  .catch((err) => {
    console.error("❌ seedRaffleCampaign failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
