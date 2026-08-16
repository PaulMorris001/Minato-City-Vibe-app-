import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import {
  getSettlementProvider,
  hasPayoutOnboarding,
  payoutSupported,
  payoutCountryKnown,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";
import { createPayout } from "../services/payments/payout.service.js";
import { notifyUser } from "../services/notification.service.js";

/**
 * Convert a ticket-sales net (held in the COLLECTION provider's units) into the
 * settlement provider's payout units — always major, see payout.model.js.
 *  - Paystack collects in major local units and settles them as-is.
 *  - Everything else was Stripe-collected, i.e. cents, and settles in major USD,
 *    so ÷ 100. payout.service.js re-multiplies to cents at the Transfers API
 *    boundary.
 */
function ticketPayoutAmount(totalNet, settlement) {
  if (settlement === "paystack") return totalNet; // already major local units
  return totalNet / 100; // cents → major USD (stripe/Connect)
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
        `${PAYOUT_ROUTING_FIELDS} paystackBank username`
      );

      // Two different dead ends, and the organizer deserves to be told which.
      // This used to fail silently: the event flipped to "failed" and the only
      // trace was a banner on that one event's detail screen, which an organizer
      // has no reason to revisit after the event is over.
      //
      // Only notify on the pending → failed TRANSITION. The job rescans failed
      // events every 30 minutes forever, so notifying unconditionally would mean
      // two messages an hour for the rest of time.
      const wasPending = evt.payoutStatus === "pending";

      if (!payoutSupported(seller)) {
        // An organizer with no country on file is not the same as one in an
        // unsupported country: the first can fix it in Settings, the second
        // can't do anything. Both land here, so the copy has to split.
        const countryKnown = payoutCountryKnown(seller);
        await Event.updateOne(
          { _id: evt._id },
          {
            payoutStatus: "failed",
            payoutError: countryKnown
              ? "No payout rail is available in the organizer's country"
              : "The organizer has no location set, so we can't pick a payout rail",
          }
        );
        if (wasPending) {
          notifyUser(seller?._id, {
            type: "payout_blocked",
            title: "We can't release your payout yet",
            body: countryKnown
              ? `Payouts aren't available in your country yet, so the money from ` +
                `"${evt.title}" is being held safely. We'll release it as soon as we can pay you.`
              : `Set your location in Settings so we can pay you — the money from ` +
                `"${evt.title}" is being held safely until then.`,
            data: { eventId: String(evt._id) },
          });
        }
        console.warn(`[PayoutRelease] Skipping event ${evt._id} — no rail in organizer's country`);
        continue;
      }

      if (!hasPayoutOnboarding(seller)) {
        await Event.updateOne(
          { _id: evt._id },
          { payoutStatus: "failed", payoutError: "Organizer has no completed payout account" }
        );
        if (wasPending) {
          notifyUser(seller?._id, {
            type: "payout_action_required",
            title: "Finish your payout setup to get paid",
            body:
              `Your earnings from "${evt.title}" are ready, but we need your payout ` +
              `details first. Open Settings → Earnings to finish setting up.`,
            data: { eventId: String(evt._id) },
          });
        }
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
      const currency = settlement === "paystack" ? unsettled[0].currency || "NGN" : "USD";

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
        `[PayoutRelease] Event ${evt._id} — payout queued for approval (${currency} ${amount}, ${unsettled.length} tickets)`
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
