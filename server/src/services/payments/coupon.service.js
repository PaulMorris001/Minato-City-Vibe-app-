/**
 * OurCityVibe credit balances (user-facing name for what this module calls a
 * "coupon" internally) — awarded from Birthday Raffle wins, spent at checkout
 * against any vendor Order.
 *
 * 1 coupon = 1 unit of its OWN currency: ₦1 in Nigeria, $1 everywhere else.
 * There is no exchange rate between the two — a coupon is only ever earned
 * and spent in the same currency, so a user holds two independent balances
 * (`couponBalanceNGN`, `couponBalanceUSD` on User) rather than one converted
 * total. An order reserves against whichever balance matches its own
 * `currency`; there's nothing to convert.
 *
 * Vendor lock: a balance is also only spendable at the vendor it was awarded
 * for (`couponVendorNGN`/`couponVendorUSD` on User, set from the winning
 * campaign's `vendorNGN`/`vendorUSD` — see raffleCampaign.model.js and
 * `setCouponVendorLock` below). A null lock means "any vendor", the case for
 * a campaign that assigned none. One lock per currency, not a per-award
 * ledger: winning a later campaign with a different vendor overwrites the
 * lock, even over leftover balance from an earlier win — a deliberate
 * simplification for a rare edge case, not an oversight.
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
 *
 * Expiry: a balance untouched for `COUPON_EXPIRY_DAYS` is swept to 0 by
 * jobs/couponExpiration.job.js (`expireStaleCoupons` below). Every function
 * here that changes a balance also stamps its matching `*UpdatedAt` field in
 * the SAME write, so the two can never drift — a balance is never "old" by
 * one measure and "fresh" by the other.
 *
 * Ledger: every balance change here also writes a CouponTransaction row —
 * the read side for the "history" list on mobile/app/wallet-rewards.tsx. The
 * ledger is append-only and never the source of truth for the current
 * balance; it just explains how it got there.
 */

import { Order } from "../../models/order.model.js";
import User from "../../models/user.model.js";
import CouponTransaction from "../../models/couponTransaction.model.js";

/** How long a balance can sit untouched before jobs/couponExpiration.job.js
 *  sweeps it to 0. */
export const COUPON_EXPIRY_DAYS = 30;

/** Which User balance field holds `currency`'s coupons. Both of the app's
 *  launch-scope selling currencies have one — see currencyForUser. Any other
 *  currency has no coupon balance at all (isKnownCurrency below). */
function balanceField(currency) {
  return currency === "NGN" ? "couponBalanceNGN" : "couponBalanceUSD";
}

/** The `*UpdatedAt` field paired with `balanceField(currency)` — always
 *  written alongside it so the expiry clock reflects the balance's true last
 *  activity. */
function updatedAtField(currency) {
  return currency === "NGN" ? "couponBalanceNGNUpdatedAt" : "couponBalanceUSDUpdatedAt";
}

/** The vendor-lock field paired with `balanceField(currency)` — which vendor
 *  that balance is redeemable at, or null for "any vendor". */
function vendorField(currency) {
  return currency === "NGN" ? "couponVendorNGN" : "couponVendorUSD";
}

function isKnownCurrency(currency) {
  return currency === "NGN" || currency === "USD";
}

/** Write one ledger row. Never lets a logging failure roll back the balance
 *  change it's describing — the balance is the thing that actually matters;
 *  a missing history row is a cosmetic gap, not a money bug. */
async function logTransaction({ user, type, amount, currency, description, order }) {
  if (!(amount > 0)) return;
  try {
    await CouponTransaction.create({ user, type, amount, currency, description, order });
  } catch (err) {
    console.error("[coupon.service] Failed to log transaction:", err?.message ?? err);
  }
}

/**
 * Atomically reserve up to `amount` (major units of `currency`) worth of the
 * buyer's same-currency coupon balance against one order, at payment init.
 *
 * Idempotent per order: if this order already has a reservation (a retried
 * init after the client re-requested the same order), that same reservation
 * is returned rather than compounding a second one on top of it.
 *
 * @returns {Promise<{ applied: number }>} `applied` is in `currency`'s major
 *   units, capped at `amount`; 0 when the user has no balance in that
 *   currency, the balance is locked to a different vendor than this order's,
 *   `currency` isn't one this module knows, or amount isn't positive.
 */
export async function reserveOrderCoupon({ order, userId, amount, currency }) {
  if (!isKnownCurrency(currency) || !(amount > 0)) return { applied: 0 };

  // Retried init on the same order (e.g. the client re-opened checkout after
  // a dropped connection) — the reservation already exists, don't take a
  // second bite out of the balance.
  if (order.couponApplied > 0) {
    return { applied: order.couponApplied };
  }

  const field = balanceField(currency);
  const lockField = vendorField(currency);
  const user = await User.findById(userId).select(`${field} ${lockField}`);
  const balance = user?.[field] || 0;
  if (balance <= 0) return { applied: 0 };

  // A locked balance is spendable ONLY at the vendor it was awarded for; a
  // null lock (no vendor assigned on that win's campaign) means any vendor.
  const lockedVendor = user?.[lockField];
  if (lockedVendor && String(lockedVendor) !== String(order.vendor)) {
    return { applied: 0 };
  }

  const applied = Math.min(balance, amount);
  if (!(applied > 0)) return { applied: 0 };

  // Conditional on the balance still covering `applied` — the guard against
  // two concurrent reservations (this order and some other one) both
  // succeeding against a balance that can only cover one of them. Spending is
  // itself a "use", so this resets the expiry clock same as an award would.
  const updated = await User.findOneAndUpdate(
    { _id: userId, [field]: { $gte: applied } },
    { $inc: { [field]: -applied }, $set: { [updatedAtField(currency)]: new Date() } }
  );
  if (!updated) return { applied: 0 };

  order.couponApplied = applied;
  await order.save();

  await logTransaction({
    user: userId,
    type: "spent",
    amount: applied,
    currency,
    description: "Order payment",
    order: order._id,
  });

  return { applied };
}

/**
 * Give back a reserved-but-unspent coupon amount — the order it was reserved
 * against was cancelled, declined, or went stale before payment. Idempotent:
 * a second call on an order with nothing left reserved is a no-op.
 *
 * Credits back to the balance for the order's OWN currency — a coupon is
 * always reserved and refunded in the same currency, never converted.
 */
export async function refundOrderCoupon(order) {
  if (!order.couponApplied) return;
  const field = balanceField(order.currency);
  const refundedAmount = order.couponApplied;
  await User.updateOne(
    { _id: order.client },
    { $inc: { [field]: refundedAmount }, $set: { [updatedAtField(order.currency)]: new Date() } }
  );
  order.couponApplied = 0;
  await order.save();

  await logTransaction({
    user: order.client,
    type: "refunded",
    amount: refundedAmount,
    currency: order.currency,
    description: "Order cancelled — credit refunded",
    order: order._id,
  });
}

/**
 * Credit (or debit) a user's coupon balance in `currency` by `deltaAmount`,
 * logging why. `deltaAmount` may be negative — used when an admin corrects a
 * winner pick and the previous rank's coupon award must be reversed before
 * the new one is applied (see admin.controller.js's setRaffleWinner /
 * reconcileCampaignPrizeEdit). The balance never goes below 0 even if a
 * correction's reversal exceeds what the winner has left (e.g. they already
 * spent some) — the ledger row still records the FULL amount removed, since
 * that's what actually happened to their balance up to the floor.
 */
export async function adjustCouponBalance(userId, currency, deltaAmount, description = "Balance adjustment") {
  if (!deltaAmount || !isKnownCurrency(currency)) return;
  const field = balanceField(currency);
  const user = await User.findById(userId).select(field);
  if (!user) return;

  const before = user[field] || 0;
  user[field] = Math.max(0, before + deltaAmount);
  user[updatedAtField(currency)] = new Date();
  await user.save();

  const actualChange = user[field] - before;
  if (actualChange === 0) return;

  await logTransaction({
    user: userId,
    type: actualChange > 0 ? "earned" : "adjusted",
    amount: Math.abs(actualChange),
    currency,
    description,
  });
}

/**
 * Point a user's `currency` balance at `vendorId` — the vendor their credit
 * is redeemable at from now on. Called from admin.controller.js's
 * reconcileWinnerCoupon whenever a winner still holds a rank, so the lock
 * always reflects the campaign's CURRENT vendor assignment for their
 * currency — both a rank change and an admin reassigning the vendor flow
 * through here the same way. A no-op if `vendorId` is falsy: a campaign with
 * no vendor assigned leaves any EXISTING lock alone rather than clearing it,
 * since "no vendor on this tier" isn't the same claim as "spendable
 * anywhere".
 */
export async function setCouponVendorLock(userId, currency, vendorId) {
  if (!isKnownCurrency(currency) || !vendorId) return;
  const field = vendorField(currency);
  await User.updateOne({ _id: userId }, { $set: { [field]: vendorId } });
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
    couponApplied: { $gt: 0 },
    paymentStatus: { $ne: "paid" },
    updatedAt: { $lt: cutoff },
  });
  for (const order of stale) {
    await refundOrderCoupon(order);
  }
  return { released: stale.length };
}

/**
 * Expire balances that have sat untouched for `days` (default
 * COUPON_EXPIRY_DAYS) — a winner who never spent their credit, or spent only
 * part of it and then went quiet. Run periodically by
 * jobs/couponExpiration.job.js, not on-demand: expiry is a background
 * housekeeping concern, not something a request path should ever block on or
 * enforce ad hoc.
 *
 * `*UpdatedAt` gates the query so a balance with no timestamp yet (never
 * touched by the code above) is left alone rather than expired on sight —
 * only a balance this module has actually stamped can be "stale".
 *
 * Loops rather than `updateMany` on purpose: logging what expired needs each
 * user's balance BEFORE it's cleared, which a bulk update can't hand back.
 * Expiry is rare and low-volume, so the extra round trips cost nothing that
 * matters.
 */
export async function expireStaleCoupons(days = COUPON_EXPIRY_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = new Date();

  async function expireCurrency(currency) {
    const field = balanceField(currency);
    const users = await User.find({
      [field]: { $gt: 0 },
      [updatedAtField(currency)]: { $ne: null, $lt: cutoff },
    }).select(field);

    for (const user of users) {
      const amount = user[field] || 0;
      user[field] = 0;
      user[updatedAtField(currency)] = now;
      await user.save();
      await logTransaction({
        user: user._id,
        type: "expired",
        amount,
        currency,
        description: `Unused credit expired after ${days} days`,
      });
    }
    return users.length;
  }

  const expiredNGN = await expireCurrency("NGN");
  const expiredUSD = await expireCurrency("USD");

  return { expiredNGN, expiredUSD };
}
