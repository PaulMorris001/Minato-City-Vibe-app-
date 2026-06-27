/**
 * Pure-logic tests for payment provider routing.
 *
 * No DB or network needed — these assert the core decision the whole
 * multi-provider feature hinges on: which provider a seller is routed to, and
 * what currency their items are priced in.
 *
 * Run:  node src/services/payments/resolveProvider.test.mjs
 */

import assert from "node:assert/strict";
import {
  getPayoutProvider,
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

console.log("getPayoutProvider:");
check("Nigeria → flutterwave", () =>
  assert.equal(getPayoutProvider(user("Nigeria")), "flutterwave")
);
check("nigeria (lowercase) → flutterwave", () =>
  assert.equal(getPayoutProvider(user("nigeria")), "flutterwave")
);
check("Ghana / Kenya / South Africa → flutterwave", () => {
  assert.equal(getPayoutProvider(user("Ghana")), "flutterwave");
  assert.equal(getPayoutProvider(user("Kenya")), "flutterwave");
  assert.equal(getPayoutProvider(user("South Africa")), "flutterwave");
});
check("United States → stripe", () =>
  assert.equal(getPayoutProvider(user("United States")), "stripe")
);
check("unknown / empty country → stripe (safe default)", () => {
  assert.equal(getPayoutProvider(user("")), "stripe");
  assert.equal(getPayoutProvider({}), "stripe");
});

console.log("\nhasPayoutOnboarding:");
check("NG vendor needs flutterwaveOnboardingComplete", () => {
  assert.equal(hasPayoutOnboarding(user("Nigeria")), false);
  assert.equal(
    hasPayoutOnboarding(user("Nigeria", { flutterwaveOnboardingComplete: true })),
    true
  );
});
check("NG vendor's Stripe status is irrelevant", () =>
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    false
  )
);
check("US vendor needs both Stripe fields", () => {
  assert.equal(hasPayoutOnboarding(user("United States")), false);
  assert.equal(
    hasPayoutOnboarding(user("United States", { stripeAccountId: "acct_1" })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("United States", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    true
  );
});

console.log("\ncurrencyForUser:");
check("Nigeria → NGN", () => assert.equal(currencyForUser(user("Nigeria")), "NGN"));
check("Ghana → GHS, Kenya → KES, South Africa → ZAR", () => {
  assert.equal(currencyForUser(user("Ghana")), "GHS");
  assert.equal(currencyForUser(user("Kenya")), "KES");
  assert.equal(currencyForUser(user("South Africa")), "ZAR");
});
check("US / unknown → USD", () => {
  assert.equal(currencyForUser(user("United States")), "USD");
  assert.equal(currencyForUser({}), "USD");
});

console.log(`\n✅ All ${passed} provider-routing checks passed.`);
