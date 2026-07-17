/**
 * Platform fee split, shared by every collection provider.
 *
 * Works in MAJOR currency units (e.g. 42.50 USD / 1500 NGN) — callers dealing
 * in subunits (Stripe cents, Paystack kobo) convert at their own boundary.
 */

import config from "../../config/env.js";

const PLATFORM_FEE_PERCENT = config.stripe.platformFeePercent;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Split an amount into platform fee + seller net (major currency units).
 * @param {number} amount
 * @returns {{ platformFee: number, sellerNet: number }}
 */
export function computeSplit(amount) {
  const platformFee = round2(amount * (PLATFORM_FEE_PERCENT / 100));
  const sellerNet = round2(amount - platformFee);
  return { platformFee, sellerNet };
}

export default { computeSplit };
