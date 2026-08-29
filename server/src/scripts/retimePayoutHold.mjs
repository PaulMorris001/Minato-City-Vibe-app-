/**
 * One-off migration: shorten the ticket payout hold from 48h to 24h after the
 * event.
 *
 * `payoutDelayHours` is a schema default, so it is written onto every event doc
 * at creation. Changing the default in event.model.js only affects events
 * created from here on — every existing paid event still carries a stored 48.
 * This rewrites those.
 *
 * Only events whose payout has NOT been released are touched. A released event
 * keeps the 48 it was actually paid out under, so the earnings screen's
 * historical "released at" reasoning stays true to what happened.
 *
 * Events that fall due under the new window are picked up by
 * jobs/payoutRelease.job.js on its next scan (every 30 minutes, plus once on
 * boot) — they are queued for admin approval, not paid out, so nothing moves
 * money without a human.
 *
 * Idempotent — safe to re-run. Dry-run first:
 *
 *   cd server && node src/scripts/retimePayoutHold.mjs --dry-run
 *   cd server && node src/scripts/retimePayoutHold.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import Event from "../models/event.model.js";

const OLD_HOURS = 48;
const NEW_HOURS = 24;

const DRY_RUN = process.argv.includes("--dry-run");

const MATCH = {
  payoutDelayHours: OLD_HOURS,
  payoutStatus: { $ne: "released" },
};

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes will be made\n");

  const events = await Event.find(MATCH).select("_id title date payoutStatus").lean();
  console.log(`\n⏱  Events still on a ${OLD_HOURS}h hold: ${events.length}`);

  const now = new Date();
  let newlyDue = 0;

  for (const evt of events) {
    const dueAt = new Date(new Date(evt.date).getTime() + NEW_HOURS * 60 * 60 * 1000);
    const due = dueAt <= now;
    if (due) newlyDue += 1;
    console.log(
      `   ${evt._id} — ${evt.title} (${evt.payoutStatus}) → due ${dueAt.toISOString()}` +
        `${due ? "  ⬅ due now" : ""}`
    );
  }

  if (!DRY_RUN && events.length) {
    await Event.updateMany(MATCH, { payoutDelayHours: NEW_HOURS });
  }

  console.log(
    `\n${DRY_RUN ? "🔍 Would have retimed" : "✅ Retimed"} ${events.length} event(s) to ` +
      `${NEW_HOURS}h; ${newlyDue} of them are already past the new window and will be ` +
      `queued for admin approval on the job's next scan.`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
