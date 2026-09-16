import { releaseStaleCouponReservations } from "../services/payments/coupon.service.js";

/**
 * How old a pending coupon reservation must be before it's given back to the
 * buyer. Mirrors discountReservation.job.js's own 30 minutes for the same
 * reason: a reservation taken at payment init has to come back if the
 * purchase it was held for never happens (abandoned checkout, a payment that
 * never confirms), or a buyer's balance quietly shrinks every time they back
 * out of paying for something.
 */
const STALE_AFTER_MINUTES = 30;

/** How often to sweep. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

async function sweepStaleReservations() {
  try {
    const { released } = await releaseStaleCouponReservations(STALE_AFTER_MINUTES);
    if (released > 0) {
      console.log(`[CouponReservation] Released ${released} stale reservation(s)`);
    }
  } catch (err) {
    console.error("[CouponReservation] Sweep failed:", err?.message ?? err);
  }
}

export function startCouponReservationJob() {
  // Run once on startup to clear anything left over from a restart, then sweep
  // every 15 minutes.
  sweepStaleReservations();
  setInterval(sweepStaleReservations, SWEEP_INTERVAL_MS);
  console.log("[CouponReservation] Job started — sweeping every 15 minutes");
}
