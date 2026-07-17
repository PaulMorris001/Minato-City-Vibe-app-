/**
 * Pure-logic tests for payment provider routing.
 *
 * Reflects the current rollout: Paystack is enabled for the launch scope
 * (Nigeria → NGN, collect + settle); everyone else collects via Stripe (USD)
 * into the platform balance and settles via Wise. Countries in the wider
 * Paystack footprint (Ghana, Kenya, …) stay on the Stripe+Wise path until
 * they're added to PAYSTACK_LAUNCH_COUNTRIES.
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

console.log("getPayoutProvider (collection — Paystack live for Nigeria):");
check("Nigeria → paystack", () =>
  assert.equal(getPayoutProvider(user("Nigeria")), "paystack")
);
check("ng (ISO code) → paystack", () =>
  assert.equal(getPayoutProvider(user("ng")), "paystack")
);
check("Ghana → stripe (not in launch scope yet)", () =>
  assert.equal(getPayoutProvider(user("Ghana")), "stripe")
);
check("United States → stripe", () =>
  assert.equal(getPayoutProvider(user("United States")), "stripe")
);
check("United Kingdom → stripe", () =>
  assert.equal(getPayoutProvider(user("United Kingdom")), "stripe")
);

console.log("\ngetSettlementProvider (Paystack for Nigeria, Wise for everyone else):");
check("Nigeria → paystack", () =>
  assert.equal(getSettlementProvider(user("Nigeria")), "paystack")
);
check("United States → wise (Stripe Connect is gone)", () =>
  assert.equal(getSettlementProvider(user("United States")), "wise")
);
check("United Kingdom → wise", () =>
  assert.equal(getSettlementProvider(user("United Kingdom")), "wise")
);
check("Ghana → wise (outside launch scope)", () =>
  assert.equal(getSettlementProvider(user("Ghana")), "wise")
);
check("unknown/missing country → wise", () =>
  assert.equal(getSettlementProvider({}), "wise")
);

console.log("\nhasPayoutOnboarding:");
check("Wise vendor needs wiseRecipientId + wiseOnboardingComplete", () => {
  assert.equal(hasPayoutOnboarding(user("United Kingdom")), false);
  assert.equal(
    hasPayoutOnboarding(user("United Kingdom", { wiseOnboardingComplete: true })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("United Kingdom", { wiseRecipientId: "123", wiseOnboardingComplete: true })
    ),
    true
  );
});
check("US vendor is Wise-settled too", () => {
  assert.equal(hasPayoutOnboarding(user("United States")), false);
  assert.equal(
    hasPayoutOnboarding(
      user("United States", { wiseRecipientId: "123", wiseOnboardingComplete: true })
    ),
    true
  );
});
check("Nigerian vendor needs paystackRecipientCode + paystackOnboardingComplete", () => {
  assert.equal(hasPayoutOnboarding(user("Nigeria")), false);
  assert.equal(
    hasPayoutOnboarding(user("Nigeria", { paystackOnboardingComplete: true })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { paystackRecipientCode: "RCP_1", paystackOnboardingComplete: true })
    ),
    true
  );
  // Wise credentials don't satisfy a Paystack-settled vendor.
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { wiseRecipientId: "123", wiseOnboardingComplete: true })
    ),
    false
  );
});

console.log("\ncurrencyForUser (launch scope: Nigeria → NGN, everyone else USD):");
check("Nigeria → NGN", () => assert.equal(currencyForUser(user("Nigeria")), "NGN"));
check("ng (ISO code) → NGN", () => assert.equal(currencyForUser(user("ng")), "NGN"));
check("Ghana / Kenya → USD (not in launch scope yet)", () => {
  assert.equal(currencyForUser(user("Ghana")), "USD");
  assert.equal(currencyForUser(user("Kenya")), "USD");
});
check("US / unknown → USD", () => {
  assert.equal(currencyForUser(user("United States")), "USD");
  assert.equal(currencyForUser({}), "USD");
});

console.log(`\n✅ All ${passed} provider-routing checks passed.`);
