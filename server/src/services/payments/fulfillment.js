/**
 * Provider-agnostic fulfillment.
 *
 * Once a payment is verified (by Stripe or Paystack), these helpers grant the
 * buyer access and run the side effects (passes, attendee lists, cache busting,
 * push notifications). Keeping this logic in one place means both providers
 * behave identically — the only provider-specific work is verifying the payment
 * and moving the money, which lives in the provider controllers.
 */

import User from "../../models/user.model.js";
import Event from "../../models/event.model.js";
import Guide from "../../models/guide.model.js";
import Ticket from "../../models/ticket.model.js";
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import Chat from "../../models/chat.model.js";
import chatService from "../chat.service.js";
import { sendPushNotification } from "../notification.service.js";
import { issueEventPass } from "../pass.service.js";
import { invalidateCachePattern } from "../../utils/cache.js";

/**
 * Grant a ticket after a verified payment. Idempotent on (event, user).
 *
 * @param {object} args
 * @param {string} args.eventId
 * @param {string} args.userId            buyer
 * @param {"stripe"|"paystack"} args.provider
 * @param {string} args.paymentRef        provider charge ref (PaymentIntent id / Paystack reference)
 * @param {string} [args.currency]
 * @param {number} [args.platformFeeCents] platform cut (provider native units)
 * @param {number} [args.sellerNetCents]   seller share  (provider native units)
 * @returns {Promise<{ ticket: object, alreadyExisted: boolean }>}
 */
export async function fulfillTicket({
  eventId,
  userId,
  provider,
  payoutProvider,
  paymentRef,
  currency,
  platformFeeCents = 0,
  sellerNetCents = 0,
  tierId,
}) {
  const existing = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
  if (existing) return { ticket: existing, alreadyExisted: true };

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  // Tiered events: snapshot the purchased tier's name/price onto the ticket.
  // The tierId comes from payment metadata (Stripe) or the confirm body after
  // amount verification (Paystack), both established at init time.
  const tier = tierId && event.ticketTiers?.length ? event.ticketTiers.id(tierId) : null;

  const ticketData = {
    event: eventId,
    user: userId,
    ticketPrice: tier ? tier.price : event.ticketPrice,
    ...(tier ? { tierId: tier._id, tierName: tier.name } : {}),
    provider,
    // Stripe-collected sales settle via Wise; Paystack settles its own.
    payoutProvider: payoutProvider || (provider === "stripe" ? "wise" : provider),
    currency: currency || event.currency || "usd",
    platformFeeCents,
    sellerNetCents,
  };
  if (provider === "paystack") ticketData.paystackReference = paymentRef;
  else ticketData.stripePaymentIntentId = paymentRef;

  const ticket = await Ticket.create(ticketData);

  // Issue the attendance pass + email the QR ticket (fire-and-forget).
  issueEventPass({ userId, eventId, type: "ticket", ticketId: ticket._id }).catch((e) =>
    console.error("issueEventPass (fulfillTicket) failed:", e)
  );

  // Surface the buyer as a confirmed attendee so going-count / capacity reflect
  // the purchase immediately.
  let listsChanged = false;
  if (!event.rsvpUsers.some((id) => id.toString() === userId.toString())) {
    event.rsvpUsers.push(userId);
    listsChanged = true;
  }
  if (!event.invitedUsers.some((id) => id.toString() === userId.toString())) {
    event.invitedUsers.push(userId);
    listsChanged = true;
  }
  if (listsChanged) await event.save();

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
    `${buyer?.username || "Someone"} just bought a ticket to "${event.title}"`,
    { type: "ticket_sold", eventId: eventId.toString() }
  );

  return { ticket: populated, alreadyExisted: false };
}

/**
 * Grant a guide after a verified payment. Idempotent on purchasedBy.
 *
 * @param {object} args
 * @param {string} args.guideId
 * @param {string} args.userId  buyer
 * @returns {Promise<{ alreadyPurchased: boolean }>}
 */
export async function fulfillGuide({ guideId, userId }) {
  const guide = await Guide.findById(guideId);
  if (!guide) throw new Error("Guide not found");

  if (guide.purchasedBy.some((id) => id.toString() === userId.toString())) {
    return { alreadyPurchased: true };
  }

  guide.purchasedBy.push(userId);
  await guide.save();

  const buyer = await User.findById(userId).select("username");
  const author = await User.findById(guide.author).select("fcmToken");
  await sendPushNotification(
    author?.fcmToken,
    "📖 Guide Purchased!",
    `${buyer?.username || "Someone"} just bought your guide "${guide.title}"`,
    { type: "guide_sold", guideId: guideId.toString() }
  );

  return { alreadyPurchased: false };
}

/**
 * Mark a booking paid after a verified payment. Idempotent on paymentStatus.
 *
 * @param {object} args
 * @param {string} args.bookingId
 * @param {"stripe"|"paystack"} args.provider
 * @param {string} args.paymentRef
 * @param {number} [args.platformFee]
 * @param {number} [args.vendorNet]
 * @returns {Promise<{ booking: object, alreadyPaid: boolean }>}
 */
export async function fulfillBooking({
  bookingId,
  provider,
  payoutProvider,
  paymentRef,
  platformFee = 0,
  vendorNet = 0,
}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error("Booking not found");
  if (booking.paymentStatus === "paid") return { booking, alreadyPaid: true };

  booking.paymentStatus = "paid";
  booking.provider = provider;
  // Stripe-collected bookings settle via Wise; Paystack settles its own.
  booking.payoutProvider = payoutProvider || (provider === "stripe" ? "wise" : provider);
  booking.paymentRef = paymentRef;
  booking.platformFee = platformFee;
  booking.vendorNet = vendorNet;
  booking.paidAt = new Date();
  await booking.save();

  // Notify the vendor that the client has paid.
  const client = await User.findById(booking.client).select("username");
  const vendor = await User.findById(booking.vendor).select("fcmToken");
  await sendPushNotification(
    vendor?.fcmToken,
    "💳 Booking Paid",
    `${client?.username || "A client"} just paid for their booking`,
    { type: "booking_paid", bookingId: bookingId.toString() }
  );

  return { booking, alreadyPaid: false };
}

/**
 * Mark a multi-item order paid after a verified payment. Idempotent on
 * paymentStatus. Mirrors fulfillBooking, plus a "Payment received" system
 * message posted into the order's chat.
 *
 * @param {object} args
 * @param {string} args.orderId
 * @param {"stripe"|"paystack"} args.provider
 * @param {string} args.paymentRef
 * @param {number} [args.platformFee]
 * @param {number} [args.vendorNet]
 * @returns {Promise<{ order: object, alreadyPaid: boolean }>}
 */
export async function fulfillOrder({
  orderId,
  provider,
  payoutProvider,
  paymentRef,
  platformFee = 0,
  vendorNet = 0,
}) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") return { order, alreadyPaid: true };

  order.paymentStatus = "paid";
  order.status = "paid";
  order.provider = provider;
  // Stripe-collected orders settle via Wise; Paystack settles its own.
  order.payoutProvider = payoutProvider || (provider === "stripe" ? "wise" : provider);
  order.paymentRef = paymentRef;
  order.platformFee = platformFee;
  order.vendorNet = vendorNet;
  order.paidAt = new Date();
  await order.save();

  // Post a "Payment received" line into the chat (best-effort).
  if (order.chat) {
    try {
      const chat = await Chat.findById(order.chat);
      if (chat) await chatService.postSystemMessage(chat, order.client, "Payment received ✓");
    } catch (e) {
      console.error("fulfillOrder system message failed:", e);
    }
  }

  // Notify the vendor that the client has paid.
  const client = await User.findById(order.client).select("username");
  const vendor = await User.findById(order.vendor).select("fcmToken");
  await sendPushNotification(
    vendor?.fcmToken,
    "💳 Order Paid",
    `${client?.username || "A client"} just paid for their order`,
    { type: "order_paid", orderId: orderId.toString() }
  );

  return { order, alreadyPaid: false };
}

export default { fulfillTicket, fulfillGuide, fulfillBooking, fulfillOrder };
