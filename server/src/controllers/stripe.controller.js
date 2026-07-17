/**
 * Stripe controller — collection-side only.
 *
 * Stripe's job in this architecture is to CHARGE buyers into the platform
 * balance (via the unified /payments dispatcher) and to REFUND those charges.
 * It never moves money to sellers: settlement runs through the admin-approved
 * Payout queue (Wise for Stripe-collected sales, Paystack for NGN).
 */

import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import { sendPushNotification } from "../services/notification.service.js";
import { fulfillTicket, fulfillGuide } from "../services/payments/fulfillment.js";
import { refundPaystackCharge } from "./paystack.controller.js";

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
  // Paystack tickets refund through the Paystack API instead of Stripe.
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

/**
 * Organizer cancels their own event — refunds all valid, non-transferred
 * tickets and marks the event cancelled. Must be called before the payout
 * job releases funds (i.e., within the 48h hold window).
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
    if (event.payoutStatus === "released") {
      return res.status(400).json({
        message:
          "Payout for this event has already been released. Contact support to coordinate refunds.",
      });
    }

    const tickets = await Ticket.find({
      event: eventId,
      isValid: true,
      refunded: { $ne: true },
      transferred: { $ne: true },
    });

    const results = { refunded: 0, failed: 0 };
    for (const t of tickets) {
      try {
        const r = await refundTicket(t, { reason: "event_cancelled" });
        if (r.ok) results.refunded += 1;
        else results.failed += 1;
      } catch (err) {
        console.error(`Refund failed for ticket ${t._id}:`, err);
        results.failed += 1;
      }
    }

    event.cancelledAt = new Date();
    event.cancelledBy = userId;
    event.cancellationReason = reason;
    event.isActive = false;
    event.payoutStatus = "released"; // nothing left to release
    await event.save();

    res.status(200).json({
      message: `Event cancelled. ${results.refunded} ticket(s) refunded.`,
      ...results,
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
    const { type, eventId, guideId, buyerId } = paymentIntent.metadata;

    try {
      // Webhook acts as a fallback if the app's confirm call never lands. The
      // shared helpers are idempotent, so a double-fire is harmless.
      if (type === "ticket" && eventId && buyerId) {
        await fulfillTicket({
          eventId,
          userId: buyerId,
          provider: "stripe",
          // Stripe-collected sales settle via Wise regardless of what older
          // PIs' metadata says.
          payoutProvider: "wise",
          paymentRef: paymentIntent.id,
          currency: "usd",
          platformFeeCents: Number(paymentIntent.metadata?.platformFeeCents || 0),
          sellerNetCents: Number(paymentIntent.metadata?.sellerNetCents || 0),
          tierId: paymentIntent.metadata?.tierId,
        });
      }

      if (type === "guide" && guideId && buyerId) {
        await fulfillGuide({ guideId, userId: buyerId });
      }
    } catch (fulfillErr) {
      console.error("Fulfillment error after payment:", fulfillErr);
    }
  }

  res.status(200).json({ received: true });
};
