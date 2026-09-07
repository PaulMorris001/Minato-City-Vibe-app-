/**
 * Payout unit-contract tests.
 *
 * Payout.amount is stored in MAJOR units for every live rail (payout.model.js),
 * but per-sale amounts are denominated in the collection provider's storage
 * units — cents for PayPal and Stripe, major local units for Paystack. So a
 * PayPal-collected sale makes this trip:
 *
 *   settlePaypalPayment.js  major × 100  → stored cents
 *   payoutRelease.job.js    ticketPayoutAmount()  cents ÷ 100  → stored major
 *   payout.service.js       runTransfer()         major as-is  → Payouts API
 *
 * PayPal's API speaks major units, so unlike Stripe it does NOT multiply back at
 * the boundary. That asymmetry is the thing most likely to be "tidied up" by
 * someone later, so both halves are asserted here.
 *
 * Floating point makes any such round trip lossy if done naively
 * (12345 / 100 * 100 === 12344.999999999998). This is the only place in the
 * payout path where an off-by-a-cent reaches real money, so it gets its own
 * test. The functions are re-implemented here rather than imported — importing
 * them would drag in Mongoose models and the provider SDKs.
 *
 * Run:  node src/services/payments/payoutUnits.test.mjs
 */

import assert from "node:assert/strict";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

/** Mirrors ticketPayoutAmount() in jobs/payoutRelease.job.js. */
const toMajor = (totalNet, settlement) =>
  settlement === "paystack" ? totalNet : totalNet / 100;

/** Mirrors the cents conversion in runTransfer()'s stripe branch. */
const toCents = (major) => Math.round(major * 100);

/** Mirrors toPaypalAmount() in config/paypal.js — the PayPal API boundary. */
const toPaypalAmount = (major) => Number(major).toFixed(2);

// Values chosen to hit the awkward cases: sub-cent-rounding neighbours, the
// classic 12345 float trap, and a large sum where drift would compound.
const CENT_AMOUNTS = [
  1, 2, 3, 7, 99, 100, 101, 999, 1234, 12345, 45678, 99999, 100000, 999999, 123456789,
];

console.log("cents → major → cents round trip (stripe/Connect rail):");
check("is lossless for every sampled amount", () => {
  for (const cents of CENT_AMOUNTS) {
    const major = toMajor(cents, "stripe");
    assert.equal(
      toCents(major),
      cents,
      `${cents} cents → ${major} major → ${toCents(major)} cents`
    );
  }
});

check("holds for a null rail (unsupported country) — still cents-denominated", () => {
  // A seller with no rail can still have collected money; the amount must not be
  // silently mis-scaled just because there's nowhere to send it yet.
  for (const cents of CENT_AMOUNTS) {
    assert.equal(toCents(toMajor(cents, null)), cents);
  }
});

check("produces a plausible major value, not a cents value", () => {
  // Guards the direction of the conversion: a $45.00 payout must store 45, not
  // 4500. Storing cents would render "USD 4500" in the admin dashboard and
  // transfer 100× at approval.
  assert.equal(toMajor(4500, "stripe"), 45);
  assert.equal(toMajor(12345, "stripe"), 123.45);
});

console.log("\npaystack rail (already major — must NOT be divided):");
check("passes major local units through untouched", () => {
  assert.equal(toMajor(1500, "paystack"), 1500);
  assert.equal(toMajor(99.5, "paystack"), 99.5);
});

console.log("\npaypal rail (stored cents → major, sent as major):");
check("stored cents divide down to an exact 2dp amount", () => {
  for (const cents of CENT_AMOUNTS) {
    const major = toMajor(cents, "paypal");
    // The string PayPal receives must round-trip back to the stored cents, or
    // the seller is paid a different number from the one the admin approved.
    assert.equal(
      Math.round(Number(toPaypalAmount(major)) * 100),
      cents,
      `${cents} cents → "${toPaypalAmount(major)}"`
    );
  }
});
check("does NOT re-multiply at the boundary the way Stripe does", () => {
  // The asymmetry, pinned. Sending toCents() to the Payouts API would pay 100×.
  assert.equal(toPaypalAmount(toMajor(4500, "paypal")), "45.00");
  assert.notEqual(toPaypalAmount(toMajor(4500, "paypal")), "4500.00");
});
check("renders whole amounts with two decimals, as PayPal requires", () => {
  assert.equal(toPaypalAmount(45), "45.00");
  assert.equal(toPaypalAmount(0.5), "0.50");
  assert.equal(toPaypalAmount(123.456), "123.46");
});

console.log(`\n✅ All ${passed} payout unit-contract checks passed.`);
