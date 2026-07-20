/**
 * Unified payments dispatcher.
 *
 * One pair of endpoints the mobile app uses for every purchase, routing to the
 * right provider by the seller's country:
 *   POST /payments/init/:type/:id     -> { provider, ...params }
 *   POST /payments/confirm/:type/:id  -> grants access + queues the payout
 *
 * The flow both providers implement: charge the buyer into the PLATFORM
 * balance, then create a Payout(awaiting_approval) — an admin approves before
 * any money moves out (Wise for Stripe-collected sales, Paystack for NGN).
 */

import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import Ticket from "../models/ticket.model.js";
import { Booking } from "../models/booking.model.js";
import { Order } from "../models/order.model.js";
import {
  getPayoutProvider,
  hasPayoutOnboarding,
} from "../services/payments/resolveProvider.js";
import { fulfillTicket, fulfillGuide, fulfillBooking, fulfillOrder } from "../services/payments/fulfillment.js";
import { computeSplit } from "../services/payments/split.js";
import { buildPaystackInit, verifyPaystackCharge } from "./paystack.controller.js";
import { createPayout } from "../services/payments/payout.service.js";

const PLATFORM_FEE_PERCENT = config.stripe.platformFeePercent;
const TYPES = new Set(["ticket", "guide", "booking", "order"]);

/**
 * Resolve which tier a ticket purchase is for. Tiered events REQUIRE a valid
 * tierId (prices differ per tier); single-price events ignore it.
 * Returns { tier } — tier is null for single-price events — or { error }.
 */
function resolveTicketTier(event, tierId) {
  const tiers = event.ticketTiers || [];
  if (!tiers.length) return { tier: null };
  // A lone tier needs no explicit choice — older call sites don't send one.
  if (!tierId && tiers.length === 1) {
    const only = tiers[0];
    return { tier: { tierId: only._id, name: only.name, price: only.price } };
  }
  const tier = tierId ? tiers.id(tierId) : null;
  if (!tier) {
    // `tier_required` tells the client to open the tier picker (event detail).
    return { error: "Pick a ticket tier for this event.", code: "tier_required" };
  }
  return { tier: { tierId: tier._id, name: tier.name, price: tier.price } };
}

/**
 * Load the item + seller for a purchase and run the type-specific validation.
 * Returns the normalized charge ({ seller, amount, currency, item }) or sends an
 * error response and returns null.
 */
async function resolvePurchase(type, id, userId, res, tierId) {
  if (type === "ticket") {
    const event = await Event.findById(id).populate("createdBy");
    if (!event) return res.status(404).json({ message: "Event not found" }) && null;
    if (!event.isPublic || !event.isPaid) {
      return res.status(400).json({ message: "This event does not require payment" }) && null;
    }
    if (event.approvalStatus !== "approved") {
      return res.status(403).json({ message: "Ticket sales are not available for this event." }) && null;
    }
    const existing = await Ticket.findOne({ event: id, user: userId, isValid: true });
    if (existing) return res.status(400).json({ message: "You already have a ticket for this event" }) && null;
    const sold = await Ticket.countDocuments({ event: id, isValid: true });
    if (sold >= event.maxGuests) return res.status(400).json({ message: "No tickets available" }) && null;

    const { tier, error, code } = resolveTicketTier(event, tierId);
    if (error) return res.status(400).json({ message: error, code }) && null;

    return {
      seller: event.createdBy,
      amount: tier ? tier.price : event.ticketPrice,
      currency: event.currency || "USD",
      item: event,
      tier,
    };
  }

  if (type === "guide") {
    const guide = await Guide.findById(id).populate("author");
    if (!guide) return res.status(404).json({ message: "Guide not found" }) && null;
    if (guide.isDraft) return res.status(400).json({ message: "Cannot purchase a draft guide" }) && null;
    if (guide.price === 0) return res.status(400).json({ message: "This guide is free" }) && null;
    if (guide.author._id.toString() === userId) {
      return res.status(400).json({ message: "You cannot purchase your own guide" }) && null;
    }
    if (guide.purchasedBy.some((u) => u.toString() === userId)) {
      return res.status(400).json({ message: "You have already purchased this guide" }) && null;
    }
    return { seller: guide.author, amount: guide.price, currency: guide.currency || "USD", item: guide };
  }

  if (type === "booking") {
    const booking = await Booking.findById(id).populate("vendor");
    if (!booking) return res.status(404).json({ message: "Booking not found" }) && null;
    if (booking.client.toString() !== userId) {
      return res.status(403).json({ message: "This booking isn't yours" }) && null;
    }
    if (booking.status !== "confirmed") {
      return res.status(400).json({ message: "This booking isn't ready for payment yet" }) && null;
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "This booking is already paid" }) && null;
    }
    return {
      seller: booking.vendor,
      amount: booking.priceSnapshot?.amount || 0,
      currency: booking.priceSnapshot?.currency || "USD",
      item: booking,
    };
  }

  if (type === "order") {
    const order = await Order.findById(id).populate("vendor");
    if (!order) return res.status(404).json({ message: "Order not found" }) && null;
    if (order.client.toString() !== userId) {
      return res.status(403).json({ message: "This order isn't yours" }) && null;
    }
    if (order.status !== "quoted") {
      return res.status(400).json({ message: "This order isn't ready for payment yet" }) && null;
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order is already paid" }) && null;
    }
    return {
      seller: order.vendor,
      amount: order.total || 0,
      currency: order.currency || "USD",
      item: order,
    };
  }

  return res.status(400).json({ message: "Unknown purchase type" }) && null;
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * POST /payments/init/:type/:id
 */
export const initPayment = async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    if (!TYPES.has(type)) return res.status(400).json({ message: "Unknown purchase type" });

    // Tiered ticket purchases carry the chosen tier; the price is always
    // re-derived server-side from the event, never taken from the client.
    const tierId = req.body?.tierId;

    const purchase = await resolvePurchase(type, id, userId, res, tierId);
    if (!purchase) return; // resolvePurchase already responded
    const { seller, amount, currency, tier } = purchase;

    if (!seller) return res.status(400).json({ message: "Seller not found" });

    const provider = getPayoutProvider(seller);

    if (provider === "paystack") {
      // The seller's payout bank must be on file so the approved payout can
      // actually be sent later.
      if (!hasPayoutOnboarding(seller)) {
        return res.status(409).json({ message: "This seller isn't set up to receive payments yet." });
      }
      const buyer = await User.findById(userId).select("email username");
      const init = await buildPaystackInit({ type, id, amount, currency, buyer });
      return res.status(200).json(init);
    }

    // Stripe branch — always charge to the PLATFORM account (no transfer_data /
    // application_fee). Every sale's funds are held in the platform balance and
    // only leave once an admin approves the resulting Payout, which Wise then
    // sends to the seller's bank.
    const settlement = "wise";
    const amountCents = Math.round(amount * 100);
    const feeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
    const sellerNetCents = amountCents - feeCents;

    // Tickets still require the seller to have a working payout account so the
    // approved payout can actually be sent later.
    if (type === "ticket" && !hasPayoutOnboarding(seller)) {
      return res.status(409).json({ message: "Tickets aren't on sale yet — check back soon." });
    }

    const params = {
      amount: amountCents,
      currency: "usd",
      metadata: {
        type,
        buyerId: userId.toString(),
        sellerId: seller._id.toString(),
        platformFeeCents: feeCents.toString(),
        sellerNetCents: sellerNetCents.toString(),
        payoutProvider: settlement,
      },
    };
    if (type === "ticket") {
      params.metadata.eventId = id.toString();
      if (tier) params.metadata.tierId = tier.tierId.toString();
      params.transfer_group = `event_${id}`;
    } else if (type === "guide") {
      params.metadata.guideId = id.toString();
    } else if (type === "booking") {
      params.metadata.bookingId = id.toString();
    } else if (type === "order") {
      params.metadata.orderId = id.toString();
    }

    const paymentIntent = await stripe.paymentIntents.create(params);
    res.status(200).json({ provider: "stripe", clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("initPayment error:", error);
    res.status(500).json({ message: "Failed to start payment" });
  }
};

// ─── Confirm ─────────────────────────────────────────────────────────────────

/**
 * POST /payments/confirm/:type/:id   body: { provider, reference }
 */
export const confirmPayment = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { provider, reference } = req.body;
    const userId = req.user.id;

    if (!TYPES.has(type)) return res.status(400).json({ message: "Unknown purchase type" });
    if (!reference) return res.status(400).json({ message: "reference is required" });

    if (provider === "paystack") {
      return confirmPaystack(type, id, reference, userId, res, req.body?.tierId);
    }
    if (provider && provider !== "stripe") {
      // e.g. a stale client sending the retired "flutterwave" — never let it
      // fall through to the Stripe path.
      return res.status(400).json({ message: "Unsupported payment provider" });
    }
    return confirmStripe(type, id, reference, userId, res);
  } catch (error) {
    console.error("confirmPayment error:", error);
    res.status(500).json({ message: "Failed to confirm payment" });
  }
};

async function confirmStripe(type, id, paymentIntentId, userId, res) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") {
    return res.status(400).json({ message: "Payment has not been completed" });
  }
  if (pi.metadata?.buyerId !== userId) {
    return res.status(403).json({ message: "Payment does not match this purchase" });
  }

  // Stripe-collected sales settle via Wise. The coercion (rather than trusting
  // metadata verbatim) also covers in-flight PIs created before the remap,
  // whose metadata still says "stripe". The seller's net stays in the platform
  // balance; a Payout(awaiting_approval) is created for an admin to release.
  const settlement = "wise";
  const sellerNetCents = Number(pi.metadata?.sellerNetCents || 0);
  // Collection is cents; Wise sources major USD.
  const payoutAmount = sellerNetCents / 100;
  const payoutCurrency = "USD";

  if (type === "ticket") {
    if (pi.metadata?.eventId !== id) {
      return res.status(403).json({ message: "Payment does not match this event" });
    }
    const { ticket, alreadyExisted } = await fulfillTicket({
      eventId: id,
      userId,
      provider: "stripe",
      payoutProvider: settlement, // ticket payouts are batched by the job after the hold window
      paymentRef: paymentIntentId,
      currency: "usd",
      platformFeeCents: Number(pi.metadata?.platformFeeCents || 0),
      sellerNetCents,
      // Tier chosen at init — the PI was created for that tier's price.
      tierId: pi.metadata?.tierId,
    });
    return res.status(alreadyExisted ? 200 : 201).json({ message: "Ticket confirmed", ticket });
  }

  if (type === "guide") {
    if (pi.metadata?.guideId !== id) {
      return res.status(403).json({ message: "Payment does not match this guide" });
    }
    await fulfillGuide({ guideId: id, userId });
    // Unconditional on purpose: if the webhook fulfilled first, this confirm
    // would see alreadyPurchased and a gated createPayout would silently never
    // queue the vendor's money. createPayout is idempotent on `reference`.
    await createPayout({
      vendor: pi.metadata?.sellerId,
      relatedType: "guide",
      relatedId: id,
      provider: settlement,
      amount: payoutAmount,
      currency: payoutCurrency,
      reference: `guide_${id}_${userId}`,
      buyer: userId,
      stripePaymentIntentId: paymentIntentId,
    });
    return res.status(200).json({ message: "Guide purchase confirmed", hasPurchased: true });
  }

  if (type === "booking") {
    if (pi.metadata?.bookingId !== id) {
      return res.status(403).json({ message: "Payment does not match this booking" });
    }
    const { booking } = await fulfillBooking({
      bookingId: id,
      provider: "stripe",
      payoutProvider: settlement,
      paymentRef: paymentIntentId,
      platformFee: Number(pi.metadata?.platformFeeCents || 0),
      vendorNet: sellerNetCents,
    });
    // Unconditional for the same webhook-race reason as guides.
    await createPayout({
      vendor: pi.metadata?.sellerId,
      relatedType: "booking",
      relatedId: id,
      provider: settlement,
      amount: payoutAmount,
      currency: payoutCurrency,
      reference: `booking_${id}`,
      buyer: userId,
      stripePaymentIntentId: paymentIntentId,
    });
    return res.status(200).json({ message: "Booking paid", booking });
  }

  if (type === "order") {
    if (pi.metadata?.orderId !== id) {
      return res.status(403).json({ message: "Payment does not match this order" });
    }
    const { order } = await fulfillOrder({
      orderId: id,
      provider: "stripe",
      payoutProvider: settlement,
      paymentRef: paymentIntentId,
      platformFee: Number(pi.metadata?.platformFeeCents || 0),
      vendorNet: sellerNetCents,
    });
    // Unconditional for the same webhook-race reason as guides.
    await createPayout({
      vendor: pi.metadata?.sellerId,
      relatedType: "order",
      relatedId: id,
      provider: settlement,
      amount: payoutAmount,
      currency: payoutCurrency,
      reference: `order_${id}`,
      buyer: userId,
      stripePaymentIntentId: paymentIntentId,
    });
    return res.status(200).json({ message: "Order paid", order });
  }
}

async function confirmPaystack(type, id, reference, userId, res, tierId) {
  // Re-derive the expected charge from the item (never trust the client — the
  // tierId only picks WHICH server-known price to verify the charge against).
  const purchase = await resolvePurchaseForConfirm(type, id, userId, res, tierId);
  if (!purchase) return;
  const { seller, amount, currency } = purchase;

  await verifyPaystackCharge({
    reference,
    expectedAmount: amount,
    expectedCurrency: currency,
    expectedBuyerId: userId,
  });

  const { platformFee, sellerNet } = computeSplit(amount);

  if (type === "ticket") {
    const { ticket, alreadyExisted } = await fulfillTicket({
      eventId: id,
      userId,
      provider: "paystack",
      paymentRef: reference,
      currency,
      platformFeeCents: platformFee, // major units for paystack
      sellerNetCents: sellerNet,
      // Safe to honor: the charge was just verified against this tier's price.
      tierId,
    });
    // Tickets are delay-released by the payout job, so no payout here.
    return res.status(alreadyExisted ? 200 : 201).json({ message: "Ticket confirmed", ticket });
  }

  if (type === "guide") {
    await fulfillGuide({ guideId: id, userId });
    // Unconditional — idempotent on `reference`; see the Stripe path.
    await createPayout({
      vendor: seller._id,
      relatedType: "guide",
      relatedId: id,
      provider: "paystack",
      amount: sellerNet, // major units
      currency,
      reference: `guide_${id}_${userId}`,
      buyer: userId,
    });
    return res.status(200).json({ message: "Guide purchase confirmed", hasPurchased: true });
  }

  if (type === "booking") {
    const { booking } = await fulfillBooking({
      bookingId: id,
      provider: "paystack",
      paymentRef: reference,
      platformFee,
      vendorNet: sellerNet,
    });
    await createPayout({
      vendor: seller._id,
      relatedType: "booking",
      relatedId: id,
      provider: "paystack",
      amount: sellerNet, // major units
      currency,
      reference: `booking_${id}`,
      buyer: userId,
    });
    return res.status(200).json({ message: "Booking paid", booking });
  }

  if (type === "order") {
    const { order } = await fulfillOrder({
      orderId: id,
      provider: "paystack",
      paymentRef: reference,
      platformFee,
      vendorNet: sellerNet,
    });
    await createPayout({
      vendor: seller._id,
      relatedType: "order",
      relatedId: id,
      provider: "paystack",
      amount: sellerNet, // major units
      currency,
      reference: `order_${id}`,
      buyer: userId,
    });
    return res.status(200).json({ message: "Order paid", order });
  }
}

/**
 * Lighter re-validation used on confirm — the buyer already has a verified
 * payment, so we only need the seller + expected amount/currency (skip the
 * "already purchased / sold out" checks that would now be tripped by our own
 * fulfillment running first).
 */
async function resolvePurchaseForConfirm(type, id, userId, res, tierId) {
  if (type === "ticket") {
    const event = await Event.findById(id).populate("createdBy");
    if (!event) return res.status(404).json({ message: "Event not found" }) && null;
    const { tier, error, code } = resolveTicketTier(event, tierId);
    if (error) return res.status(400).json({ message: error, code }) && null;
    return {
      seller: event.createdBy,
      amount: tier ? tier.price : event.ticketPrice,
      currency: event.currency || "USD",
    };
  }
  if (type === "guide") {
    const guide = await Guide.findById(id).populate("author");
    if (!guide) return res.status(404).json({ message: "Guide not found" }) && null;
    return { seller: guide.author, amount: guide.price, currency: guide.currency || "USD" };
  }
  if (type === "booking") {
    const booking = await Booking.findById(id).populate("vendor");
    if (!booking) return res.status(404).json({ message: "Booking not found" }) && null;
    if (booking.client.toString() !== userId) {
      return res.status(403).json({ message: "This booking isn't yours" }) && null;
    }
    return {
      seller: booking.vendor,
      amount: booking.priceSnapshot?.amount || 0,
      currency: booking.priceSnapshot?.currency || "USD",
    };
  }
  if (type === "order") {
    const order = await Order.findById(id).populate("vendor");
    if (!order) return res.status(404).json({ message: "Order not found" }) && null;
    if (order.client.toString() !== userId) {
      return res.status(403).json({ message: "This order isn't yours" }) && null;
    }
    return {
      seller: order.vendor,
      amount: order.total || 0,
      currency: order.currency || "USD",
    };
  }
  return res.status(400).json({ message: "Unknown purchase type" }) && null;
}

/**
 * GET /payments/config — the Stripe publishable key, fetched at runtime so it
 * never drifts from the server's secret key. Paystack's hosted checkout needs
 * no client key.
 */
export const getPaymentsConfig = async (req, res) => {
  res.status(200).json({
    stripePublishableKey: config.stripe.publishableKey || "",
  });
};

export default { initPayment, confirmPayment, getPaymentsConfig };
