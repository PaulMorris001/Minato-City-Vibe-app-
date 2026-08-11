/**
 * Settlement for a succeeded Stripe PaymentIntent — the single code path shared
 * by the app's confirm call and the webhook fallback.
 *
 * Why this exists: the two used to be separate implementations, and they drifted.
 * The webhook only handled tickets and guides, and it never called createPayout —
 * so a sale whose confirm request never landed (app backgrounded, network dropped
 * after payment) was fulfilled with no Payout record at all. The buyer got their
 * item, the money sat in the platform balance, and nothing appeared in the admin
 * queue for anyone to release. Bookings and orders were not handled at all.
 *
 * Both callers now route through here, so the webhook is a true fallback: whatever
 * the confirm would have done, the webhook does identically.
 *
 * Idempotency is inherited, not added — every `fulfill*` early-returns on a repeat
 * and `createPayout` is unique on `reference`. A confirm and a webhook racing on
 * the same PaymentIntent is safe and expected.
 */

import User from "../../models/user.model.js";
import {
  fulfillTicket,
  fulfillGuide,
  fulfillBooking,
  fulfillOrder,
} from "./fulfillment.js";
import { createPayout } from "./payout.service.js";
import { getSettlementProvider, PAYOUT_ROUTING_FIELDS } from "./resolveProvider.js";
import { applyRedemptionByReference } from "./discount.service.js";

/**
 * Fulfill a succeeded PaymentIntent and queue the seller's payout.
 *
 * @param {object} paymentIntent  a Stripe PaymentIntent with status "succeeded"
 * @returns {Promise<{type: string, result: object, payout: object|null}>}
 * @throws when metadata is unusable or the underlying fulfillment fails
 */
export async function settleStripePurchase(paymentIntent) {
  const meta = paymentIntent.metadata || {};
  const { type, buyerId, sellerId } = meta;

  if (!type || !buyerId) {
    throw new Error(
      `settleStripePurchase: PaymentIntent ${paymentIntent.id} has no type/buyerId metadata`
    );
  }

  // The settlement rail is re-derived from the seller rather than read from PI
  // metadata, so a PaymentIntent created before a routing change settles on
  // today's rail rather than a stale one.
  const seller = sellerId
    ? await User.findById(sellerId).select(PAYOUT_ROUTING_FIELDS)
    : null;
  const settlement = seller ? getSettlementProvider(seller) : null;

  const platformFeeCents = Number(meta.platformFeeCents || 0);
  const sellerNetCents = Number(meta.sellerNetCents || 0);
  // Stripe collects in cents; payouts are stored in major units.
  const payoutAmount = sellerNetCents / 100;
  const payoutCurrency = "USD";

  /**
   * Queue the seller's payout, unless they have no rail to be paid on.
   *
   * A null rail means the seller's country is outside both Paystack and Stripe
   * Connect. That should be unreachable — paid listings are gated on
   * `payoutSupported` at creation time — so if it happens, a seller moved
   * countries mid-sale and their money needs manual handling. Loud log, and the
   * sale still completes: the buyer paid and must get what they bought.
   */
  const queuePayout = async ({ relatedType, relatedId, reference }) => {
    if (!settlement) {
      console.error(
        `[settleStripePurchase] No payout rail for seller ${sellerId} on ${relatedType} ` +
          `${relatedId} (PI ${paymentIntent.id}). Sale fulfilled; payout NOT queued — ` +
          `needs manual settlement.`
      );
      return null;
    }
    return createPayout({
      vendor: sellerId,
      relatedType,
      relatedId,
      provider: settlement,
      amount: payoutAmount,
      currency: payoutCurrency,
      reference,
      buyer: buyerId,
      stripePaymentIntentId: paymentIntent.id,
    });
  };

  if (type === "ticket") {
    if (!meta.eventId) throw new Error("settleStripePurchase: ticket PI has no eventId");
    const result = await fulfillTicket({
      eventId: meta.eventId,
      userId: buyerId,
      provider: "stripe",
      payoutProvider: settlement,
      paymentRef: paymentIntent.id,
      currency: "usd",
      platformFeeCents,
      sellerNetCents,
      // Tier chosen at init — the PI was created for that tier's price.
      tierId: meta.tierId,
      // What was actually charged (discounted when a code applied at init).
      amountPaid: paymentIntent.amount / 100,
      ...(meta.discountCode
        ? {
            discountCode: meta.discountCode,
            discountAmount: Number(meta.discountAmountCents || 0) / 100,
          }
        : {}),
    });
    // Settle the discount reservation. Both the app's confirm call and the
    // webhook fallback funnel through here, and apply is idempotent on the
    // pending status — so this runs effectively once per flow.
    if (meta.discountCode) await applyRedemptionByReference(paymentIntent.id);
    // No payout here: ticket money is held until after the event and released in
    // bulk by payoutRelease.job.js, so the organizer can't be paid for an event
    // that hasn't happened.
    return { type, result, payout: null };
  }

  if (type === "guide") {
    if (!meta.guideId) throw new Error("settleStripePurchase: guide PI has no guideId");
    const result = await fulfillGuide({ guideId: meta.guideId, userId: buyerId });
    const payout = await queuePayout({
      relatedType: "guide",
      relatedId: meta.guideId,
      reference: `guide_${meta.guideId}_${buyerId}`,
    });
    return { type, result, payout };
  }

  if (type === "booking") {
    if (!meta.bookingId) throw new Error("settleStripePurchase: booking PI has no bookingId");
    const result = await fulfillBooking({
      bookingId: meta.bookingId,
      provider: "stripe",
      payoutProvider: settlement,
      paymentRef: paymentIntent.id,
      platformFee: platformFeeCents,
      vendorNet: sellerNetCents,
    });
    const payout = await queuePayout({
      relatedType: "booking",
      relatedId: meta.bookingId,
      reference: `booking_${meta.bookingId}`,
    });
    return { type, result, payout };
  }

  if (type === "order") {
    if (!meta.orderId) throw new Error("settleStripePurchase: order PI has no orderId");
    const result = await fulfillOrder({
      orderId: meta.orderId,
      provider: "stripe",
      payoutProvider: settlement,
      paymentRef: paymentIntent.id,
      platformFee: platformFeeCents,
      vendorNet: sellerNetCents,
    });
    const payout = await queuePayout({
      relatedType: "order",
      relatedId: meta.orderId,
      reference: `order_${meta.orderId}`,
    });
    return { type, result, payout };
  }

  throw new Error(`settleStripePurchase: unknown purchase type "${type}"`);
}

export default { settleStripePurchase };
