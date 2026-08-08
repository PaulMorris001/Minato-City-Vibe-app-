/**
 * One-off migration for the Wise rail removal.
 *
 * The Wise settlement rail is gone. It never actually worked (the API
 * credentials were always placeholders), but it WAS the default `provider` on
 * payouts for every seller outside Nigeria and the Stripe Connect footprint —
 * so there are real, unpaid Payout documents denominated in real money sitting
 * on a rail that can no longer execute. This script finds them and moves them
 * somewhere an admin can act on.
 *
 * It does four things, in order:
 *
 *  1. REPORTS the payout landscape grouped by (provider, status). Read this
 *     before letting the script change anything.
 *  2. RETIRES legacy cents-denominated "stripe" payouts (created before the
 *     Connect rail was reinstated). These store CENTS in `amount` where every
 *     live rail stores major units, so executing one would transfer 100× the
 *     intended sum. They are rejected, never rescaled — see the note below.
 *  3. REMAPS unpaid "wise" payouts onto Stripe Connect where the seller's
 *     country can reach it, and fails the rest with an explicit reason so they
 *     stay visible in the admin queue's `failed` filter instead of vanishing.
 *  4. UNSETS the dead `wise*` fields on users and the stale `payoutProvider` on
 *     tickets/bookings/orders.
 *
 * Deliberately NOT rescaling the cents payouts: dividing by 100 in a script
 * assumes every matching doc is genuinely from that era and genuinely in cents.
 * If money is truly owed, the safe fix is a fresh Payout with the correct major
 * amount, created by hand after checking the original charge.
 *
 * Amounts on "wise" payouts are already major USD, so the remap in step 3 is
 * unit-safe.
 *
 * Idempotent — safe to re-run. ALWAYS dry-run first:
 *
 *   cd server && node src/scripts/migrateDropWise.mjs --dry-run
 *   cd server && node src/scripts/migrateDropWise.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import Payout from "../models/payout.model.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import { Booking } from "../models/booking.model.js";
import { Order } from "../models/order.model.js";
import {
  getSettlementProvider,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";

/** Cutover after which "stripe" payouts store MAJOR units. See payout.model.js. */
const CONNECT_REINSTATED_AT = new Date("2026-08-01T00:00:00Z");

/** Statuses where the money is still owed and the doc is worth rescuing. */
const UNPAID = ["awaiting_approval", "processing", "failed"];

const DRY_RUN = process.argv.includes("--dry-run");

async function report() {
  const rows = await Payout.aggregate([
    {
      $group: {
        _id: { provider: "$provider", status: "$status" },
        count: { $sum: 1 },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.provider": 1, "_id.status": 1 } },
  ]);

  console.log("\n📊 Payouts by provider + status (amounts in each doc's own units):");
  if (rows.length === 0) {
    console.log("   (none)");
    return;
  }
  for (const r of rows) {
    console.log(
      `   ${String(r._id.provider).padEnd(12)} ${String(r._id.status).padEnd(18)} ` +
        `${String(r.count).padStart(5)} doc(s)   Σ ${r.total.toFixed(2)}`
    );
  }
}

async function retireLegacyCentsPayouts() {
  const legacy = await Payout.find({
    provider: "stripe",
    status: { $in: UNPAID },
    createdAt: { $lt: CONNECT_REINSTATED_AT },
  }).lean();

  console.log(`\n🧾 Legacy cents-denominated "stripe" payouts: ${legacy.length}`);
  for (const p of legacy) {
    console.log(
      `   ${p._id} — ${p.currency} ${p.amount} (${p.status}, ${p.relatedType}) ` +
        `→ reject${DRY_RUN ? " [dry-run]" : ""}`
    );
  }
  if (DRY_RUN || legacy.length === 0) return legacy.length;

  await Payout.updateMany(
    { _id: { $in: legacy.map((p) => p._id) } },
    {
      status: "rejected",
      rejectedReason:
        "Legacy cents-denominated pre-Connect payout — superseded. Re-issue by hand if still owed.",
    }
  );
  return legacy.length;
}

async function remapWisePayouts() {
  const wisePayouts = await Payout.find({
    provider: "wise",
    status: { $in: UNPAID },
  }).lean();

  console.log(`\n💸 Unpaid "wise" payouts to remap: ${wisePayouts.length}`);
  if (wisePayouts.length === 0) return { remapped: 0, failed: 0 };

  // One lookup per distinct vendor rather than per payout.
  const vendorIds = [...new Set(wisePayouts.map((p) => String(p.vendor)))];
  const vendors = await User.find({ _id: { $in: vendorIds } })
    .select(PAYOUT_ROUTING_FIELDS)
    .lean();
  const vendorById = new Map(vendors.map((v) => [String(v._id), v]));

  const toStripe = [];
  const toFail = [];

  for (const p of wisePayouts) {
    const vendor = vendorById.get(String(p.vendor));
    const rail = getSettlementProvider(vendor);
    // Only Connect can take over a Wise payout: the amount is major USD, which
    // is exactly what the Connect rail expects. A Paystack result here would
    // mean the seller changed country to Nigeria since the sale — the currency
    // wouldn't match, so leave it for a human.
    if (rail === "stripe") {
      toStripe.push(p);
      console.log(
        `   ${p._id} — ${p.currency} ${p.amount} → stripe ` +
          `(vendor in ${vendor?.location?.country || "?"})`
      );
    } else {
      toFail.push(p);
      console.log(
        `   ${p._id} — ${p.currency} ${p.amount} → failed ` +
          `(no rail for ${vendor?.location?.country || "unknown country"})`
      );
    }
  }

  if (DRY_RUN) return { remapped: toStripe.length, failed: toFail.length };

  if (toStripe.length) {
    await Payout.updateMany(
      { _id: { $in: toStripe.map((p) => p._id) } },
      // Reset to awaiting_approval: these were never actually attempted (the
      // Wise rail could not run), so an admin should see them as fresh work
      // rather than as previously-failed transfers.
      { provider: "stripe", status: "awaiting_approval", error: null }
    );
  }
  if (toFail.length) {
    await Payout.updateMany(
      { _id: { $in: toFail.map((p) => p._id) } },
      {
        status: "failed",
        error: "No payout rail is available in this seller's country",
      }
    );
  }

  return { remapped: toStripe.length, failed: toFail.length };
}

async function unsetDeadFields() {
  const userMatch = {
    $or: [
      { wiseRecipientId: { $exists: true } },
      { wiseRecipientCurrency: { $exists: true } },
      { wiseOnboardingComplete: { $exists: true } },
    ],
  };
  const userCount = await User.countDocuments(userMatch);

  const saleCounts = {};
  for (const [name, Model] of [["tickets", Ticket], ["bookings", Booking], ["orders", Order]]) {
    saleCounts[name] = await Model.countDocuments({ payoutProvider: "wise" });
  }

  console.log(`\n🧹 Dead fields to unset:`);
  console.log(`   users with wise* fields: ${userCount}`);
  for (const [name, count] of Object.entries(saleCounts)) {
    console.log(`   ${name} with payoutProvider "wise": ${count}`);
  }
  if (DRY_RUN) return;

  if (userCount) {
    await User.updateMany(userMatch, {
      $unset: { wiseRecipientId: "", wiseRecipientCurrency: "", wiseOnboardingComplete: "" },
    });
  }
  // Informational only — nothing reads these for money movement — but a stale
  // value naming a rail that no longer exists is worse than an absent one.
  for (const Model of [Ticket, Booking, Order]) {
    await Model.updateMany({ payoutProvider: "wise" }, { $unset: { payoutProvider: "" } });
  }
}

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes will be made\n");

  await report();
  const legacyCount = await retireLegacyCentsPayouts();
  const { remapped, failed } = await remapWisePayouts();
  await unsetDeadFields();

  console.log(
    `\n${DRY_RUN ? "🔍 Would have:" : "✅ Done:"} rejected ${legacyCount} legacy payout(s), ` +
      `remapped ${remapped} to Stripe, failed ${failed} with no rail.`
  );
  if (!DRY_RUN) {
    await report();
    console.log(
      "\n⚠️  Review the admin Payouts queue: remapped docs are awaiting_approval and " +
        "the failed ones need a manual decision."
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
