/**
 * Payout unit-contract tests.
 *
 * Payout.amount is stored in MAJOR units for every live rail (payout.model.js),
 * but collection is denominated in the collection provider's units — cents for
 * Stripe. So a Stripe-collected sale makes a cents → major → cents round trip:
 *
 *   payoutRelease.job.js  ticketPayoutAmount()  cents ÷ 100  → stored major
 *   payout.service.js     runTransfer()         major × 100  → Transfers API
 *
 * Floating point makes that round trip lossy if either side is done naively
 * (12345 / 100 * 100 === 12344.999999999998). This is the only place in the
 * payout path where an off-by-a-cent reaches real money, so it gets its own
 * test. The two functions are re-implemented here rather than imported —
 * importing either would drag in Mongoose models and the Stripe SDK.
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

check("holds for the wise rail too (same conversion)", () => {
  for (const cents of CENT_AMOUNTS) {
    assert.equal(toCents(toMajor(cents, "wise")), cents);
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

console.log(`\n✅ All ${passed} payout unit-contract checks passed.`);
