import stripe from "../config/stripe.js";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import { sendPushNotification } from "../services/notification.service.js";

/**
 * Delayed-payout job.
 *
 * For each paid event whose `date + payoutDelayHours` has elapsed and whose
 * payout has not been released, create Stripe Transfers from the platform
 * balance to the organizer's Connect account for every unsettled ticket.
 *
 * We transfer per-ticket (using `source_transaction = ticket.stripeChargeId`)
 * so refunds and disputes on individual tickets don't poison the whole batch,
 * and so each Transfer is naturally idempotent against its source charge.
 */
async function releaseDuePayouts() {
  const now = new Date();

  // Find paid events whose hold window has elapsed but payout isn't released
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

  console.log(`[PayoutRelease] Processing ${due.length} event(s) due for payout`);

  for (const evt of due) {
    try {
      const seller = await User.findById(evt.createdBy).select(
        "stripeAccountId stripeOnboardingComplete fcmToken username"
      );

      if (!seller?.stripeAccountId || !seller.stripeOnboardingComplete) {
        await Event.updateOne(
          { _id: evt._id },
          {
            payoutStatus: "failed",
            payoutError: "Organizer has no completed Stripe Connect account",
          }
        );
        console.warn(
          `[PayoutRelease] Skipping event ${evt._id} — organizer not onboarded`
        );
        continue;
      }

      // Find tickets that still need to be transferred
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

      const transferIds = [];
      let totalCents = 0;
      let anyFailed = false;

      for (const ticket of unsettled) {
        try {
          // Look up the PaymentIntent to grab the underlying charge id, which
          // lets Stripe automatically track this transfer against the original
          // payment (`source_transaction`).
          const pi = await stripe.paymentIntents.retrieve(
            ticket.stripePaymentIntentId
          );
          const chargeId = pi.latest_charge;
          if (!chargeId) {
            throw new Error(`PaymentIntent ${pi.id} has no charge`);
          }

          const transfer = await stripe.transfers.create(
            {
              amount: ticket.sellerNetCents,
              currency: "usd",
              destination: seller.stripeAccountId,
              source_transaction: chargeId,
              transfer_group: `event_${evt._id}`,
              metadata: {
                ticketId: ticket._id.toString(),
                eventId: evt._id.toString(),
                sellerId: seller._id.toString(),
              },
            },
            // Idempotency: one transfer per ticket, ever.
            { idempotencyKey: `ticket_transfer_${ticket._id}` }
          );

          ticket.transferred = true;
          ticket.transferId = transfer.id;
          await ticket.save();

          transferIds.push(transfer.id);
          totalCents += ticket.sellerNetCents;
        } catch (ticketErr) {
          anyFailed = true;
          console.error(
            `[PayoutRelease] Transfer failed for ticket ${ticket._id}:`,
            ticketErr?.message ?? ticketErr
          );
        }
      }

      const update = {
        $push: { payoutTransferIds: { $each: transferIds } },
      };

      if (anyFailed) {
        update.payoutStatus = "failed";
        update.payoutError = "One or more ticket transfers failed";
      } else {
        update.payoutStatus = "released";
        update.payoutReleasedAt = new Date();
        update.payoutError = null;
      }

      await Event.updateOne({ _id: evt._id }, update);

      if (transferIds.length > 0 && seller.fcmToken && !anyFailed) {
        await sendPushNotification(
          seller.fcmToken,
          "💸 Payout released",
          `Your payout for "${evt.title}" ($${(totalCents / 100).toFixed(
            2
          )}) is on its way.`,
          { type: "payout_released", eventId: String(evt._id) }
        );
      }

      console.log(
        `[PayoutRelease] Event ${evt._id} — ${transferIds.length}/${unsettled.length} transfers, $${(totalCents / 100).toFixed(2)} released`
      );
    } catch (err) {
      console.error(
        `[PayoutRelease] Error processing event ${evt._id}:`,
        err?.message ?? err
      );
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
  console.log("[PayoutRelease] Job started — checking every 30 minutes");
}
