/**
 * Stripe controller — collection-side, plus the shared refund path.
 *
 * Stripe's job is to CHARGE buyers into the platform balance (via the unified
 * /payments dispatcher) and to REFUND those charges. It never moves money to
 * sellers: settlement runs through the admin-approved Payout queue (Stripe
 * Connect for Stripe-collected sales, Paystack for NGN).
 *
 * `refundTicket` is provider-agnostic despite living here — it dispatches on
 * whichever provider collected the ticket, including PayPal once that rail is
 * switched on.
 */

import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import { sendPushNotification, notifyUser } from "../services/notification.service.js";
import { invalidateCachePattern } from "../utils/cache.js";
import { settleStripePurchase } from "../services/payments/settleStripePayment.js";
import { refundPaystackCharge } from "./paystack.controller.js";
import { refundPaypalCapture, findPaypalCaptureId } from "./paypal.controller.js";

/**
 * Return the publishable key that matches THIS server's secret key (same
 * Stripe account and same test/live mode). The mobile app fetches this at
 * startup so its publishable key can never drift out of sync with the secret
 * key used to create PaymentIntents — which previously produced
 * "client_secret does not match any associated PaymentIntent" errors when a
 * build baked in a test key against a live server (or vice versa).
 */
export const getStripeConfig = async (req, res) => {
  try {
    res.status(200).json({ publishableKey: config.stripe.publishableKey || "" });
  } catch (error) {
    console.error("Get stripe config error:", error);
    res.status(500).json({ message: "Failed to fetch Stripe config" });
  }
};

// ─── Refunds ─────────────────────────────────────────────────────────────────

/**
 * Refund a ticket through whichever provider collected it and mark the ticket
 * refunded. Internal helper — used by buyer / organizer / admin refund
 * endpoints.
 */
async function refundTicket(ticket, { reason } = {}) {
  if (ticket.refunded) return { ok: true, alreadyRefunded: true };
  if (ticket.transferred) {
    return {
      ok: false,
      message:
        "Payout for this ticket has already been released to the organizer. Contact support to coordinate a refund.",
    };
  }
  // Paystack tickets refund through the Paystack API.
  if (ticket.provider === "paystack") {
    if (!ticket.paystackReference) {
      return { ok: false, message: "No payment record found for this ticket." };
    }
    const refund = await refundPaystackCharge({ reference: ticket.paystackReference });
    ticket.refunded = true;
    ticket.refundedAt = new Date();
    ticket.paystackRefundId = refund.id;
    ticket.isValid = false;
    await ticket.save();
    return { ok: true, refund };
  }

  // PayPal refunds address the CAPTURE, but tickets record the ORDER id (that's
  // what both settlement paths key off), so the capture is looked up here.
  if (ticket.provider === "paypal") {
    if (!ticket.paypalOrderId) {
      return { ok: false, message: "No payment record found for this ticket." };
    }
    const captureId = await findPaypalCaptureId(ticket.paypalOrderId);
    if (!captureId) {
      return { ok: false, message: "No completed payment found for this ticket." };
    }
    const refund = await refundPaypalCapture({ captureId });
    ticket.refunded = true;
    ticket.refundedAt = new Date();
    ticket.paypalRefundId = refund.id;
    ticket.isValid = false;
    await ticket.save();
    return { ok: true, refund };
  }

  if (!ticket.stripePaymentIntentId) {
    return { ok: false, message: "No payment record found for this ticket." };
  }

  const refund = await stripe.refunds.create({
    payment_intent: ticket.stripePaymentIntentId,
    metadata: {
      ticketId: ticket._id.toString(),
      eventId: ticket.event.toString(),
      reason: reason || "requested_by_customer",
    },
  });

  ticket.refunded = true;
  ticket.refundedAt = new Date();
  ticket.stripeRefundId = refund.id;
  ticket.isValid = false;
  await ticket.save();

  return { ok: true, refund };
}

/**
 * Buyer-initiated self-refund.
 * Allowed if BOTH:
 *   - purchase < `buyerRefundWindowHours` old
 *   - event is > `buyerRefundCutoffHours` away
 */
export const refundOwnTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findById(ticketId).populate("event");
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.user.toString() !== userId) {
      return res.status(403).json({ message: "Not your ticket" });
    }
    if (ticket.refunded || !ticket.isValid) {
      return res.status(400).json({ message: "Ticket is already refunded or invalid" });
    }

    const now = new Date();
    const purchasedAt = ticket.purchaseDate || ticket.createdAt;
    const hoursSincePurchase = (now - new Date(purchasedAt)) / 36e5;
    const hoursUntilEvent = (new Date(ticket.event.date) - now) / 36e5;

    if (hoursSincePurchase > config.trust.buyerRefundWindowHours) {
      return res.status(400).json({
        message: `Self-refund is only available within ${config.trust.buyerRefundWindowHours} hours of purchase. Contact the organizer for help.`,
      });
    }
    if (hoursUntilEvent < config.trust.buyerRefundCutoffHours) {
      return res.status(400).json({
        message: `Self-refund closes ${config.trust.buyerRefundCutoffHours} hours before the event. Contact the organizer for help.`,
      });
    }

    const result = await refundTicket(ticket, { reason: "buyer_self_refund" });
    if (!result.ok) return res.status(400).json({ message: result.message });

    // Notify the organizer
    const buyer = await User.findById(userId).select("username");
    const creator = await User.findById(ticket.event.createdBy).select("fcmToken");
    if (creator?.fcmToken) {
      await sendPushNotification(
        creator.fcmToken,
        "Ticket refunded",
        `${buyer.username} refunded their ticket to "${ticket.event.title}".`,
        { type: "ticket_refunded", eventId: String(ticket.event._id) }
      ).catch(() => {});
    }

    res.status(200).json({ message: "Ticket refunded", ticket });
  } catch (error) {
    console.error("refundOwnTicket error:", error);
    res.status(500).json({ message: "Failed to refund ticket" });
  }
};

/** Tickets that still owe their holder money if the event is called off. */
export const outstandingTicketFilter = (eventId) => ({
  event: eventId,
  isValid: true,
  refunded: { $ne: true },
  transferred: { $ne: true },
});

/**
 * Refund every outstanding ticket on an event.
 *
 * Shared by the immediate cancellation (nothing sold) and the admin-approved
 * one, so the two can never drift. Partial failure is normal — a dead provider
 * charge fails on its own without taking the rest of the batch down — so the
 * caller gets both counts and the tickets that actually refunded, which is
 * what decides who gets a refund email.
 */
export async function refundAllEventTickets(event) {
  const tickets = await Ticket.find(outstandingTicketFilter(event._id));

  const refundedTickets = [];
  const failures = [];
  for (const t of tickets) {
    try {
      const r = await refundTicket(t, { reason: "event_cancelled" });
      if (r.ok) refundedTickets.push(t);
      else failures.push({ ticketId: String(t._id), message: r.message });
    } catch (err) {
      console.error(`Refund failed for ticket ${t._id}:`, err);
      failures.push({ ticketId: String(t._id), message: err?.message ?? "Refund error" });
    }
  }

  return {
    refunded: refundedTickets.length,
    failed: failures.length,
    refundedTickets,
    failures,
  };
}

/**
 * POST /events/:eventId/cancel
 *
 * Organizer asks to call their event off.
 *
 * With tickets outstanding this does NOT refund — it files a request for an
 * admin to approve (`cancellationRequest`), because refunding real buyers is a
 * decision someone signs off on. Ticket sales close immediately so nobody buys
 * into an event that is about to be refunded. With nothing sold there is no
 * money to move and no reason to make the organizer wait, so it cancels there
 * and then.
 *
 * Must still be called before the payout job releases funds (the 24h hold).
 */
export const cancelEventByOrganizer = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reason = "" } = req.body ?? {};
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the organizer can cancel this event" });
    }
    if (event.cancelledAt) {
      return res.status(400).json({ message: "Event is already cancelled" });
    }
    if (event.cancellationRequest?.status === "pending") {
      return res.status(400).json({
        message: "You've already asked to cancel this event — it's with our team for review.",
      });
    }
    if (event.payoutStatus === "released") {
      return res.status(400).json({
        message:
          "Payout for this event has already been released. Contact support to coordinate refunds.",
      });
    }

    const outstanding = await Ticket.countDocuments(outstandingTicketFilter(event._id));

    // Nothing sold — no money to refund, so don't make anyone wait on a review.
    if (outstanding === 0) {
      event.cancelledAt = new Date();
      event.cancelledBy = userId;
      event.cancellationReason = reason;
      event.isActive = false;
      event.payoutStatus = "released"; // nothing left to release
      await event.save();
      invalidateCachePattern(`event_detail_${event._id}_`);
      invalidateCachePattern("public_events_");
      invalidateCachePattern("event_highlights_");

      return res.status(200).json({
        status: "cancelled",
        message: "Event cancelled.",
        refunded: 0,
        failed: 0,
      });
    }

    // Tickets are out there: file the request and stop selling. Only record
    // that WE closed sales if they were open, so a rejection restores exactly
    // what the organizer had.
    const closedSalesOnRequest = !event.ticketSalesClosedAt;
    if (closedSalesOnRequest) event.ticketSalesClosedAt = new Date();
    event.cancellationRequest = {
      status: "pending",
      reason,
      requestedAt: new Date(),
      requestedBy: userId,
      ticketsAtRequest: outstanding,
      closedSalesOnRequest,
      reviewedAt: undefined,
      reviewedBy: undefined,
      rejectReason: undefined,
    };
    await event.save();
    invalidateCachePattern(`event_detail_${event._id}_`);

    notifyUser(userId, {
      type: "event_cancellation_requested",
      title: "Cancellation request received",
      body: `We're reviewing your request to cancel "${event.title}". Ticket sales are paused in the meantime.`,
      data: { eventId: String(event._id) },
    });

    return res.status(202).json({
      status: "pending_review",
      message:
        "Your cancellation request is with our team. Ticket sales are paused, and we'll refund everyone who bought a ticket once it's approved.",
      ticketsAtRequest: outstanding,
    });
  } catch (error) {
    console.error("cancelEventByOrganizer error:", error);
    res.status(500).json({ message: "Failed to cancel event" });
  }
};

/**
 * Admin override — refund a single ticket regardless of windows.
 */
export const adminRefundTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reason = "admin_override" } = req.body ?? {};

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.refunded) {
      return res.status(400).json({ message: "Ticket is already refunded" });
    }

    const result = await refundTicket(ticket, { reason });
    if (!result.ok) return res.status(400).json({ message: result.message });

    res.status(200).json({ message: "Ticket refunded", ticket });
  } catch (error) {
    console.error("adminRefundTicket error:", error);
    res.status(500).json({ message: "Failed to refund ticket" });
  }
};

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Stripe webhook handler
 * Verifies the event and handles post-payment fulfillment
 */
export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;

    try {
      // Fallback for when the app's confirm call never lands (backgrounded,
      // network dropped after payment). Shares settleStripePurchase with the
      // confirm endpoint, so it handles all four purchase types AND queues the
      // seller's payout — this used to cover only tickets and guides and never
      // called createPayout, which left sales fulfilled with the seller's money
      // stranded and nothing in the admin queue. Everything downstream is
      // idempotent, so racing the confirm is harmless.
      await settleStripePurchase(paymentIntent);
    } catch (fulfillErr) {
      console.error("Fulfillment error after payment:", fulfillErr);
    }
  }

  res.status(200).json({ received: true });
};
