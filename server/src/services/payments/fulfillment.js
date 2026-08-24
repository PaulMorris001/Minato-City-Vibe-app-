/**
 * Provider-agnostic fulfillment.
 *
 * Once a payment is verified (by Stripe or Paystack), these helpers grant the
 * buyer access and run the side effects (passes, attendee lists, cache busting,
 * seller notifications). Keeping this logic in one place means both providers
 * behave identically — the only provider-specific work is verifying the payment
 * and moving the money, which lives in the provider controllers.
 *
 * Seller notifications belong HERE, not in the buyer's client. They used to be
 * fired by a POST the buying app made after checkout, which meant a buyer who
 * closed the app — or bought from the web, which never called it at all — left
 * the seller with no record of the sale.
 */

import User from "../../models/user.model.js";
import Event from "../../models/event.model.js";
import Guide from "../../models/guide.model.js";
import Ticket from "../../models/ticket.model.js";
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import Chat from "../../models/chat.model.js";
import chatService from "../chat.service.js";
import { notifyUser } from "../notification.service.js";
import { sendSaleEmail, sendPurchaseReceiptEmail } from "../email.service.js";
import { computeSplit } from "./split.js";
import { issueEventPass } from "../pass.service.js";
import { invalidateCachePattern } from "../../utils/cache.js";
import config from "../../config/env.js";
import TicketOrder from "../../models/ticketOrder.model.js";
import { getSettlementProvider, PAYOUT_ROUTING_FIELDS } from "./resolveProvider.js";
import { applyRedemptionByReference } from "./discount.service.js";
import { findOrCreateGuestUser } from "../../controllers/guestCheckout.controller.js";

/** "USD 25.00" / "NGN 4,000.00" — or "Free" for zero-amount purchases. */
export function formatAmountText(amount, currency) {
  if (!amount || amount <= 0) return "Free";
  return `${String(currency || "USD").toUpperCase()} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Grant a ticket after a verified payment. Idempotent on (event, user).
 *
 * @param {object} args
 * @param {string} args.eventId
 * @param {string} args.userId            buyer
 * @param {"stripe"|"paystack"|"none"} args.provider  "none" = 100%-off discount
 * @param {string} args.paymentRef        provider charge ref (PaymentIntent id / Paystack reference)
 * @param {string} [args.currency]
 * @param {number} [args.platformFeeCents] platform cut (provider native units)
 * @param {number} [args.sellerNetCents]   seller share  (provider native units)
 * @param {number} [args.amountPaid]      what was actually charged (major units; absent = face price)
 * @param {string} [args.discountCode]    applied discount code, if any
 * @param {number} [args.discountAmount]  discount taken off the face price (major units)
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
  amountPaid,
  discountCode,
  discountAmount,
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
    // Left unset when the caller resolved no rail (seller outside every payout
    // footprint). Recording a rail that can't reach them would be a lie the
    // payout job later trips over — absent is the honest value.
    ...(payoutProvider ? { payoutProvider } : {}),
    currency: currency || event.currency || "usd",
    platformFeeCents,
    sellerNetCents,
    // Discount snapshot: what the buyer actually paid vs. the face price above.
    // Absent on undiscounted tickets — readers fall back to ticketPrice.
    ...(amountPaid !== undefined ? { amountPaid } : {}),
    ...(discountCode ? { discountCode } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
  };
  if (provider === "paystack") ticketData.paystackReference = paymentRef;
  else if (provider === "stripe") ticketData.stripePaymentIntentId = paymentRef;
  // provider "none" (100%-discount): no charge exists; the reference lives on
  // the DiscountRedemption, so neither provider field gets a fake value.

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

  // Notify both parties. Inside the non-early-return branch, so a confirm
  // and a webhook racing the same payment can't notify twice.
  const [buyer, seller] = await Promise.all([
    User.findById(userId).select("username email"),
    User.findById(event.createdBy).select("username email"),
  ]);
  await notifyUser(event.createdBy, {
    type: "ticket_sold",
    title: "🎟️ New Ticket Sold!",
    body: `${buyer?.username || "Someone"} just bought a ticket to "${event.title}"`,
    data: { eventId: eventId.toString() },
  });
  await notifyUser(userId, {
    type: "ticket_purchased",
    title: "🎟️ Ticket Confirmed",
    body: `You're going to "${event.title}"! Your QR pass is in your email.`,
    data: { eventId: eventId.toString() },
  });

  // Seller sale email, fire-and-forget so the confirm response isn't held up.
  // The buyer's email is the QR pass sent above — no separate receipt.
  if (seller?.email) {
    sendSaleEmail(seller.email, {
      sellerName: seller.username,
      buyerName: buyer?.username,
      itemLabel: "Ticket",
      itemTitle: event.title,
      amountText: formatAmountText(
        amountPaid !== undefined ? amountPaid : ticketData.ticketPrice,
        ticketData.currency
      ),
    }).catch((e) => console.error("sendSaleEmail (fulfillTicket) failed:", e));
  }

  return { ticket: populated, alreadyExisted: false };
}

/**
 * Create ONE ticket for a recipient and issue its per-ticket pass. Used by the
 * batch (guest / multi / gift) checkout, where the payer differs from the
 * attendee and several tickets — even to the same email — are allowed. Unlike
 * `fulfillTicket`, there is no one-per-(event,user) guard; batch idempotency is
 * handled by the caller (the TicketOrder `status`).
 *
 * Does NOT touch the event's attendee lists or notify — the caller batches those
 * once for the whole order.
 *
 * @param {object} args
 * @param {object} args.event               loaded Event doc
 * @param {string} args.recipientUserId     the ticket holder (guest or real user)
 * @param {string} args.buyerUserId         the payer
 * @param {object|null} args.tier           { tierId, name, price } or null (single-price)
 * @param {"stripe"|"paystack"|"none"} args.provider  "none" = 100%-off discount
 * @param {"paystack"|"stripe"|null} args.payoutProvider
 * @param {string} args.paymentRef
 * @param {string} args.currency
 * @param {number} args.platformFeeCents
 * @param {number} args.sellerNetCents
 * @param {string} args.recipientEmail
 * @param {string} [args.recipientName]
 * @param {number} [args.amountPaid]        what was actually charged for this ticket (major units)
 * @param {string} [args.discountCode]      applied discount code, if any
 * @param {number} [args.discountAmount]    discount taken off the face price (major units)
 * @returns {Promise<object>} the created ticket
 */
export async function issueRecipientTicket({
  event,
  recipientUserId,
  buyerUserId,
  tier,
  provider,
  payoutProvider,
  paymentRef,
  currency,
  platformFeeCents = 0,
  sellerNetCents = 0,
  recipientEmail,
  recipientName,
  amountPaid,
  discountCode,
  discountAmount,
  sendPassEmail = true,
}) {
  const ticketData = {
    event: event._id,
    user: recipientUserId,
    buyer: buyerUserId,
    recipientEmail,
    ticketPrice: tier ? tier.price : event.ticketPrice,
    ...(tier ? { tierId: tier.tierId, tierName: tier.name } : {}),
    provider,
    // See fulfillTicket — absent when the seller has no payout rail.
    ...(payoutProvider ? { payoutProvider } : {}),
    currency: currency || event.currency || "usd",
    platformFeeCents,
    sellerNetCents,
    // Discount snapshot — see fulfillTicket.
    ...(amountPaid !== undefined ? { amountPaid } : {}),
    ...(discountCode ? { discountCode } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
  };
  if (provider === "paystack") ticketData.paystackReference = paymentRef;
  else if (provider === "stripe") ticketData.stripePaymentIntentId = paymentRef;
  // provider "none" (100%-discount): no charge exists; the reference lives on
  // the DiscountRedemption, so neither provider field gets a fake value.

  const ticket = await Ticket.create(ticketData);

  // Per-ticket pass, emailed to the recipient (fire-and-forget).
  issueEventPass({
    userId: recipientUserId,
    eventId: event._id,
    type: "ticket",
    ticketId: ticket._id,
    recipientEmail,
    recipientName,
    sendEmail: sendPassEmail,
  }).catch((e) => console.error("issueEventPass (issueRecipientTicket) failed:", e));

  return ticket;
}

/**
 * Fan a paid TicketOrder out into one ticket + pass per line item.
 *
 * THE CALLER MUST HAVE VERIFIED THE CHARGE. This function moves no money and
 * checks no payment — it reads the accounting frozen onto the order at init
 * (items, prices, discount, total) and issues against it.
 *
 * Shared by the buyer's confirm call and BOTH provider webhooks. It used to live
 * inline in confirmTicketBatch, which meant a batch order was only ever fulfilled
 * if the buyer's browser completed the round trip — close the tab (or, on the web
 * Paystack popup, simply let it redirect away) and the buyer was charged while the
 * seller got no ticket, no sale and no payout. Six such orders were stranded in
 * production before this existed.
 *
 * Re-entrant, because a webhook and a confirm WILL race:
 *  - the "pending" -> "fulfilling" flip is an atomic claim; whoever loses returns
 *    without issuing anything,
 *  - `ticketIds` is appended as each ticket is created, so a retry after a partial
 *    failure resumes at the first unissued item instead of duplicating,
 *  - a throw reverts the claim to "pending" so the other path can pick it up.
 *
 * @param {object} args
 * @param {object} args.order          a TicketOrder doc ("pending" or "fulfilling")
 * @param {object} [args.event]        the loaded Event, if the caller already has it
 * @param {boolean} [args.notifyBuyers=true]  false suppresses everything aimed at the
 *   buyer — pass emails, receipt, in-app confirmation — while still recording the
 *   tickets and passes. For repairing an order after its event has finished, where
 *   "your pass is here" for a past date reads as a fault, not a fix. The seller is
 *   always told, because the sale is real and drives their payout.
 * @returns {Promise<{ ticketIds: string[], alreadyFulfilled: boolean }>}
 */
export async function fulfillTicketOrder({ order, event: loadedEvent, notifyBuyers = true }) {
  if (order.status === "paid") {
    return { ticketIds: order.ticketIds || [], alreadyFulfilled: true };
  }

  // Atomic claim. A null result means another caller is mid-fan-out (or just
  // finished) — never issue a second set of tickets on top of theirs.
  const claimed = await TicketOrder.findOneAndUpdate(
    { _id: order._id, status: "pending" },
    { status: "fulfilling" },
    { new: true }
  );
  if (!claimed) {
    const current = await TicketOrder.findById(order._id).select("ticketIds status");
    return { ticketIds: current?.ticketIds || [], alreadyFulfilled: true };
  }

  const event = loadedEvent || (await Event.findById(claimed.event));
  if (!event) {
    await TicketOrder.updateOne({ _id: claimed._id }, { status: "pending" });
    throw new Error(`fulfillTicketOrder: event ${claimed.event} not found`);
  }
  const eventKey = event._id;
  const reference = claimed.reference;
  const isPaystack = claimed.provider === "paystack";
  const isFree = claimed.provider === "none";

  // Re-derived from the seller rather than read back from the order, so a
  // routing change between init and fulfillment settles on today's rail.
  const seller = await User.findById(claimed.seller).select(PAYOUT_ROUTING_FIELDS);
  const payoutProvider = isPaystack ? "paystack" : getSettlementProvider(seller);

  // Discounted orders spread the charge across items proportionally
  // (scale = total/subtotal) so per-ticket accounting sums to exactly what was
  // paid; the rounding remainder lands on the last item. Undiscounted orders
  // have no `subtotal`, scale 1. Computed for EVERY item up front so a resumed
  // run gives the remainder to the same item a clean run would have.
  const round2 = (n) => Math.round(n * 100) / 100;
  const scale = claimed.subtotal ? claimed.total / claimed.subtotal : 1;
  const amounts = [];
  let paidSoFar = 0;
  for (let i = 0; i < claimed.items.length; i++) {
    const isLast = i === claimed.items.length - 1;
    const paidForItem = isLast
      ? round2(claimed.total - paidSoFar)
      : round2(claimed.items[i].price * scale);
    paidSoFar = round2(paidSoFar + paidForItem);
    amounts.push(paidForItem);
  }

  const ticketIds = [...(claimed.ticketIds || [])];
  try {
    for (let i = ticketIds.length; i < claimed.items.length; i++) {
      const item = claimed.items[i];
      const paidForItem = amounts[i];
      const recipient = await findOrCreateGuestUser(item.recipientEmail, item.recipientName);
      // Fee accounting mirrors the single-ticket flow: Stripe stores cents,
      // Paystack stores major units (the field name says "Cents"; currency
      // disambiguates — see ticket.model.js).
      let platformFeeCents, sellerNetCents;
      if (isPaystack || isFree) {
        const split = computeSplit(paidForItem);
        platformFeeCents = split.platformFee;
        sellerNetCents = split.sellerNet;
      } else {
        const cents = Math.round(paidForItem * 100);
        platformFeeCents = Math.round(cents * (config.stripe.platformFeePercent / 100));
        sellerNetCents = cents - platformFeeCents;
      }
      const tier = item.tierId
        ? { tierId: item.tierId, name: item.tierName, price: item.price }
        : null;
      const ticket = await issueRecipientTicket({
        event,
        recipientUserId: recipient._id,
        buyerUserId: claimed.buyer,
        tier,
        provider: claimed.provider,
        payoutProvider,
        paymentRef: reference,
        currency: isPaystack || isFree ? claimed.currency : "usd",
        platformFeeCents,
        sellerNetCents,
        recipientEmail: item.recipientEmail,
        recipientName: item.recipientName,
        sendPassEmail: notifyBuyers,
        ...(claimed.discountCode
          ? {
              amountPaid: paidForItem,
              discountCode: claimed.discountCode,
              discountAmount: round2(item.price - paidForItem),
            }
          : {}),
      });
      // Persisted per ticket, not in one write at the end: a crash mid-fan-out
      // must leave a record of what was already issued, or the retry duplicates.
      await TicketOrder.updateOne({ _id: claimed._id }, { $push: { ticketIds: ticket._id } });
      ticketIds.push(ticket._id);
    }
  } catch (err) {
    // Release the claim so the other path (webhook / confirm retry) can resume.
    await TicketOrder.updateOne({ _id: claimed._id }, { status: "pending" });
    throw err;
  }

  // Ticket holders (buyers, gift recipients, guests) are intentionally NOT
  // added to rsvpUsers/invitedUsers: attendance for a paid event is tracked by
  // Ticket records (so capacity counts every ticket, and one buyer holding
  // several is counted correctly), and dropping them keeps auto-created guest /
  // gift-recipient accounts out of the public "who's coming" list.

  // Event detail is cached under whichever param the caller used, so drop the
  // `_id`, slug and shareToken keys — otherwise a slug-fetched page keeps
  // serving stale ticket counts after a sale.
  for (const key of [eventKey, event.slug, event.shareToken].filter(Boolean)) {
    invalidateCachePattern(`event_detail_${key}_`);
  }
  invalidateCachePattern("public_events_");
  invalidateCachePattern("event_highlights_");

  // Notify + email both parties. notifyUser writes the durable Notification
  // doc — the old bare push left the seller with no in-app record of the sale.
  const [buyer, sellerUser] = await Promise.all([
    User.findById(claimed.buyer).select("username email"),
    User.findById(event.createdBy).select("username email"),
  ]);
  const ticketCount = claimed.items.length;
  const ticketLabel = ticketCount === 1 ? "Ticket" : "Tickets";
  const amountText = formatAmountText(claimed.total, claimed.currency || "usd");
  await notifyUser(event.createdBy, {
    type: "ticket_sold",
    title: "🎟️ Tickets sold!",
    body: `${ticketCount} ticket${ticketCount === 1 ? "" : "s"} just sold for "${event.title}"`,
    data: { eventId: eventKey.toString() },
  });
  if (notifyBuyers) {
    await notifyUser(claimed.buyer, {
      type: "ticket_purchased",
      title: "🎟️ Tickets Confirmed",
      body: `${ticketCount} ticket${ticketCount === 1 ? "" : "s"} for "${event.title}" — passes emailed to each recipient`,
      data: { eventId: eventKey.toString() },
    });
  }
  if (sellerUser?.email) {
    sendSaleEmail(sellerUser.email, {
      sellerName: sellerUser.username,
      buyerName: buyer?.username,
      itemLabel: ticketLabel,
      itemTitle: event.title,
      amountText,
      quantity: ticketCount,
    }).catch((e) => console.error("sendSaleEmail (fulfillTicketOrder) failed:", e));
  }
  if (notifyBuyers && buyer?.email) {
    sendPurchaseReceiptEmail(buyer.email, {
      buyerName: buyer.username,
      sellerName: sellerUser?.username,
      itemLabel: ticketLabel,
      itemTitle: event.title,
      amountText,
      quantity: ticketCount,
    }).catch((e) => console.error("sendPurchaseReceiptEmail (fulfillTicketOrder) failed:", e));
  }

  await TicketOrder.updateOne({ _id: claimed._id }, { status: "paid", paidAt: new Date() });

  // Settle the discount reservation now that the order is fulfilled.
  if (claimed.discountCode) await applyRedemptionByReference(reference);

  return { ticketIds, alreadyFulfilled: false };
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
  // Ledger entry alongside the access grant — purchasedBy answers "may they read
  // it?", this answers "what did the author earn, and when?".
  const { sellerNet } = computeSplit(guide.price || 0);
  guide.sales.push({
    user: userId,
    purchasedAt: new Date(),
    gross: guide.price || 0,
    net: sellerNet,
    currency: guide.currency || "USD",
  });
  await guide.save();

  // `guide.author` — NOT `createdBy`, which doesn't exist on this schema. The
  // now-deprecated client-called /notifications/sold endpoint used `createdBy`,
  // so it wrote `{ user: undefined }`, failed validation, and had its error
  // swallowed: guide sellers never once received an in-app sale notification.
  const [buyer, author] = await Promise.all([
    User.findById(userId).select("username email"),
    User.findById(guide.author).select("username email"),
  ]);
  await notifyUser(guide.author, {
    type: "guide_sold",
    title: "📖 Guide Purchased!",
    body: `${buyer?.username || "Someone"} just bought your guide "${guide.title}"`,
    data: { guideId: guideId.toString() },
  });
  await notifyUser(userId, {
    type: "guide_purchased",
    title: "📖 Guide Unlocked",
    body: `You now have full access to "${guide.title}"`,
    data: { guideId: guideId.toString() },
  });

  // Emails to both parties, fire-and-forget.
  const amountText = formatAmountText(guide.price || 0, guide.currency || "USD");
  if (buyer?.email) {
    sendPurchaseReceiptEmail(buyer.email, {
      buyerName: buyer.username,
      sellerName: author?.username,
      itemLabel: "Guide",
      itemTitle: guide.title,
      amountText,
    }).catch((e) => console.error("sendPurchaseReceiptEmail (fulfillGuide) failed:", e));
  }
  if (author?.email) {
    sendSaleEmail(author.email, {
      sellerName: author.username,
      buyerName: buyer?.username,
      itemLabel: "Guide",
      itemTitle: guide.title,
      amountText,
    }).catch((e) => console.error("sendSaleEmail (fulfillGuide) failed:", e));
  }

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
  // Left unset when the seller has no payout rail — see fulfillTicket.
  if (payoutProvider) booking.payoutProvider = payoutProvider;
  booking.paymentRef = paymentRef;
  booking.platformFee = platformFee;
  booking.vendorNet = vendorNet;
  booking.paidAt = new Date();
  await booking.save();

  // Notify the vendor that the client has paid.
  const client = await User.findById(booking.client).select("username");
  await notifyUser(booking.vendor, {
    type: "booking_paid",
    title: "💳 Booking Paid",
    body: `${client?.username || "A client"} just paid for their booking`,
    data: { bookingId: bookingId.toString() },
  });

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
  // Left unset when the seller has no payout rail — see fulfillTicket.
  if (payoutProvider) order.payoutProvider = payoutProvider;
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

  // Notify both parties that the payment went through.
  const [client, vendor] = await Promise.all([
    User.findById(order.client).select("username email"),
    User.findById(order.vendor).select("username email businessName"),
  ]);
  const chatId = order.chat?.toString() || "";
  const vendorName = vendor?.businessName || vendor?.username;
  const amountText = formatAmountText(order.total, order.currency);
  await notifyUser(order.vendor, {
    type: "order_paid",
    title: "💳 Order Paid",
    body: `${client?.username || "A client"} just paid for their order`,
    data: { orderId: orderId.toString(), chatId },
  });
  await notifyUser(order.client, {
    type: "order_purchased",
    title: "✅ Payment Confirmed",
    body: `Your order with ${vendorName || "the vendor"} is paid (${amountText})`,
    data: { orderId: orderId.toString(), chatId },
  });

  // Emails to both parties, fire-and-forget.
  const itemTitle =
    order.items.length === 1
      ? order.items[0].name
      : `${order.items[0].name} + ${order.items.length - 1} more`;
  const quantity = order.items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  if (client?.email) {
    sendPurchaseReceiptEmail(client.email, {
      buyerName: client.username,
      sellerName: vendorName,
      itemLabel: "Order",
      itemTitle,
      amountText,
      quantity,
    }).catch((e) => console.error("sendPurchaseReceiptEmail (fulfillOrder) failed:", e));
  }
  if (vendor?.email) {
    sendSaleEmail(vendor.email, {
      sellerName: vendorName,
      buyerName: client?.username,
      itemLabel: "Order",
      itemTitle,
      amountText,
      quantity,
    }).catch((e) => console.error("sendSaleEmail (fulfillOrder) failed:", e));
  }

  return { order, alreadyPaid: false };
}

export default {
  fulfillTicket,
  issueRecipientTicket,
  fulfillTicketOrder,
  fulfillGuide,
  fulfillBooking,
  fulfillOrder,
};
