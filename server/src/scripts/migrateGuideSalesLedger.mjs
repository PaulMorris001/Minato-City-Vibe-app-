/**
 * Backfill the guide sales ledger (`guide.sales`).
 *
 * `purchasedBy` has always recorded WHO may read a guide, but not when they
 * bought it or what the author earned. The new `guide.sales` array records both,
 * and the earnings screen reads it — so without this backfill, every guide sold
 * before the ledger existed shows up as no sale and no revenue, which is the
 * exact "I sold something and it's not there" problem the screen exists to fix.
 *
 * Source of truth, in order of preference:
 *   1. The Payout doc for that sale (`reference: guide_<guideId>_<buyerId>`) —
 *      it has the real timestamp and the real net that was queued.
 *   2. The guide's CURRENT price, split by the platform fee, dated to the
 *      guide's updatedAt. Approximate by nature: a price edited after the sale
 *      is unrecoverable, which is precisely why the ledger exists now.
 *
 * Free guides (price 0) are recorded as unlocks with gross/net 0.
 *
 * Idempotent — only adds entries for buyers not already in `sales`. Run after
 * migrateDropWise.mjs:
 *
 *   cd server && node src/scripts/migrateGuideSalesLedger.mjs --dry-run
 *   cd server && node src/scripts/migrateGuideSalesLedger.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import Guide from "../models/guide.model.js";
import Payout from "../models/payout.model.js";
import { computeSplit } from "../services/payments/split.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes will be made\n");

  const guides = await Guide.find({ purchasedBy: { $exists: true, $ne: [] } });
  console.log(`Guides with purchases: ${guides.length}`);

  // One query for every guide payout, indexed by its reference.
  const payouts = await Payout.find({ relatedType: "guide" })
    .select("reference amount currency createdAt")
    .lean();
  const payoutByRef = new Map(payouts.map((p) => [p.reference, p]));
  console.log(`Guide payout records available: ${payouts.length}\n`);

  let guidesTouched = 0;
  let entriesAdded = 0;
  let fromPayout = 0;
  let fromPrice = 0;

  for (const guide of guides) {
    const alreadyLedgered = new Set((guide.sales || []).map((s) => String(s.user)));
    const missing = guide.purchasedBy.filter((id) => !alreadyLedgered.has(String(id)));
    if (missing.length === 0) continue;

    const entries = [];
    for (const buyerId of missing) {
      const payout = payoutByRef.get(`guide_${guide._id}_${buyerId}`);
      if (payout) {
        entries.push({
          user: buyerId,
          purchasedAt: payout.createdAt,
          // The payout amount IS the seller's net — no re-splitting.
          gross: guide.price || 0,
          net: Number(payout.amount || 0),
          currency: payout.currency || guide.currency || "USD",
        });
        fromPayout++;
      } else {
        const { sellerNet } = computeSplit(guide.price || 0);
        entries.push({
          user: buyerId,
          purchasedAt: guide.updatedAt || guide.createdAt,
          gross: guide.price || 0,
          net: guide.price > 0 ? sellerNet : 0,
          currency: guide.currency || "USD",
        });
        fromPrice++;
      }
      entriesAdded++;
    }

    guidesTouched++;
    console.log(
      `   "${guide.title}" — +${entries.length} ledger entr${entries.length === 1 ? "y" : "ies"}` +
        `${DRY_RUN ? " [dry-run]" : ""}`
    );

    if (!DRY_RUN) {
      // updateOne, not save(): save() re-validates the WHOLE document, and some
      // legacy guides predate the current price cap (max 100). Backfilling a
      // sales ledger must not fail — or silently rewrite — on an unrelated
      // field's validation rule.
      await Guide.updateOne({ _id: guide._id }, { $push: { sales: { $each: entries } } });
    }
  }

  console.log(
    `\n${DRY_RUN ? "🔍 Would have" : "✅"} backfilled ${entriesAdded} sale(s) across ` +
      `${guidesTouched} guide(s) — ${fromPayout} from payout records (exact), ` +
      `${fromPrice} estimated from the current price.`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
