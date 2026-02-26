import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import Ticket from "../models/ticket.model.js";

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

    const seller = event.createdBy;
    const paymentIntentParams = {
      amount: amountCents,
      currency: "usd",
      metadata: {
        type: "ticket",
        eventId: eventId.toString(),
        buyerId: userId.toString(),
        sellerId: seller._id.toString(),
      },
    };

    // If seller has completed Stripe Connect onboarding, route funds to them
    if (seller.stripeAccountId && seller.stripeOnboardingComplete) {
      paymentIntentParams.application_fee_amount = feeCents;
      paymentIntentParams.transfer_data = { destination: seller.stripeAccountId };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

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

    if (seller.stripeAccountId && seller.stripeOnboardingComplete) {
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

    const ticket = await Ticket.create({
      event: eventId,
      user: userId,
      ticketPrice: event.ticketPrice,
      stripePaymentIntentId: paymentIntentId,
    });

    const populated = await Ticket.findById(ticket._id)
      .populate("event", "title date location image")
      .populate("user", "username email profilePicture");

    res.status(201).json({ message: "Ticket confirmed", ticket: populated });
  } catch (error) {
    console.error("Confirm ticket purchase error:", error);
    res.status(500).json({ message: "Failed to confirm ticket" });
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
            });
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
