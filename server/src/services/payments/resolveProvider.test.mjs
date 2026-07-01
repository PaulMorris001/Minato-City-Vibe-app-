/**
 * Pure-logic tests for payment provider routing.
 *
 * Reflects the current Wise-first config: Flutterwave is disabled
 * (FLUTTERWAVE_ENABLED = false in resolveProvider.js), so everyone collects via
 * Stripe (USD), US settles via Stripe Connect, and everyone else settles via
 * Wise. When Flutterwave is re-enabled, update these expectations.
 *
 * Run:  node src/services/payments/resolveProvider.test.mjs
 */

import assert from "node:assert/strict";
import {
  getPayoutProvider,
  getSettlementProvider,
  hasPayoutOnboarding,
  currencyForUser,
} from "./resolveProvider.js";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const user = (country, extra = {}) => ({ location: { country }, ...extra });

console.log("getPayoutProvider (collection — Flutterwave hidden → everyone via Stripe):");
check("Nigeria → stripe", () => assert.equal(getPayoutProvider(user("Nigeria")), "stripe"));
check("United States → stripe", () =>
  assert.equal(getPayoutProvider(user("United States")), "stripe")
);
check("United Kingdom → stripe", () =>
  assert.equal(getPayoutProvider(user("United Kingdom")), "stripe")
);

console.log("\ngetSettlementProvider (Wise disabled — no WISE_API_TOKEN):");
check("United States → stripe", () =>
  assert.equal(getSettlementProvider(user("United States")), "stripe")
);
check("Nigeria → stripe fallback (Wise off, Flutterwave hidden)", () =>
  assert.equal(getSettlementProvider(user("Nigeria")), "stripe")
);
check("United Kingdom → stripe fallback when Wise off", () =>
  assert.equal(getSettlementProvider(user("United Kingdom")), "stripe")
);

console.log("\ngetSettlementProvider (Wise enabled):");
check("non-US vendors → wise (incl. Nigeria, now that Flutterwave is hidden)", () => {
  process.env.WISE_API_TOKEN = "test-token";
  delete process.env.WISE_COUNTRIES;
  assert.equal(getSettlementProvider(user("United Kingdom")), "wise");
  assert.equal(getSettlementProvider(user("Nigeria")), "wise");
  assert.equal(getSettlementProvider(user("United States")), "stripe"); // US still Stripe
  delete process.env.WISE_API_TOKEN;
});
check("allowlist (WISE_COUNTRIES) restricts Wise routing", () => {
  process.env.WISE_API_TOKEN = "test-token";
  process.env.WISE_COUNTRIES = "germany,france";
  assert.equal(getSettlementProvider(user("Germany")), "wise");
  assert.equal(getSettlementProvider(user("United Kingdom")), "stripe"); // not on allowlist
  delete process.env.WISE_API_TOKEN;
  delete process.env.WISE_COUNTRIES;
});

console.log("\nhasPayoutOnboarding:");
check("Wise vendor needs wiseRecipientId + wiseOnboardingComplete", () => {
  process.env.WISE_API_TOKEN = "test-token";
  assert.equal(hasPayoutOnboarding(user("United Kingdom")), false);
  assert.equal(
    hasPayoutOnboarding(
      user("United Kingdom", { wiseRecipientId: "123", wiseOnboardingComplete: true })
    ),
    true
  );
  // Nigeria now routes to Wise too, so its Flutterwave status is irrelevant.
  assert.equal(
    hasPayoutOnboarding(user("Nigeria", { flutterwaveOnboardingComplete: true })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { wiseRecipientId: "123", wiseOnboardingComplete: true })
    ),
    true
  );
  delete process.env.WISE_API_TOKEN;
});
check("US vendor needs both Stripe fields", () => {
  assert.equal(hasPayoutOnboarding(user("United States")), false);
  assert.equal(
    hasPayoutOnboarding(
      user("United States", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    true
  );
});

console.log("\ncurrencyForUser (Flutterwave hidden → USD across the board):");
check("Nigeria → USD", () => assert.equal(currencyForUser(user("Nigeria")), "USD"));
check("Ghana / Kenya → USD", () => {
  assert.equal(currencyForUser(user("Ghana")), "USD");
  assert.equal(currencyForUser(user("Kenya")), "USD");
});
check("US / unknown → USD", () => {
  assert.equal(currencyForUser(user("United States")), "USD");
  assert.equal(currencyForUser({}), "USD");
});

console.log(`\n✅ All ${passed} provider-routing checks passed.`);
