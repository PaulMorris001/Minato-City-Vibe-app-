/**
 * Settlement for a completed PayPal capture — the single code path shared by the
 * app's confirm call and the capture webhook.
 *
 * Kept as one implementation for the reason spelled out in the Stripe version
 * this replaced: when the two were separate they drifted, and a sale whose
 * confirm request never landed (app backgrounded, browser closed on the receipt
 * page) was fulfilled with no Payout record — buyer served, seller never paid.
 *
 * PayPal makes that failure mode more likely than Stripe did, not less: the
 * mobile flow ends in a web browser session the user can dismiss at any point
 * after approving, so the webhook is a routine path rather than a rare one.
 *
 * Idempotency is inherited, not added — every `fulfill*` early-returns on a
 * repeat and `createPayout` is unique on `reference`. A confirm and a webhook
 * racing on the same capture is safe and expected.
 *
 * Unit convention: PayPal's API speaks MAJOR units, but per-sale amounts are
 * STORED in cents, exactly as the Stripe rail stored them — see the comment on
 * the conversion below for why that is not optional.
 */

import User from "../../models/user.model.js";
import Event from "../../models/event.model.js";
import Guide from "../../models/guide.model.js";
import TicketOrder from "../../models/ticketOrder.model.js";
import DiscountRedemption from "../../models/discountRedemption.model.js";
// Booking and Order are NAMED exports; most other models are default.
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import {
  fulfillTicket,
  fulfillTicketOrder,
  fulfillGuide,
  fulfillBooking,
  fulfillOrder,
} from "./fulfillment.js";
import { createPayout } from "./payout.service.js";
import { getSettlementProvider, PAYOUT_ROUTING_FIELDS } from "./resolveProvider.js";
import { computeSplit } from "./split.js";
import { applyRedemptionByReference } from "./discount.service.js";

/**
 * Fulfill a completed PayPal capture and queue the seller's payout.
 *
 * @param {object} capture  normalized by capturePaypalOrder / normalizeCaptureResource:
 *   { orderId, captureId, amount, currency, custom: { type, id, buyerId, tierId } }
 * @returns {Promise<{type: string, result: object, payout: object|null}>}
 * @throws when the custom_id context is unusable or the fulfillment fails
 */
export async function settlePaypalPurchase(capture) {
  const { orderId, amount, currency, custom } = capture;
  const { type, id, buyerId, tierId } = custom || {};

  if (!type || !buyerId) {
    throw new Error(`settlePaypalPurchase: order ${orderId} has no type/buyerId in custom_id`);
  }

  // Every record written by both paths keys off the ORDER id, not the capture
  // id, so a confirm and a webhook for the same purchase collide on the unique
  // reference instead of double-issuing.
  const paymentRef = orderId;

  // The seller is re-derived from the item rather than carried on the payment,
  // so a payment created before a routing change settles on today's rail.
  const sellerId = await resolveSellerId(type, id);
  const seller = sellerId ? await User.findById(sellerId).select(PAYOUT_ROUTING_FIELDS) : null;
  const settlement = seller ? getSettlementProvider(seller) : null;

  // Stored per-sale amounts are in CENTS, even though PayPal's API speaks major
  // units — the one place this rail does a subunit conversion.
  //
  // Why: `currency` is what every reader uses to tell stored units apart, and it
  // CANNOT separate a PayPal sale from a legacy Stripe one, because both are
  // USD. If PayPal stored major units, `toMajorNet` and `ticketPayoutAmount`
  // would silently divide them by 100 and pay every international seller 1% of
  // what they are owed. Converting once here keeps those readers correct and
  // untouched. `Payout.amount` stays MAJOR — see payout.model.js.
  const { platformFee, sellerNet } = computeSplit(amount);
  const platformFeeCents = Math.round(platformFee * 100);
  const sellerNetCents = Math.round(sellerNet * 100);

  /**
   * Queue the seller's payout, unless they have no rail to be paid on.
   *
   * A null rail should be unreachable — paid listings are gated on
   * `payoutSupported` at creation time — so if it happens, a seller moved to a
   * country PayPal cannot pay mid-sale and their money needs manual handling.
   * Loud log, and the sale still completes: the buyer paid and must get what
   * they bought.
   */
  const queuePayout = async ({ relatedType, relatedId, reference }) => {
    if (!settlement) {
      console.error(
        `[settlePaypalPurchase] No payout rail for seller ${sellerId} on ${relatedType} ` +
          `${relatedId} (order ${orderId}). Sale fulfilled; payout NOT queued — ` +
          `needs manual settlement.`
      );
      return null;
    }
    return createPayout({
      vendor: sellerId,
      relatedType,
      relatedId,
      provider: settlement,
      amount: sellerNet,
      currency,
      reference,
      buyer: buyerId,
    });
  };

  if (type === "ticket") {
    // A code reserved at init discounted the charge; snapshot it onto the ticket
    // so the buyer's receipt and the organizer's sales report agree.
    const redemption = await DiscountRedemption.findOne({
      reference: paymentRef,
      user: buyerId,
    }).populate("code");

    const result = await fulfillTicket({
      eventId: id,
      userId: buyerId,
      provider: "paypal",
      payoutProvider: settlement,
      paymentRef,
      currency,
      platformFeeCents,
      sellerNetCents,
      // Chosen at init — the order was created for that tier's price and the
      // capture was verified against it.
      tierId,
      amountPaid: amount,
      ...(redemption?.code
        ? {
            discountCode: redemption.code.code,
            discountAmount: redemption.discountAmount,
          }
        : {}),
    });
    // Settle the reservation. Both callers funnel through here and apply is
    // idempotent on the pending status, so this runs effectively once.
    if (redemption?.code) await applyRedemptionByReference(paymentRef);
    // No payout here: ticket money is held until after the event and released in
    // bulk by payoutRelease.job.js, so the organizer can't be paid for an event
    // that hasn't happened.
    return { type, result, payout: null };
  }

  // Web batch checkout (multi / gift tickets). The order carries its own frozen
  // accounting, so there is nothing to re-derive — just fan it out.
  if (type === "ticket_batch") {
    const order = await TicketOrder.findOne({ reference: paymentRef });
    if (!order) {
      throw new Error(`settlePaypalPurchase: no TicketOrder for PayPal order ${orderId}`);
    }
    if (Math.round(amount * 100) < Math.round(order.total * 100)) {
      throw new Error(`settlePaypalPurchase: order ${orderId} underpays TicketOrder ${order._id}`);
    }
    const result = await fulfillTicketOrder({ order });
    return { type, result, payout: null };
  }

  if (type === "guide") {
    const result = await fulfillGuide({ guideId: id, userId: buyerId });
    const payout = await queuePayout({
      relatedType: "guide",
      relatedId: id,
      reference: `guide_${id}_${buyerId}`,
    });
    return { type, result, payout };
  }

  if (type === "booking") {
    const result = await fulfillBooking({
      bookingId: id,
      provider: "paypal",
      payoutProvider: settlement,
      paymentRef,
      platformFee: platformFeeCents,
      vendorNet: sellerNetCents,
    });
    const payout = await queuePayout({
      relatedType: "booking",
      relatedId: id,
      reference: `booking_${id}`,
    });
    return { type, result, payout };
  }

  if (type === "order") {
    const result = await fulfillOrder({
      orderId: id,
      provider: "paypal",
      payoutProvider: settlement,
      paymentRef,
      platformFee: platformFeeCents,
      vendorNet: sellerNetCents,
    });
    const payout = await queuePayout({
      relatedType: "order",
      relatedId: id,
      reference: `order_${id}`,
    });
    return { type, result, payout };
  }

  throw new Error(`settlePaypalPurchase: unknown purchase type "${type}"`);
}

/**
 * Who sells this item. PayPal's custom_id is capped at 127 characters, so the
 * seller is looked up from the item rather than packed into the payment — which
 * is also what keeps a stale rail from being honoured after a routing change.
 */
async function resolveSellerId(type, id) {
  if (!id) return null;

  if (type === "ticket" || type === "ticket_batch") {
    const event = await Event.findById(id).select("createdBy");
    return event?.createdBy || null;
  }
  if (type === "guide") {
    const guide = await Guide.findById(id).select("author");
    return guide?.author || null;
  }
  if (type === "booking") {
    const booking = await Booking.findById(id).select("vendor");
    return booking?.vendor || null;
  }
  if (type === "order") {
    const order = await Order.findById(id).select("vendor");
    return order?.vendor || null;
  }
  return null;
}

export default { settlePaypalPurchase };
