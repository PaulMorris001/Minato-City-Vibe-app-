/**
 * Unified payments dispatcher.
 *
 * One pair of endpoints the mobile app uses for every purchase, routing to the
 * right provider by the seller's country:
 *   POST /payments/init/:type/:id     -> { provider, ...params }
 *   POST /payments/confirm/:type/:id  -> grants access (+ payout where immediate)
 *
 * The legacy /stripe/* endpoints stay for backward compatibility; new app
 * builds use these.
 */

import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import Ticket from "../models/ticket.model.js";
import { Booking } from "../models/booking.model.js";
import { getPayoutProvider } from "../services/payments/resolveProvider.js";
import { fulfillTicket, fulfillGuide, fulfillBooking } from "../services/payments/fulfillment.js";
import {
  computeSplit,
  buildFlutterwaveInit,
  verifyFlutterwaveCharge,
  createFlutterwaveTransfer,
} from "./flutterwave.controller.js";

const PLATFORM_FEE_PERCENT = config.stripe.platformFeePercent;
const TYPES = new Set(["ticket", "guide", "booking"]);

/**
 * Load the item + seller for a purchase and run the type-specific validation.
 * Returns the normalized charge ({ seller, amount, currency, item }) or sends an
 * error response and returns null.
 */
async function resolvePurchase(type, id, userId, res) {
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

    return { seller: event.createdBy, amount: event.ticketPrice, currency: event.currency || "USD", item: event };
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

    const purchase = await resolvePurchase(type, id, userId, res);
    if (!purchase) return; // resolvePurchase already responded
    const { seller, amount, currency } = purchase;

    if (!seller) return res.status(400).json({ message: "Seller not found" });

    const provider = getPayoutProvider(seller);

    if (provider === "flutterwave") {
      if (!seller.flutterwaveOnboardingComplete) {
        return res.status(409).json({ message: "This seller isn't set up to receive payments yet." });
      }
      const buyer = await User.findById(userId).select("email username");
      const init = await buildFlutterwaveInit({ type, id, amount, currency, buyer });
      return res.status(200).json(init);
    }

    // Stripe branch — charge to the platform account, in cents.
    const amountCents = Math.round(amount * 100);
    const feeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
    const sellerNetCents = amountCents - feeCents;
    const sellerOnboarded = seller.stripeAccountId && seller.stripeOnboardingComplete;

    if (type === "ticket" && !sellerOnboarded) {
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
      },
    };
    if (type === "ticket") {
      // Delayed payout: no transfer_data; the payout job transfers later.
      params.metadata.eventId = id.toString();
      params.transfer_group = `event_${id}`;
    } else if (type === "guide") {
      params.metadata.guideId = id.toString();
      if (sellerOnboarded) {
        params.application_fee_amount = feeCents;
        params.transfer_data = { destination: seller.stripeAccountId };
      }
    } else if (type === "booking") {
      params.metadata.bookingId = id.toString();
      if (sellerOnboarded) {
        params.application_fee_amount = feeCents;
        params.transfer_data = { destination: seller.stripeAccountId };
      }
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

    if (provider === "flutterwave") {
      return confirmFlutterwave(type, id, reference, userId, res);
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

  if (type === "ticket") {
    if (pi.metadata?.eventId !== id) {
      return res.status(403).json({ message: "Payment does not match this event" });
    }
    const { ticket, alreadyExisted } = await fulfillTicket({
      eventId: id,
      userId,
      provider: "stripe",
      paymentRef: paymentIntentId,
      currency: "usd",
      platformFeeCents: Number(pi.metadata?.platformFeeCents || 0),
      sellerNetCents: Number(pi.metadata?.sellerNetCents || 0),
    });
    return res.status(alreadyExisted ? 200 : 201).json({ message: "Ticket confirmed", ticket });
  }

  if (type === "guide") {
    if (pi.metadata?.guideId !== id) {
      return res.status(403).json({ message: "Payment does not match this guide" });
    }
    await fulfillGuide({ guideId: id, userId });
    return res.status(200).json({ message: "Guide purchase confirmed", hasPurchased: true });
  }

  if (type === "booking") {
    if (pi.metadata?.bookingId !== id) {
      return res.status(403).json({ message: "Payment does not match this booking" });
    }
    // Stripe pays the vendor immediately via transfer_data (when onboarded), so
    // there's no separate transfer to make here.
    const { booking } = await fulfillBooking({
      bookingId: id,
      provider: "stripe",
      paymentRef: paymentIntentId,
      platformFee: Number(pi.metadata?.platformFeeCents || 0),
      vendorNet: Number(pi.metadata?.sellerNetCents || 0),
    });
    return res.status(200).json({ message: "Booking paid", booking });
  }
}

async function confirmFlutterwave(type, id, transactionId, userId, res) {
  // Re-derive the expected charge from the item (never trust the client).
  const purchase = await resolvePurchaseForConfirm(type, id, userId, res);
  if (!purchase) return;
  const { seller, amount, currency } = purchase;

  await verifyFlutterwaveCharge({
    transactionId,
    expectedAmount: amount,
    expectedCurrency: currency,
  });

  const { platformFee, sellerNet } = computeSplit(amount);

  if (type === "ticket") {
    const { ticket, alreadyExisted } = await fulfillTicket({
      eventId: id,
      userId,
      provider: "flutterwave",
      paymentRef: transactionId,
      currency,
      platformFeeCents: platformFee, // major units for flutterwave
      sellerNetCents: sellerNet,
    });
    // Tickets are delay-released by the payout job, so no transfer here.
    return res.status(alreadyExisted ? 200 : 201).json({ message: "Ticket confirmed", ticket });
  }

  if (type === "guide") {
    const { alreadyPurchased } = await fulfillGuide({ guideId: id, userId });
    if (!alreadyPurchased) {
      await payoutImmediately({ seller, amount: sellerNet, currency, ref: `guide_${id}_${userId}` });
    }
    return res.status(200).json({ message: "Guide purchase confirmed", hasPurchased: true });
  }

  if (type === "booking") {
    const { booking, alreadyPaid } = await fulfillBooking({
      bookingId: id,
      provider: "flutterwave",
      paymentRef: transactionId,
      platformFee,
      vendorNet: sellerNet,
    });
    if (!alreadyPaid) {
      const transfer = await payoutImmediately({
        seller,
        amount: sellerNet,
        currency,
        ref: `booking_${id}`,
      });
      if (transfer?.id) {
        booking.transferRef = transfer.id;
        await booking.save();
      }
    }
    return res.status(200).json({ message: "Booking paid", booking });
  }
}

/**
 * Pay a Flutterwave seller their net share immediately (guides + bookings).
 * Failures are logged but don't fail the buyer's confirm — the funds are in the
 * platform balance and can be retried.
 */
async function payoutImmediately({ seller, amount, currency, ref }) {
  try {
    if (!seller?.flutterwaveBank?.accountNumber) return null;
    return await createFlutterwaveTransfer({
      bank: seller.flutterwaveBank,
      amount,
      currency,
      reference: ref,
      narration: "CityVibe payout",
    });
  } catch (error) {
    console.error("Immediate Flutterwave payout failed:", error.message);
    return null;
  }
}

/**
 * Lighter re-validation used on confirm — the buyer already has a verified
 * payment, so we only need the seller + expected amount/currency (skip the
 * "already purchased / sold out" checks that would now be tripped by our own
 * fulfillment running first).
 */
async function resolvePurchaseForConfirm(type, id, userId, res) {
  if (type === "ticket") {
    const event = await Event.findById(id).populate("createdBy");
    if (!event) return res.status(404).json({ message: "Event not found" }) && null;
    return { seller: event.createdBy, amount: event.ticketPrice, currency: event.currency || "USD" };
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
  return res.status(400).json({ message: "Unknown purchase type" }) && null;
}

/**
 * GET /payments/config — public keys for both providers (mobile fetches at
 * runtime so keys never drift from the server's secrets).
 */
export const getPaymentsConfig = async (req, res) => {
  res.status(200).json({
    stripePublishableKey: config.stripe.publishableKey || "",
    flutterwavePublicKey: config.flutterwave.publicKey || "",
  });
};

export default { initPayment, confirmPayment, getPaymentsConfig };
