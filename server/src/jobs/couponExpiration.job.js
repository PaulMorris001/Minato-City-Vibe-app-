import { expireStaleCoupons, COUPON_EXPIRY_DAYS } from "../services/payments/coupon.service.js";

/**
 * How often to sweep for expired credit balances. A 30-day expiry window
 * doesn't need minute-level precision — a few hours' slack either side is
 * invisible to the user — so this runs far less often than the reservation
 * sweeps, just often enough that a balance never sits expired-but-uncleared
 * for more than about a day.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function sweepExpiredCoupons() {
  try {
    const { expiredNGN, expiredUSD } = await expireStaleCoupons(COUPON_EXPIRY_DAYS);
    if (expiredNGN > 0 || expiredUSD > 0) {
      console.log(
        `[CouponExpiration] Expired ${expiredNGN} NGN + ${expiredUSD} USD balance(s) unused for ${COUPON_EXPIRY_DAYS}+ days`
      );
    }
  } catch (err) {
    console.error("[CouponExpiration] Sweep failed:", err?.message ?? err);
  }
}

export function startCouponExpirationJob() {
  // Run once on startup so a restart doesn't delay a batch that was already
  // due, then sweep every 6 hours.
  sweepExpiredCoupons();
  setInterval(sweepExpiredCoupons, SWEEP_INTERVAL_MS);
  console.log(`[CouponExpiration] Job started — expiring balances unused for ${COUPON_EXPIRY_DAYS}+ days, checked every 6 hours`);
}
