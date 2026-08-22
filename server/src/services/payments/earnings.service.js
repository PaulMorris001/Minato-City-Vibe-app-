/**
 * Seller-facing earnings.
 *
 * This exists because a seller had no way to see their own money. The only
 * money surface in the app summed CONFIRMED BOOKINGS ONLY — so someone who sold
 * tickets or guides looked at their dashboard and saw zero, while their earnings
 * sat perfectly safe in the platform balance. That is the "she sold something
 * and didn't get the money" report.
 *
 * Four sources, one shape:
 *   ticket  — Ticket docs on events this user created (payout batched by the
 *             release job after the event's hold window)
 *   guide   — Guide.sales entries (payout queued immediately)
 *   booking — paid Bookings where they're the vendor
 *   order   — paid Orders where they're the vendor
 *
 * UNITS ARE THE HAZARD HERE. Stripe collects in cents, Paystack in major local
 * units, and both write to the same `sellerNetCents` / `vendorNet` fields. Every
 * conversion goes through `toMajorNet` and nowhere else.
 *
 * Payout status is attached by loading this seller's payouts once and indexing
 * them by `reference` — the same key scheme createPayout writes, reused rather
 * than reinvented as a second join.
 */

import Event from "../../models/event.model.js";
import Ticket from "../../models/ticket.model.js";
import Guide from "../../models/guide.model.js";
import User from "../../models/user.model.js";
import Payout from "../../models/payout.model.js";
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import {
  getSettlementProvider,
  payoutSupported,
  payoutCountryKnown,
  hasPayoutOnboarding,
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
} from "./resolveProvider.js";

/**
 * Normalize a stored seller-net into MAJOR units of its currency.
 *
 * Paystack collects and stores major local units already; everything else was
 * Stripe-collected, i.e. cents. Dividing a Paystack amount here would under-
 * report a Nigerian seller's earnings by 100×, which is the single most likely
 * bug in this file — keep this the only place the conversion happens.
 *
 * @param {number} net              stored net, provider-native units
 * @param {string} [provider]       the COLLECTION provider ("stripe"|"paystack")
 * @returns {number} major units
 */
export function toMajorNet(net, provider) {
  const value = Number(net || 0);
  return provider === "paystack" ? value : value / 100;
}

/** Payout reference keys, mirroring createPayout's scheme exactly. */
function payoutReference(type, relatedId, buyerId) {
  if (type === "ticket") return `event_payout_${relatedId}`;
  if (type === "guide") return `guide_${relatedId}_${buyerId}`;
  return `${type}_${relatedId}`;
}

/**
 * When ticket money for an event becomes releasable: event date + hold window.
 * Before this, the earnings are real but deliberately not payable yet — that's
 * what `inHoldWindow` reports, and it's usually the honest answer to "where is
 * my money?".
 */
function ticketReleaseAt(event) {
  return new Date(
    new Date(event.date).getTime() + (event.payoutDelayHours ?? 24) * 60 * 60 * 1000
  );
}

/**
 * Collect every sale belonging to a seller, newest first.
 *
 * @param {string} sellerId
 * @returns {Promise<{sales: object[], payoutByRef: Map<string, object>}>}
 */
async function collectSales(sellerId) {
  const now = new Date();
  const sales = [];

  // ── Tickets ────────────────────────────────────────────────────────────────
  // Tickets don't carry the seller; they carry the event. Resolve the seller's
  // events first (`_id` only) and match on those.
  const events = await Event.find({ createdBy: sellerId })
    .select("_id title date payoutDelayHours payoutStatus")
    .lean();
  const eventById = new Map(events.map((e) => [String(e._id), e]));

  if (events.length) {
    const tickets = await Ticket.find({
      event: { $in: events.map((e) => e._id) },
      isValid: true,
      refunded: { $ne: true },
    })
      .select("event user ticketPrice amountPaid discountCode currency provider sellerNetCents createdAt tierName")
      .populate("user", "username profilePicture")
      .lean();

    for (const t of tickets) {
      const event = eventById.get(String(t.event));
      const held = event ? ticketReleaseAt(event) > now : false;
      sales.push({
        id: String(t._id),
        type: "ticket",
        title: event?.title || "Event",
        subtitle: t.tierName || null,
        buyerName: t.user?.username || null,
        buyerAvatar: t.user?.profilePicture || null,
        // amountPaid is what was actually charged (discount codes); legacy
        // tickets lack it and fall back to the face price. `??`, not `||` — a
        // 100%-off ticket's amountPaid of 0 must not fall through.
        gross: Number(t.amountPaid ?? t.ticketPrice ?? 0),
        net: toMajorNet(t.sellerNetCents, t.provider),
        currency: (t.currency || "USD").toUpperCase(),
        soldAt: t.createdAt,
        relatedId: String(t.event),
        reference: payoutReference("ticket", t.event),
        held,
      });
    }
  }

  // ── Guides ─────────────────────────────────────────────────────────────────
  // Sales come from the ledger. Guides sold before the ledger existed have
  // entries in `purchasedBy` but not `sales`; those are counted in the totals
  // via the payout records instead of being invented here with a wrong date.
  const guides = await Guide.find({ author: sellerId })
    .select("title price currency sales")
    .lean();

  const guideBuyerIds = guides.flatMap((g) => (g.sales || []).map((s) => s.user)).filter(Boolean);
  const guideBuyers = guideBuyerIds.length
    ? await User.find({ _id: { $in: guideBuyerIds } }).select("username profilePicture").lean()
    : [];
  const buyerById = new Map(guideBuyers.map((u) => [String(u._id), u]));

  for (const g of guides) {
    for (const sale of g.sales || []) {
      const buyer = buyerById.get(String(sale.user));
      sales.push({
        id: `${g._id}_${sale.user}`,
        type: "guide",
        title: g.title,
        subtitle: null,
        buyerName: buyer?.username || null,
        buyerAvatar: buyer?.profilePicture || null,
        gross: Number(sale.gross || 0),
        net: Number(sale.net || 0),
        currency: (sale.currency || g.currency || "USD").toUpperCase(),
        soldAt: sale.purchasedAt,
        relatedId: String(g._id),
        reference: payoutReference("guide", g._id, sale.user),
        held: false,
      });
    }
  }

  // ── Bookings ───────────────────────────────────────────────────────────────
  const bookings = await Booking.find({ vendor: sellerId, paymentStatus: "paid" })
    .select("client priceSnapshot provider vendorNet paidAt createdAt")
    .populate("client", "username profilePicture")
    .lean();

  for (const b of bookings) {
    sales.push({
      id: String(b._id),
      type: "booking",
      title: "Booking",
      subtitle: null,
      buyerName: b.client?.username || null,
      buyerAvatar: b.client?.profilePicture || null,
      gross: Number(b.priceSnapshot?.amount || 0),
      net: toMajorNet(b.vendorNet, b.provider),
      currency: (b.priceSnapshot?.currency || "USD").toUpperCase(),
      soldAt: b.paidAt || b.createdAt,
      relatedId: String(b._id),
      reference: payoutReference("booking", b._id),
      held: false,
    });
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  const orders = await Order.find({ vendor: sellerId, paymentStatus: "paid" })
    .select("client total currency provider vendorNet paidAt createdAt items")
    .populate("client", "username profilePicture")
    .lean();

  for (const o of orders) {
    const itemCount = (o.items || []).length;
    sales.push({
      id: String(o._id),
      type: "order",
      title: itemCount === 1 ? "Order · 1 item" : `Order · ${itemCount} items`,
      subtitle: null,
      buyerName: o.client?.username || null,
      buyerAvatar: o.client?.profilePicture || null,
      gross: Number(o.total || 0),
      net: toMajorNet(o.vendorNet, o.provider),
      currency: (o.currency || "USD").toUpperCase(),
      soldAt: o.paidAt || o.createdAt,
      relatedId: String(o._id),
      reference: payoutReference("order", o._id),
      held: false,
    });
  }

  // One payout query for the whole seller, indexed by reference.
  const payouts = await Payout.find({ vendor: sellerId })
    .select("reference status amount currency createdAt relatedType relatedId")
    .lean();
  const payoutByRef = new Map(payouts.map((p) => [p.reference, p]));

  sales.sort((a, b) => new Date(b.soldAt || 0) - new Date(a.soldAt || 0));

  return { sales, payoutByRef, payouts };
}

/**
 * Per-sale payout state, as the seller should read it.
 *
 * "held" is the important one: money that exists, is theirs, and simply hasn't
 * reached its release date. Reporting that as "pending" or omitting it entirely
 * is what makes a seller think a sale vanished.
 */
function resolvePayoutStatus(sale, payoutByRef, railSupported) {
  if (!railSupported) return "unavailable";
  const payout = payoutByRef.get(sale.reference);
  if (payout) return payout.status;
  return sale.held ? "held" : "awaiting_approval";
}

/**
 * Headline earnings figures for a seller.
 *
 * @param {string} sellerId
 * @returns {Promise<object>} EarningsSummary
 */
export async function getEarningsSummary(sellerId) {
  const seller = await User.findById(sellerId).select(PAYOUT_ROUTING_FIELDS).lean();
  const railSupported = payoutSupported(seller);

  const { sales, payoutByRef, payouts } = await collectSales(sellerId);
  const currency = currencyForUser(seller);

  const totals = {
    lifetimeGross: 0,
    lifetimeNet: 0,
    pendingApproval: 0,
    paidOut: 0,
    failed: 0,
    inHoldWindow: 0,
  };
  const bySource = { ticket: 0, guide: 0, booking: 0, order: 0 };

  for (const sale of sales) {
    totals.lifetimeGross += sale.gross;
    totals.lifetimeNet += sale.net;
    bySource[sale.type] = (bySource[sale.type] || 0) + sale.net;

    const status = resolvePayoutStatus(sale, payoutByRef, railSupported);
    if (status === "held") totals.inHoldWindow += sale.net;
    else if (status === "paid") totals.paidOut += sale.net;
    else if (status === "failed" || status === "rejected") totals.failed += sale.net;
    else if (status === "awaiting_approval" || status === "processing") {
      totals.pendingApproval += sale.net;
    }
  }

  // Month-over-month + a 12-bucket sparkline over the last 12 days, matching the
  // vendor dashboard's existing shape so one hero component can render both.
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let thisMonthNet = 0;
  let lastMonthNet = 0;
  const dailyNet = new Array(12).fill(0);
  const dayZero = new Date(now);
  dayZero.setHours(0, 0, 0, 0);
  dayZero.setDate(dayZero.getDate() - 11);

  for (const sale of sales) {
    if (!sale.soldAt) continue;
    const soldAt = new Date(sale.soldAt);
    if (soldAt >= startOfThisMonth) thisMonthNet += sale.net;
    else if (soldAt >= startOfLastMonth) lastMonthNet += sale.net;

    const dayIndex = Math.floor((soldAt - dayZero) / (24 * 60 * 60 * 1000));
    if (dayIndex >= 0 && dayIndex < 12) dailyNet[dayIndex] += sale.net;
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    currency,
    payoutRail: getSettlementProvider(seller),
    payoutSupported: railSupported,
    // Tells the "we don't know your country" banner (fixable, has a CTA) apart
    // from "no rail reaches your country" (permanent). Both leave
    // payoutSupported false, so the client cannot infer it from that alone.
    payoutCountryKnown: payoutCountryKnown(seller),
    payoutOnboarded: hasPayoutOnboarding(seller),
    country: seller?.location?.country || null,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, round2(v)])),
    thisMonthNet: round2(thisMonthNet),
    lastMonthNet: round2(lastMonthNet),
    dailyNet: dailyNet.map(round2),
    salesCount: sales.length,
    payoutCount: payouts.length,
  };
}

/**
 * Paginated sale history, newest first.
 *
 * Cursor is an offset rather than a timestamp: sales are assembled in memory
 * from four collections, so there's no single index to seek into, and a seller's
 * lifetime sale count is small enough that this stays cheap.
 *
 * @param {string} sellerId
 * @param {{cursor?: string, limit?: number, type?: string}} [opts]
 */
export async function listSales(sellerId, { cursor, limit = 20, type } = {}) {
  const seller = await User.findById(sellerId).select(PAYOUT_ROUTING_FIELDS).lean();
  const railSupported = payoutSupported(seller);

  const { sales, payoutByRef } = await collectSales(sellerId);
  const filtered = type ? sales.filter((s) => s.type === type) : sales;

  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  return {
    sales: page.map((sale) => ({
      id: sale.id,
      type: sale.type,
      title: sale.title,
      subtitle: sale.subtitle,
      buyerName: sale.buyerName,
      buyerAvatar: sale.buyerAvatar,
      gross: sale.gross,
      net: sale.net,
      currency: sale.currency,
      soldAt: sale.soldAt,
      relatedId: sale.relatedId,
      payoutStatus: resolvePayoutStatus(sale, payoutByRef, railSupported),
    })),
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
    total: filtered.length,
  };
}

/**
 * The seller's own payout records — the same docs the admin queue shows, minus
 * the internal fields (who approved it, raw provider errors).
 */
export async function listPayouts(sellerId, { status, page = 1, limit = 20 } = {}) {
  const filter = { vendor: sellerId };
  if (status) filter.status = status;

  const skip = (Math.max(1, page) - 1) * limit;
  const [payouts, total] = await Promise.all([
    Payout.find(filter)
      .select("relatedType relatedId provider displayAmount displayCurrency amount currency status createdAt approvedAt rejectedReason")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payout.countDocuments(filter),
  ]);

  return {
    payouts: payouts.map((p) => ({
      id: String(p._id),
      relatedType: p.relatedType,
      relatedId: String(p.relatedId),
      amount: p.displayAmount ?? p.amount,
      currency: p.displayCurrency || p.currency,
      status: p.status,
      createdAt: p.createdAt,
      approvedAt: p.approvedAt || null,
      // Safe to show: an admin wrote it for the seller. `error` is NOT included —
      // it carries platform-internal detail like our own balance shortfalls.
      rejectedReason: p.rejectedReason || null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export default { getEarningsSummary, listSales, listPayouts, toMajorNet };
