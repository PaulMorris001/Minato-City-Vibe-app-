import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import Payout from "../models/payout.model.js";
import {
  getSettlementProvider,
  hasPayoutOnboarding,
  payoutSupported,
  payoutCountryKnown,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";
import { createPayout } from "../services/payments/payout.service.js";
import { getPaypalPayoutStatus } from "../controllers/paypal.controller.js";
import { notifyUser } from "../services/notification.service.js";

/**
 * Convert a ticket-sales net (held in the COLLECTION provider's units) into the
 * settlement provider's payout units — always major, see payout.model.js.
 *  - Paystack collects in major local units and settles them as-is.
 *  - Everything else is stored in cents (PayPal today, Stripe historically) and
 *    settles in major USD, so ÷ 100.
 *
 * PayPal storing cents is deliberate even though its API speaks major units:
 * `currency` is USD for both PayPal and legacy Stripe sales, so it could not
 * tell them apart, and a major-unit PayPal net divided here would pay the
 * organizer 1% of what they are owed. See settlePaypalPayment.js.
 */
function ticketPayoutAmount(totalNet, settlement) {
  if (settlement === "paystack") return totalNet; // already major local units
  return totalNet / 100; // cents → major USD
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
export async function releaseDuePayouts() {
  const now = new Date();

  // "awaiting_approval" and "released" are rescanned, not just "pending"/"failed":
  // a provider webhook can fulfill a batch ticket order hours after this job first
  // ran, and those late tickets used to be invisible here forever — the event had
  // already moved past the selectable states and `createPayout` is idempotent on
  // the reference, so the seller was simply never paid for them.
  const events = await Event.find({
    isPaid: true,
    isPublic: true,
    payoutStatus: { $in: ["pending", "failed", "awaiting_approval", "released"] },
    approvalStatus: "approved",
  }).lean();

  const due = events.filter((evt) => {
    const releaseAt = new Date(
      new Date(evt.date).getTime() + (evt.payoutDelayHours || 24) * 60 * 60 * 1000
    );
    return releaseAt <= now;
  });

  if (due.length === 0) return;

  console.log(`[PayoutRelease] Queuing ${due.length} event payout(s) for admin approval`);

  for (const evt of due) {
    try {
      // The two rescanned states are here only to catch tickets fulfilled late.
      // With none, the event is finished and must fall straight through — the
      // rail checks below would otherwise flip an already-released event to
      // "failed" and tell its organizer their payout is blocked.
      if (evt.payoutStatus === "released" || evt.payoutStatus === "awaiting_approval") {
        const late = await Ticket.countDocuments({
          event: evt._id,
          isValid: true,
          transferred: { $ne: true },
          refunded: { $ne: true },
          sellerNetCents: { $gt: 0 },
        });
        if (late === 0) continue;
      }

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
        // Guarded so a rescanned, already-released event isn't rewritten every
        // sweep just to restate what it already says.
        if (evt.payoutStatus !== "released") {
          await Event.updateOne(
            { _id: evt._id },
            { payoutStatus: "released", payoutReleasedAt: new Date() }
          );
        }
        continue;
      }

      const totalNet = unsettled.reduce((sum, t) => sum + t.sellerNetCents, 0);
      const amount = ticketPayoutAmount(totalNet, settlement);
      const currency = settlement === "paystack" ? unsettled[0].currency || "NGN" : "USD";

      // One payout normally covers every ticket on an event. But a payout that
      // has already moved money can never be revised, so tickets that arrive
      // afterwards — a provider webhook landing late, or a stuck order repaired
      // by hand — need a payout of their own. `unsettled` already excludes
      // everything a previous transfer marked settled, so a top-up is exactly the
      // late arrivals and cannot double-pay.
      const priorPayouts = await Payout.find({ relatedType: "ticket", relatedId: evt._id })
        .sort({ createdAt: 1 })
        .lean();
      const open = priorPayouts.find((p) => ["awaiting_approval", "failed"].includes(p.status));

      if (open) {
        // Not approved yet — fold the late tickets into the figure the admin sees
        // rather than queueing a second payout beside it.
        if (Number(open.amount) !== amount) {
          await Payout.updateOne(
            { _id: open._id },
            { amount, displayAmount: amount, currency, displayCurrency: currency }
          );
          console.log(
            `[PayoutRelease] Event ${evt._id} — payout ${open._id} revised to ${currency} ${amount} (${unsettled.length} unsettled tickets)`
          );
        }
      } else {
        // Idempotent on the reference — re-runs return the existing payout.
        const reference =
          priorPayouts.length === 0
            ? `event_payout_${evt._id}`
            : `event_payout_${evt._id}_${priorPayouts.length + 1}`;
        await createPayout({
          vendor: seller._id,
          relatedType: "ticket",
          relatedId: evt._id,
          provider: settlement,
          amount,
          currency,
          reference,
        });
        if (priorPayouts.length > 0) {
          console.log(
            `[PayoutRelease] Event ${evt._id} — TOP-UP payout queued for ${unsettled.length} ` +
              `late ticket(s) (${currency} ${amount}, ${reference})`
          );
        }
      }

      // Already-queued events are rescanned every sweep now; only announce the
      // transition, not the fact that it is still queued.
      if (evt.payoutStatus === "awaiting_approval") continue;

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

/**
 * Confirm that submitted PayPal payouts actually landed.
 *
 * PayPal Payouts is asynchronous: the API accepts a batch as PENDING and moves
 * the money afterwards, so `executePayout` marking a payout "paid" only means
 * "handed to PayPal". Without this sweep a payout PayPal later DENIED or
 * RETURNED would sit in the queue reading as paid forever and the seller would
 * never be told — the exact silent-failure shape the payout queue exists to
 * prevent.
 *
 * Only PayPal is polled: it is the one rail here whose result arrives neither
 * synchronously nor on a webhook we handle. A terminal success stamps
 * `settledAt` so the doc is never polled again.
 */
export async function reconcilePaypalPayouts() {
  // UNCLAIMED is not terminal — PayPal holds a payout to an address with no
  // account for 30 days before returning it, and the seller can still claim it.
  const TERMINAL_FAILURES = new Set(["DENIED", "FAILED", "RETURNED", "BLOCKED", "REFUNDED"]);
  // Beyond this there is nothing left to learn: an unclaimed payout has been
  // returned and a successful one long since stamped.
  const OLDEST = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  const submitted = await Payout.find({
    provider: "paypal",
    status: "paid",
    settledAt: { $exists: false },
    transferId: { $exists: true, $ne: null },
    updatedAt: { $gte: OLDEST },
  }).lean();

  if (submitted.length === 0) return;

  for (const payout of submitted) {
    try {
      const { status, itemStatus, error } = await getPaypalPayoutStatus(payout.transferId);
      const outcome = itemStatus || status;

      if (outcome === "SUCCESS") {
        await Payout.updateOne({ _id: payout._id }, { settledAt: new Date() });
        continue;
      }

      if (TERMINAL_FAILURES.has(outcome)) {
        await Payout.updateOne(
          { _id: payout._id },
          {
            status: "failed",
            error: `PayPal payout ${outcome}${error ? `: ${error}` : ""}`,
          }
        );
        console.error(
          `[PayoutRelease] PayPal payout ${payout._id} came back ${outcome} — ` +
            `reopened for admin action`
        );
        // Same wording as executePayout's failure path: the seller learns
        // something went wrong, never the raw provider message.
        await notifyUser(payout.vendor, {
          type: "payout_failed",
          title: "There was a problem with your payout",
          body:
            `We couldn't complete your payout just yet. Our team has been alerted ` +
            `and will sort it out — your money is safe.`,
          data: { payoutId: String(payout._id) },
        });
      }
      // PENDING / PROCESSING / UNCLAIMED: still in flight, check again next sweep.
    } catch (err) {
      // A failed status lookup says nothing about the payout — leave it alone
      // and retry next sweep rather than guessing.
      console.error(
        `[PayoutRelease] Couldn't check PayPal payout ${payout._id}:`,
        err?.message ?? err
      );
    }
  }
}

export function startPayoutReleaseJob() {
  // Run once on startup, then every 30 minutes
  const sweep = () =>
    releaseDuePayouts()
      .catch(console.error)
      .then(() => reconcilePaypalPayouts().catch(console.error));
  sweep();
  setInterval(sweep, 30 * 60 * 1000);
  console.log("[PayoutRelease] Job started — queuing due payouts every 30 minutes");
}
