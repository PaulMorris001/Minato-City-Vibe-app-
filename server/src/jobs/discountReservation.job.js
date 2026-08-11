import { releaseStaleReservations } from "../services/payments/discount.service.js";

/** How old a pending reservation must be before its slot is freed. */
const STALE_AFTER_MINUTES = 30;

/** How often to sweep. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

async function sweepStaleReservations() {
  try {
    const { released } = await releaseStaleReservations(STALE_AFTER_MINUTES);
    if (released > 0) {
      console.log(`[DiscountReservation] Released ${released} stale reservation(s)`);
    }
  } catch (err) {
    console.error("[DiscountReservation] Sweep failed:", err?.message ?? err);
  }
}

export function startDiscountReservationJob() {
  // Run once on startup to clear anything left over from a restart, then sweep
  // every 15 minutes.
  sweepStaleReservations();
  setInterval(sweepStaleReservations, SWEEP_INTERVAL_MS);
  console.log("[DiscountReservation] Job started — sweeping every 15 minutes");
}
