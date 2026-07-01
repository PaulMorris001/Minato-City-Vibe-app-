import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import { getSettlementProvider, hasPayoutOnboarding } from "../services/payments/resolveProvider.js";
import { createPayout } from "../services/payments/payout.service.js";

/**
 * Convert a ticket-sales net (held in the collection provider's units) into the
 * settlement provider's payout units.
 *  - Stripe-collected nets are cents. Settling via Stripe keeps cents; settling
 *    via Wise needs major USD (cents / 100).
 *  - Flutterwave-collected nets are already major local units.
 */
function ticketPayoutAmount(totalNet, settlement) {
  if (settlement === "wise") return totalNet / 100; // cents → major USD
  return totalNet; // stripe: cents; flutterwave: major
}

/**
 * Delayed-payout job — now an APPROVAL feeder, not a money mover.
 *
 * For each paid event whose `date + payoutDelayHours` has elapsed, it creates a
 * single Payout record (status "awaiting_approval") for the organizer's net and
 * flags the event `awaiting_approval`. An admin then approves the payout, which
 * is when the actual transfer runs (see payout.service.executePayout). No money
 * leaves the platform here.
 */
async function releaseDuePayouts() {
  const now = new Date();

  const events = await Event.find({
    isPaid: true,
    isPublic: true,
    payoutStatus: { $in: ["pending", "failed"] },
    approvalStatus: "approved",
  }).lean();

  const due = events.filter((evt) => {
    const releaseAt = new Date(
      new Date(evt.date).getTime() + (evt.payoutDelayHours || 48) * 60 * 60 * 1000
    );
    return releaseAt <= now;
  });

  if (due.length === 0) return;

  console.log(`[PayoutRelease] Queuing ${due.length} event payout(s) for admin approval`);

  for (const evt of due) {
    try {
      const seller = await User.findById(evt.createdBy).select(
        "location stripeAccountId stripeOnboardingComplete flutterwaveBank flutterwaveOnboardingComplete wiseRecipientId wiseRecipientCurrency wiseOnboardingComplete username"
      );

      if (!hasPayoutOnboarding(seller)) {
        await Event.updateOne(
          { _id: evt._id },
          { payoutStatus: "failed", payoutError: "Organizer has no completed payout account" }
        );
        console.warn(`[PayoutRelease] Skipping event ${evt._id} — organizer not onboarded`);
        continue;
      }

      const settlement = getSettlementProvider(seller);

      const unsettled = await Ticket.find({
        event: evt._id,
        isValid: true,
        transferred: { $ne: true },
        refunded: { $ne: true },
        sellerNetCents: { $gt: 0 },
      });

      if (unsettled.length === 0) {
        await Event.updateOne(
          { _id: evt._id },
          { payoutStatus: "released", payoutReleasedAt: new Date() }
        );
        continue;
      }

      const totalNet = unsettled.reduce((sum, t) => sum + t.sellerNetCents, 0);
      const amount = ticketPayoutAmount(totalNet, settlement);
      const currency = settlement === "flutterwave" ? unsettled[0].currency || "NGN" : "USD";

      // Idempotent on the event — re-runs return the existing payout.
      await createPayout({
        vendor: seller._id,
        relatedType: "ticket",
        relatedId: evt._id,
        provider: settlement,
        amount,
        currency,
        reference: `event_payout_${evt._id}`,
      });

      await Event.updateOne(
        { _id: evt._id },
        { payoutStatus: "awaiting_approval", payoutError: null }
      );

      console.log(
        `[PayoutRelease] Event ${evt._id} — payout queued for approval (${currency} ${
          settlement === "stripe" ? (amount / 100).toFixed(2) : amount
        }, ${unsettled.length} tickets)`
      );
    } catch (err) {
      console.error(`[PayoutRelease] Error queuing event ${evt._id}:`, err?.message ?? err);
      await Event.updateOne(
        { _id: evt._id },
        { payoutStatus: "failed", payoutError: String(err?.message ?? err) }
      );
    }
  }
}

export function startPayoutReleaseJob() {
  // Run once on startup, then every 30 minutes
  releaseDuePayouts().catch(console.error);
  setInterval(() => releaseDuePayouts().catch(console.error), 30 * 60 * 1000);
  console.log("[PayoutRelease] Job started — queuing due payouts every 30 minutes");
}
