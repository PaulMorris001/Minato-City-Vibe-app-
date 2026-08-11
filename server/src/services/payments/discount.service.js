/**
 * Discount-code validation, reservation, and settlement.
 *
 * Works in MAJOR currency units throughout (like split.js). The lifecycle:
 *   preview  → validity + amounts, no side effects (checkout UI "Apply").
 *   reserve  → at payment init: atomically claims a slot on the code's counter
 *              and writes a "pending" DiscountRedemption keyed by the payment
 *              reference. Reserve-at-init is what stops a "first 20" cap from
 *              overselling under concurrency.
 *   apply    → at payment confirm/webhook: pending → "applied".
 *   release  → the cleanup job frees slots whose payment never completed.
 *
 * One code per order; percent applies to the order subtotal; fixed applies
 * once per order, clamped to the subtotal.
 */

import DiscountCode from "../../models/discountCode.model.js";
import DiscountRedemption from "../../models/discountRedemption.model.js";
import TicketOrder from "../../models/ticketOrder.model.js";

const round2 = (n) => Math.round(n * 100) / 100;

const REASON_MESSAGES = {
  not_found: "That code isn't valid for this event",
  inactive: "This code is no longer active",
  not_started: "This code isn't active yet",
  expired: "This code has expired",
  limit_reached: "This code has reached its redemption limit",
  already_used: "You've already used this code",
  below_minimum: "This code brings the total below the minimum chargeable amount",
};

const fail = (reason) => ({ valid: false, reason, message: REASON_MESSAGES[reason] });

/**
 * Smallest amount the provider will actually charge (major units).
 * Paystack (NGN) ~₦100; Stripe ~$0.50-equivalent. Totals strictly between
 * zero and this are rejected — only exactly-zero takes the free path.
 */
export function minChargeFor(currency) {
  return String(currency || "").toUpperCase() === "NGN" ? 100 : 0.5;
}

/**
 * Apply a code to an order subtotal (major units).
 * @returns {{ discountAmount: number, total: number }}
 */
export function computeDiscount(codeDoc, subtotal) {
  const discountAmount =
    codeDoc.type === "percent"
      ? round2((subtotal * codeDoc.value) / 100)
      : Math.min(codeDoc.value, subtotal);
  const total = round2(Math.max(0, subtotal - discountAmount));
  return { discountAmount, total };
}

/** Usable = both kill switches off, window open, cap not yet reached. */
function isCodeUsable(codeDoc, now) {
  return (
    codeDoc.isActive &&
    !codeDoc.disabledByCreator &&
    (!codeDoc.startsAt || codeDoc.startsAt <= now) &&
    (!codeDoc.endsAt || codeDoc.endsAt >= now) &&
    (codeDoc.maxRedemptions == null || codeDoc.redemptionCount < codeDoc.maxRedemptions)
  );
}

/** Why an unusable code is unusable, most specific first. Null when usable. */
function unusableReason(codeDoc, now) {
  if (!codeDoc.isActive || codeDoc.disabledByCreator) return "inactive";
  if (codeDoc.startsAt && codeDoc.startsAt > now) return "not_started";
  if (codeDoc.endsAt && codeDoc.endsAt < now) return "expired";
  if (codeDoc.maxRedemptions != null && codeDoc.redemptionCount >= codeDoc.maxRedemptions)
    return "limit_reached";
  return null;
}

/**
 * Validate a code against an order without reserving anything.
 * @returns {{ valid: true, codeDoc, discountAmount, total, free } |
 *           { valid: false, reason, message }}
 */
export async function previewDiscount({ eventId, code, userId, subtotal, currency }) {
  const now = new Date();
  const codeDoc = await DiscountCode.findOne({
    event: eventId,
    code: String(code || "").trim().toUpperCase(),
  });
  if (!codeDoc) return fail("not_found");

  const reason = unusableReason(codeDoc, now);
  if (reason) return fail(reason);

  // A pending redemption is this buyer's own in-flight reservation (retry /
  // provider switch) — only a settled one blocks reuse.
  const existing = await DiscountRedemption.findOne({ code: codeDoc._id, user: userId });
  if (existing && existing.status === "applied") return fail("already_used");

  const { discountAmount, total } = computeDiscount(codeDoc, subtotal);
  if (total > 0 && total < minChargeFor(currency)) return fail("below_minimum");

  return { valid: true, codeDoc, discountAmount, total, free: total === 0 };
}

/**
 * Reserve a redemption slot at payment init. Atomically increments the code's
 * counter (guarded by the usable-filter, so a cap can't oversell) and writes a
 * pending DiscountRedemption tied to `reference`. A retry by the same buyer
 * reuses their pending reservation instead of double-counting.
 * @returns {{ ok: true, redemption, codeDoc, discountAmount, total } |
 *           { ok: false, reason, message }}
 */
export async function reserveDiscount({ eventId, code, userId, subtotal, currency, reference }) {
  const now = new Date();
  const codeDoc = await DiscountCode.findOne({
    event: eventId,
    code: String(code || "").trim().toUpperCase(),
  });
  if (!codeDoc) return { ok: false, reason: "not_found", message: REASON_MESSAGES.not_found };

  const reason = unusableReason(codeDoc, now);
  // limit_reached is re-checked atomically below; the other reasons are final.
  if (reason && reason !== "limit_reached") return { ok: false, reason, message: REASON_MESSAGES[reason] };

  const { discountAmount, total } = computeDiscount(codeDoc, subtotal);
  if (total > 0 && total < minChargeFor(currency)) {
    return { ok: false, reason: "below_minimum", message: REASON_MESSAGES.below_minimum };
  }

  // Existing redemption for this buyer?
  const existing = await DiscountRedemption.findOne({ code: codeDoc._id, user: userId });
  if (existing) {
    if (existing.status === "applied") {
      return { ok: false, reason: "already_used", message: REASON_MESSAGES.already_used };
    }
    // Their own pending reservation — refresh it for the new attempt. The slot
    // is already counted, so no second $inc.
    existing.reference = reference;
    existing.amountDiscounted = discountAmount;
    await existing.save();
    return { ok: true, redemption: existing, codeDoc, discountAmount, total };
  }

  // Atomic reserve: filter re-asserts usability so a concurrent claim on the
  // last slot (or an admin toggle) can't slip through between read and write.
  const claimed = await DiscountCode.findOneAndUpdate(
    {
      _id: codeDoc._id,
      isActive: true,
      disabledByCreator: false,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        {
          $or: [
            { maxRedemptions: null },
            { $expr: { $lt: ["$redemptionCount", "$maxRedemptions"] } },
          ],
        },
      ],
    },
    { $inc: { redemptionCount: 1 } },
    { new: true }
  );
  if (!claimed) {
    // Lost the race — re-read for the precise reason.
    const fresh = await DiscountCode.findById(codeDoc._id);
    const freshReason = (fresh && unusableReason(fresh, now)) || "limit_reached";
    return { ok: false, reason: freshReason, message: REASON_MESSAGES[freshReason] };
  }

  try {
    const redemption = await DiscountRedemption.create({
      code: codeDoc._id,
      event: codeDoc.event,
      user: userId,
      reference,
      status: "pending",
      amountDiscounted: discountAmount,
    });
    return { ok: true, redemption, codeDoc: claimed, discountAmount, total };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // Raced ourselves (double-tap on Pay): a redemption for { code, user } was
    // created between our read and create. Give back the slot we just took and
    // reuse theirs.
    await DiscountCode.updateOne({ _id: codeDoc._id }, { $inc: { redemptionCount: -1 } });
    const raced = await DiscountRedemption.findOne({ code: codeDoc._id, user: userId });
    if (!raced) {
      return { ok: false, reason: "limit_reached", message: REASON_MESSAGES.limit_reached };
    }
    if (raced.status === "applied") {
      return { ok: false, reason: "already_used", message: REASON_MESSAGES.already_used };
    }
    raced.reference = reference;
    raced.amountDiscounted = discountAmount;
    await raced.save();
    return { ok: true, redemption: raced, codeDoc: claimed, discountAmount, total };
  }
}

/** Point a reservation at a (new) payment reference, e.g. the Stripe PI id. */
export async function updateRedemptionReference(redemptionId, reference) {
  return DiscountRedemption.findByIdAndUpdate(redemptionId, { reference }, { new: true });
}

/**
 * Settle the reservation for a completed payment: pending → applied.
 * Best-effort and non-throwing — this runs inside confirm/webhook paths that
 * must never fail because of discount bookkeeping. If the cleanup job already
 * released the reservation (a very slow payment), there is no pending doc left
 * and no context to rebuild one from, so we silently accept the rare over-cap.
 */
export async function applyRedemptionByReference(reference) {
  if (!reference) return null;
  try {
    return await DiscountRedemption.findOneAndUpdate(
      { reference, status: "pending" },
      { status: "applied" },
      { new: true }
    );
  } catch (err) {
    console.error(`[discount] applyRedemptionByReference(${reference}) failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Free counter slots held by reservations whose payment never completed.
 * Skips reservations tied to a TicketOrder that is still pending and younger
 * than 24h — the Paystack poll window can legitimately outlast the cutoff.
 * @returns {{ released: number }}
 */
export async function releaseStaleReservations(cutoffMinutes) {
  const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000);
  // updatedAt, not createdAt: a refreshed reservation (payment retry) restarts
  // its clock.
  const stale = await DiscountRedemption.find({
    status: "pending",
    updatedAt: { $lt: cutoff },
  });
  if (stale.length === 0) return { released: 0 };

  const references = stale.map((r) => r.reference).filter(Boolean);
  const youngOrders = references.length
    ? await TicketOrder.find({
        reference: { $in: references },
        status: "pending",
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).select("reference")
    : [];
  const protectedRefs = new Set(youngOrders.map((o) => o.reference));

  let released = 0;
  for (const redemption of stale) {
    if (redemption.reference && protectedRefs.has(redemption.reference)) continue;
    // Conditioned $inc so the counter can never go below zero.
    await DiscountCode.updateOne(
      { _id: redemption.code, redemptionCount: { $gt: 0 } },
      { $inc: { redemptionCount: -1 } }
    );
    await DiscountRedemption.deleteOne({ _id: redemption._id });
    released++;
  }

  return { released };
}
