import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import Ticket from "../models/ticket.model.js";
import { sendPushNotification } from "../services/notification.service.js";
import { invalidateCachePattern } from "../utils/cache.js";

const PLATFORM_FEE_PERCENT = config.stripe.platformFeePercent; // e.g. 10

// ─── Seller Connect Onboarding ───────────────────────────────────────────────

/**
 * Create a Stripe Express account for the current user (seller)
 */
export const createConnectAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // If they already have an account, return it
    if (user.stripeAccountId) {
      return res.status(200).json({ accountId: user.stripeAccountId });
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    user.stripeAccountId = account.id;
    await user.save();

    res.status(201).json({ accountId: account.id });
  } catch (error) {
    console.error("Create connect account error:", error);
    res.status(500).json({ message: "Failed to create Stripe account" });
  }
};

/**
 * Generate a Stripe-hosted onboarding link for the seller
 */
export const getAccountLink = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.stripeAccountId) {
      return res.status(400).json({ message: "No Stripe account found. Create one first." });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${config.stripe.serverUrl}/api/stripe/connect/refresh`,
      return_url: `${config.stripe.serverUrl}/api/stripe/connect/return`,
      type: "account_onboarding",
    });

    res.status(200).json({ url: accountLink.url });
  } catch (error) {
    console.error("Get account link error:", error);
    res.status(500).json({ message: "Failed to generate onboarding link" });
  }
};

/**
 * Get the current Stripe Connect account status for the logged-in user
 */
export const getAccountStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.stripeAccountId) {
      return res.status(200).json({ connected: false, onboardingComplete: false });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    const onboardingComplete = account.details_submitted && account.charges_enabled;

    // Persist the status so we can use it without calling Stripe every time
    if (onboardingComplete && !user.stripeOnboardingComplete) {
      user.stripeOnboardingComplete = true;
      await user.save();
    }

    res.status(200).json({
      connected: true,
      onboardingComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (error) {
    console.error("Get account status error:", error);
    res.status(500).json({ message: "Failed to retrieve account status" });
  }
};

// ─── Connect Redirect Endpoints ──────────────────────────────────────────────
// Stripe requires HTTPS return/refresh URLs. These endpoints redirect back to
// the mobile app via its deep link scheme.

export const stripeConnectReturn = (req, res) => {
  res.redirect(`${config.stripe.appUrl}stripe-onboarding?success=true`);
};

export const stripeConnectRefresh = (req, res) => {
  res.redirect(`${config.stripe.appUrl}stripe-onboarding?refresh=true`);
};

// ─── Payment Intents ──────────────────────────────────────────────────────────

/**
 * Create a PaymentIntent for purchasing an event ticket
 */
export const createTicketPaymentIntent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId).populate("createdBy");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!event.isPublic || !event.isPaid) {
      return res.status(400).json({ message: "This event does not require payment" });
    }

    // Trust gate: organizers can't sell tickets until their event is approved
    if (event.approvalStatus !== "approved") {
      return res.status(403).json({
        message:
          event.approvalStatus === "pending"
            ? "This event is awaiting organizer approval and is not yet on sale."
            : "Ticket sales are not available for this event.",
      });
    }

    const seller = event.createdBy;
    if (!seller) return res.status(400).json({ message: "Event organizer not found" });
    if (!seller.stripeAccountId || !seller.stripeOnboardingComplete) {
      // The createEvent gate should prevent this from ever being reachable,
      // but if an organizer disconnects Stripe after listing, we don't want
      // to expose that to the buyer. Show a generic, on-brand message.
      return res.status(409).json({
        message: "Tickets aren't on sale yet — check back soon.",
        code: "ticketing_not_ready",
      });
    }

    // Check if user already has a ticket
    const existingTicket = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    if (existingTicket) {
      return res.status(400).json({ message: "You already have a ticket for this event" });
    }

    // Check ticket availability
    const soldTickets = await Ticket.countDocuments({ event: eventId, isValid: true });
    if (soldTickets >= event.maxGuests) {
      return res.status(400).json({ message: "No tickets available" });
    }

    const amountCents = Math.round(event.ticketPrice * 100);
    const feeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
    const sellerNetCents = amountCents - feeCents;

    // Delayed-payout model: charge to the platform account (NO transfer_data /
    // application_fee_amount). The payout job creates a Transfer to the seller's
    // Connect account `payoutDelayHours` after the event date.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      metadata: {
        type: "ticket",
        eventId: eventId.toString(),
        buyerId: userId.toString(),
        sellerId: seller._id.toString(),
        platformFeeCents: feeCents.toString(),
        sellerNetCents: sellerNetCents.toString(),
      },
      // transfer_group lets us look up all charges tied to this event when
      // releasing the payout.
      transfer_group: `event_${eventId}`,
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Create ticket payment intent error:", error);
    res.status(500).json({ message: "Failed to create payment intent" });
  }
};

/**
 * Create a PaymentIntent for purchasing a guide
 */
export const createGuidePaymentIntent = async (req, res) => {
  try {
    const { guideId } = req.params;
    const userId = req.user.id;

    const guide = await Guide.findById(guideId).populate("author");
    if (!guide) return res.status(404).json({ message: "Guide not found" });
    if (guide.isDraft) return res.status(400).json({ message: "Cannot purchase a draft guide" });
    if (guide.price === 0) return res.status(400).json({ message: "This guide is free" });

    if (guide.author._id.toString() === userId) {
      return res.status(400).json({ message: "You cannot purchase your own guide" });
    }
    if (guide.purchasedBy.includes(userId)) {
      return res.status(400).json({ message: "You have already purchased this guide" });
    }

    const amountCents = Math.round(guide.price * 100);
    const feeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));

    const seller = guide.author;
    if (!seller) return res.status(400).json({ message: "Guide author not found" });

    const paymentIntentParams = {
      amount: amountCents,
      currency: "usd",
      metadata: {
        type: "guide",
        guideId: guideId.toString(),
        buyerId: userId.toString(),
        sellerId: seller._id.toString(),
      },
    };

    if (seller?.stripeAccountId && seller?.stripeOnboardingComplete) {
      paymentIntentParams.application_fee_amount = feeCents;
      paymentIntentParams.transfer_data = { destination: seller.stripeAccountId };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Create guide payment intent error:", error);
    res.status(500).json({ message: "Failed to create payment intent" });
  }
};

// ─── Purchase Confirmation (called immediately after payment sheet) ───────────

/**
 * Confirm a guide purchase after a successful Stripe payment.
 * Verifies the PaymentIntent is actually succeeded before granting access.
 */
export const confirmGuidePurchase = async (req, res) => {
  try {
    const { guideId } = req.params;
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return res.status(400).json({ message: "paymentIntentId is required" });
    }

    // Verify with Stripe that payment actually succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment has not been completed" });
    }

    // Verify the PaymentIntent belongs to this guide and buyer
    if (
      paymentIntent.metadata?.guideId !== guideId ||
      paymentIntent.metadata?.buyerId !== userId
    ) {
      return res.status(403).json({ message: "PaymentIntent does not match this purchase" });
    }

    const guide = await Guide.findById(guideId);
    if (!guide) return res.status(404).json({ message: "Guide not found" });

    if (!guide.purchasedBy.includes(userId)) {
      guide.purchasedBy.push(userId);
      await guide.save();
    }

    // Notify the guide author
    const buyer = await User.findById(userId).select("username");
    const author = await User.findById(guide.author._id).select("fcmToken");
    await sendPushNotification(
      author?.fcmToken,
      "📖 Guide Purchased!",
      `${buyer.username} just bought your guide "${guide.title}"`,
      { type: "guide_sold", guideId }
    );

    res.status(200).json({ message: "Guide purchase confirmed", hasPurchased: true });
  } catch (error) {
    console.error("Confirm guide purchase error:", error);
    res.status(500).json({ message: "Failed to confirm purchase" });
  }
};

/**
 * Confirm a ticket purchase after a successful Stripe payment.
 * Verifies the PaymentIntent is actually succeeded before creating the ticket.
 */
export const confirmTicketPurchase = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return res.status(400).json({ message: "paymentIntentId is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment has not been completed" });
    }

    if (
      paymentIntent.metadata?.eventId !== eventId ||
      paymentIntent.metadata?.buyerId !== userId
    ) {
      return res.status(403).json({ message: "PaymentIntent does not match this purchase" });
    }

    // Idempotency — don't create duplicate tickets
    const existing = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    if (existing) {
      return res.status(200).json({ message: "Ticket already exists", ticket: existing });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const platformFeeCents = Number(paymentIntent.metadata?.platformFeeCents || 0);
    const sellerNetCents = Number(paymentIntent.metadata?.sellerNetCents || 0);

    const ticket = await Ticket.create({
      event: eventId,
      user: userId,
      ticketPrice: event.ticketPrice,
      stripePaymentIntentId: paymentIntentId,
      platformFeeCents,
      sellerNetCents,
    });

    // Surface the buyer as a confirmed attendee so the event's going-count,
    // capacity % and friends-going stats reflect reality immediately.
    let listsChanged = false;
    if (!event.rsvpUsers.some((id) => id.toString() === userId)) {
      event.rsvpUsers.push(userId);
      listsChanged = true;
    }
    if (!event.invitedUsers.some((id) => id.toString() === userId)) {
      event.invitedUsers.push(userId);
      listsChanged = true;
    }
    if (listsChanged) {
      await event.save();
    }

    // Blow away the event detail cache for every viewer so ticketsRemaining /
    // ticketsSold reflect the just-confirmed purchase on the next read.
    invalidateCachePattern(`event_detail_${eventId}_`);
    invalidateCachePattern("public_events_");
    invalidateCachePattern("event_highlights_");

    const populated = await Ticket.findById(ticket._id)
      .populate("event", "title date location image")
      .populate("user", "username email profilePicture");

    // Notify the event creator
    const buyer = await User.findById(userId).select("username");
    const creator = await User.findById(event.createdBy).select("fcmToken");
    await sendPushNotification(
      creator?.fcmToken,
      "🎟️ New Ticket Sold!",
      `${buyer.username} just bought a ticket to "${event.title}"`,
      { type: "ticket_sold", eventId }
    );

    res.status(201).json({ message: "Ticket confirmed", ticket: populated });
  } catch (error) {
    console.error("Confirm ticket purchase error:", error);
    res.status(500).json({ message: "Failed to confirm ticket" });
  }
};

// ─── Refunds ─────────────────────────────────────────────────────────────────

/**
 * Issue a Stripe refund for a ticket and mark the ticket as refunded.
 * Internal helper — used by buyer / organizer / admin refund endpoints.
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
      if (type === "ticket" && eventId && buyerId) {
        // Check idempotency — don't create duplicate tickets
        const existing = await Ticket.findOne({ event: eventId, user: buyerId, isValid: true });
        if (!existing) {
          const evt = await Event.findById(eventId);
          if (evt) {
            await Ticket.create({
              event: eventId,
              user: buyerId,
              ticketPrice: evt.ticketPrice,
              stripePaymentIntentId: paymentIntent.id,
              platformFeeCents: Number(paymentIntent.metadata?.platformFeeCents || 0),
              sellerNetCents: Number(paymentIntent.metadata?.sellerNetCents || 0),
            });

            let listsChanged = false;
            if (!evt.rsvpUsers.some((id) => id.toString() === buyerId)) {
              evt.rsvpUsers.push(buyerId);
              listsChanged = true;
            }
            if (!evt.invitedUsers.some((id) => id.toString() === buyerId)) {
              evt.invitedUsers.push(buyerId);
              listsChanged = true;
            }
            if (listsChanged) {
              await evt.save();
            }

            invalidateCachePattern(`event_detail_${eventId}_`);
            invalidateCachePattern("public_events_");
            invalidateCachePattern("event_highlights_");
          }
        }
      }

      if (type === "guide" && guideId && buyerId) {
        const guide = await Guide.findById(guideId);
        if (guide && !guide.purchasedBy.includes(buyerId)) {
          guide.purchasedBy.push(buyerId);
          await guide.save();
        }
      }

      if (type === "ticket" || type === "guide") {
        const seller = await User.findById(paymentIntent.metadata.sellerId);
        if (seller && seller.stripeAccountId && seller.stripeOnboardingComplete) {
          // Earnings tracked via Stripe dashboard + Connect account
        }
      }
    } catch (fulfillErr) {
      console.error("Fulfillment error after payment:", fulfillErr);
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object;
    if (account.details_submitted && account.charges_enabled) {
      await User.findOneAndUpdate(
        { stripeAccountId: account.id },
        { stripeOnboardingComplete: true }
      );
    }
  }

  res.status(200).json({ received: true });
};
