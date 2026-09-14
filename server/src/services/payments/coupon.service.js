/**
 * OurCityVibe coupon balance — awarded from Birthday Raffle wins, spent at
 * checkout against any vendor Order.
 *
 * A "coupon" is a currency-agnostic unit fixed at 1 coupon = $1 USD =
 * ₦1,500 NGN. This fixed rate is a promotional-value decision, not a live FX
 * rate — it never moves, so a winner's award and a spender's redemption both
 * always agree on what a coupon is worth regardless of when either happens.
 *
 * Spending model: the coupon only ever offsets what the BUYER pays — the
 * vendor is paid in full as if the order were paid in cash (see
 * payments.controller.js's fee-basis handling for the "order" type). The
 * platform absorbs the coupon-covered portion; this is a marketing cost, not
 * something a vendor should ever be shorted for.
 *
 * Reservation, not a bare decrement, so two concurrent checkouts of the same
 * user's own balance can't both succeed against coupons that only exist once:
 * `reserveOrderCoupon` atomically decrements at payment init, and either
 * `refundOrderCoupon` (order cancelled/declined) or nothing further (order
 * paid — the reservation IS the spend) settles it. A reservation left on an
 * order that's never paid or cancelled is swept back by
 * jobs/couponReservation.job.js.
 */

import { Order } from "../../models/order.model.js";
import User from "../../models/user.model.js";

/** ₦ per coupon unit. The one number that defines the whole system. */
export const COUPON_NGN_PER_UNIT = 1500;

/** Whether `currency` is one this module knows how to convert. Both of the
 *  app's launch-scope selling currencies are — see currencyForUser. */
function isKnownCurrency(currency) {
  return currency === "NGN" || currency === "USD";
}

/** Coupon units -> major currency units of `currency`. */
export function couponUnitsToAmount(units, currency) {
  return currency === "NGN" ? units * COUPON_NGN_PER_UNIT : units;
}

/** Major currency units of `currency` -> coupon units. */
export function amountToCouponUnits(amount, currency) {
  return currency === "NGN" ? amount / COUPON_NGN_PER_UNIT : amount;
}

/**
 * Atomically reserve up to `amount` (major units of `currency`) worth of the
 * buyer's coupon balance against one order, at payment init.
 *
 * Idempotent per order: if this order already has a reservation (a retried
 * init after the client re-requested the same order), that same reservation
 * is returned rather than compounding a second one on top of it.
 *
 * @returns {Promise<{ applied: number, units: number }>} `applied` is in
 *   `currency`'s major units, capped at `amount`; both are 0 when the user
 *   has no balance, the currency isn't one this module converts, or amount
 *   is not positive.
 */
export async function reserveOrderCoupon({ order, userId, amount, currency }) {
  if (!isKnownCurrency(currency) || !(amount > 0)) return { applied: 0, units: 0 };

  // Retried init on the same order (e.g. the client re-opened checkout after
  // a dropped connection) — the reservation already exists, don't take a
  // second bite out of the balance.
  if (order.couponUnitsUsed > 0) {
    return { applied: order.couponApplied, units: order.couponUnitsUsed };
  }

  const user = await User.findById(userId).select("couponBalance");
  const balanceUnits = user?.couponBalance || 0;
  if (balanceUnits <= 0) return { applied: 0, units: 0 };

  const balanceInCurrency = couponUnitsToAmount(balanceUnits, currency);
  const applied = Math.min(balanceInCurrency, amount);
  const units = amountToCouponUnits(applied, currency);
  if (!(units > 0)) return { applied: 0, units: 0 };

  // Conditional on the balance still covering `units` — the guard against two
  // concurrent reservations (this order and some other one) both succeeding
  // against a balance that can only cover one of them.
  const updated = await User.findOneAndUpdate(
    { _id: userId, couponBalance: { $gte: units } },
    { $inc: { couponBalance: -units } }
  );
  if (!updated) return { applied: 0, units: 0 };

  order.couponUnitsUsed = units;
  order.couponApplied = applied;
  await order.save();

  return { applied, units };
}

/**
 * Give back a reserved-but-unspent coupon amount — the order it was reserved
 * against was cancelled, declined, or went stale before payment. Idempotent:
 * a second call on an order with nothing left reserved is a no-op.
 */
export async function refundOrderCoupon(order) {
  if (!order.couponUnitsUsed) return;
  await User.updateOne(
    { _id: order.client },
    { $inc: { couponBalance: order.couponUnitsUsed } }
  );
  order.couponUnitsUsed = 0;
  order.couponApplied = 0;
  await order.save();
}

/**
 * Credit a raffle winner's coupon balance. `deltaUnits` may be negative — used
 * when an admin corrects a winner pick and the previous rank's coupon award
 * must be reversed before the new one is applied (see admin.controller.js's
 * setRaffleWinner). The balance never goes below 0 even if a correction's
 * reversal exceeds what the winner has left (e.g. they already spent some).
 */
export async function adjustCouponBalance(userId, deltaUnits) {
  if (!deltaUnits) return;
  const user = await User.findById(userId).select("couponBalance");
  if (!user) return;
  user.couponBalance = Math.max(0, (user.couponBalance || 0) + deltaUnits);
  await user.save();
}

/**
 * Release stale coupon reservations — orders that reserved a buyer's coupon
 * balance at payment init but were never paid, cancelled, or declined (the
 * buyer just abandoned checkout). Mirrors discount.service.js's
 * releaseStaleReservations for the exact same reason: a decrement made at
 * init has to come back to the buyer if the purchase it was held for never
 * happens, or their balance quietly shrinks every time they back out of a
 * checkout.
 */
export async function releaseStaleCouponReservations(staleAfterMinutes) {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);
  const stale = await Order.find({
    couponUnitsUsed: { $gt: 0 },
    paymentStatus: { $ne: "paid" },
    updatedAt: { $lt: cutoff },
  });
  for (const order of stale) {
    await refundOrderCoupon(order);
  }
  return { released: stale.length };
}
