/**
 * Provider-agnostic fulfillment.
 *
 * Once a payment is verified (by Stripe or Flutterwave), these helpers grant the
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
import { sendPushNotification } from "../notification.service.js";
import { issueEventPass } from "../pass.service.js";
import { invalidateCachePattern } from "../../utils/cache.js";

/**
 * Grant a ticket after a verified payment. Idempotent on (event, user).
 *
 * @param {object} args
 * @param {string} args.eventId
 * @param {string} args.userId            buyer
 * @param {"stripe"|"flutterwave"} args.provider
 * @param {string} args.paymentRef        provider charge id (PaymentIntent / FLW tx id)
 * @param {string} [args.currency]
 * @param {number} [args.platformFeeCents] platform cut (provider native units)
 * @param {number} [args.sellerNetCents]   seller share  (provider native units)
 * @returns {Promise<{ ticket: object, alreadyExisted: boolean }>}
 */
export async function fulfillTicket({
  eventId,
  userId,
  provider,
  paymentRef,
  currency,
  platformFeeCents = 0,
  sellerNetCents = 0,
}) {
  const existing = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
  if (existing) return { ticket: existing, alreadyExisted: true };

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const ticketData = {
    event: eventId,
    user: userId,
    ticketPrice: event.ticketPrice,
    provider,
    currency: currency || event.currency || "usd",
    platformFeeCents,
    sellerNetCents,
  };
  if (provider === "flutterwave") ticketData.flutterwaveTxId = paymentRef;
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
 * @param {"stripe"|"flutterwave"} args.provider
 * @param {string} args.paymentRef
 * @param {number} [args.platformFee]
 * @param {number} [args.vendorNet]
 * @returns {Promise<{ booking: object, alreadyPaid: boolean }>}
 */
export async function fulfillBooking({
  bookingId,
  provider,
  paymentRef,
  platformFee = 0,
  vendorNet = 0,
}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error("Booking not found");
  if (booking.paymentStatus === "paid") return { booking, alreadyPaid: true };

  booking.paymentStatus = "paid";
  booking.provider = provider;
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

export default { fulfillTicket, fulfillGuide, fulfillBooking };
