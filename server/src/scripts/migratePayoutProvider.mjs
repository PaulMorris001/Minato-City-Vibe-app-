/**
 * One-off migration for the Stripe → PayPal cutover (Sep 2026).
 *
 * PayPal replaced Stripe on both sides: collection and settlement. Collection
 * needs no migration — a PaymentIntent either completed before the deploy or it
 * did not. Settlement does, because `hasPayoutOnboarding` now asks for a PayPal
 * address, and every seller who was fully set up on Stripe Connect reads as
 * un-onboarded the moment this ships. That BLOCKS PAID-EVENT CREATION for them
 * until they add one.
 *
 * No script can invent that address, so this one cannot fix the problem — it
 * exists to size it and name the people affected, so the release can be paired
 * with outreach instead of discovering it through support tickets.
 *
 * It does four things, in order:
 *
 *  1. REPORTS the payout landscape grouped by (provider, status). Read this
 *     before letting the script change anything.
 *  2. LISTS sellers who lose payout capability: Connect-onboarded, no PayPal
 *     address. These need an email and an in-app prompt.
 *  3. REPORTS unpaid "stripe" payouts. These must be drained — approved or
 *     rejected — before the Connect account is closed. runTransfer keeps its
 *     Connect branch precisely so they still execute.
 *  4. UNSETS the now-stale `payoutProvider: "stripe"` on sales whose money has
 *     NOT yet moved. The release job re-derives the rail from the seller at
 *     approval time, so the stored label is both wrong and unused; a value
 *     naming a rail that no longer takes new payouts is worse than an absent
 *     one. Settled sales keep theirs — there it is a true historical record.
 *
 * Deliberately NOT touching the `stripe*` fields on users: unlike the Wise
 * migration, those are still read by the draining Connect payouts, and they are
 * the only record of where a pre-cutover seller was paid.
 *
 * Idempotent — safe to re-run. ALWAYS dry-run first:
 *
 *   cd server && node src/scripts/migratePayoutProvider.mjs --dry-run
 *   cd server && node src/scripts/migratePayoutProvider.mjs
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

/** Statuses where the money is still owed and the doc still needs a rail. */
const UNPAID = ["awaiting_approval", "processing", "failed"];

const DRY_RUN = process.argv.includes("--dry-run");

async function report(label) {
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

  console.log(`\n📊 ${label} (amounts in each doc's own units):`);
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

async function listSellersLosingPayouts() {
  // Anyone who completed Connect onboarding and has no PayPal address on file.
  const affected = await User.find({
    stripeOnboardingComplete: true,
    $or: [{ paypalPayoutEmail: { $exists: false } }, { paypalPayoutEmail: "" }],
  })
    .select(`${PAYOUT_ROUTING_FIELDS} username email stripeAccountCountry`)
    .lean();

  console.log(`\n🚨 Sellers who lose payout capability until they add a PayPal address: ${affected.length}`);
  if (affected.length === 0) return affected;

  console.log("   These accounts cannot create paid listings until they act.");
  for (const u of affected) {
    const country = u.location?.country || u.stripeAccountCountry || "?";
    // A seller who moved to a country PayPal can't reach is a different, worse
    // problem — they have no rail at all now, and outreach can't fix it.
    const rail = getSettlementProvider(u);
    const flag = rail === "paypal" ? "" : "  ⚠️  NO RAIL AT ALL — needs manual handling";
    console.log(`   ${u._id}  ${String(u.username || "?").padEnd(20)} ${String(country).padEnd(18)} ${u.email || "-"}${flag}`);
  }
  return affected;
}

async function reportUnpaidStripePayouts() {
  const unpaid = await Payout.find({
    provider: "stripe",
    status: { $in: UNPAID },
  }).lean();

  console.log(`\n💸 Unpaid "stripe" payouts still to drain: ${unpaid.length}`);
  for (const p of unpaid) {
    console.log(
      `   ${p._id} — ${p.currency} ${p.amount} (${p.status}, ${p.relatedType} ${p.relatedId})`
    );
  }
  if (unpaid.length > 0) {
    console.log(
      "   Approve or reject these in the admin queue BEFORE closing the Stripe\n" +
        "   Connect account. runTransfer still executes them."
    );
  }
  return unpaid.length;
}

async function unsetStalePayoutProvider() {
  // Only where the money has not moved. `transferred` / `transferRef` is what
  // marks a settled sale, so their absence means the payout is still ahead.
  const targets = [
    ["tickets", Ticket, { payoutProvider: "stripe", transferred: { $ne: true } }],
    ["bookings", Booking, { payoutProvider: "stripe", transferRef: { $in: [null, ""] } }],
    ["orders", Order, { payoutProvider: "stripe", transferRef: { $in: [null, ""] } }],
  ];

  console.log(`\n🧹 Stale payoutProvider "stripe" on unsettled sales:`);
  let total = 0;
  for (const [name, Model, match] of targets) {
    const count = await Model.countDocuments(match);
    total += count;
    console.log(`   ${name}: ${count}${DRY_RUN ? " [dry-run]" : ""}`);
    if (!DRY_RUN && count > 0) {
      await Model.updateMany(match, { $unset: { payoutProvider: "" } });
    }
  }
  return total;
}

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes will be made\n");

  await report("Payouts by provider + status");
  const affected = await listSellersLosingPayouts();
  const unpaidStripe = await reportUnpaidStripePayouts();
  const cleared = await unsetStalePayoutProvider();

  console.log(
    `\n${DRY_RUN ? "🔍 Would have:" : "✅ Done:"} cleared ${cleared} stale payoutProvider value(s).`
  );
  console.log(
    `\n⚠️  Action required outside this script:\n` +
      `   • ${affected.length} seller(s) must add a PayPal payout address before they can\n` +
      `     sell again. Email them and make sure the in-app payout prompt is live.\n` +
      `   • ${unpaidStripe} Stripe payout(s) must be drained through the admin queue.`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
