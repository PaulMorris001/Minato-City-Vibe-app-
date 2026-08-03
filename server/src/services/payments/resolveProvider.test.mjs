/**
 * Pure-logic tests for payment provider routing.
 *
 * Reflects the current rollout: Paystack is enabled for the launch scope
 * (Nigeria → NGN, collect + settle); everyone else collects via Stripe (USD)
 * into the platform balance and settles via either Stripe Connect (US, UK, EEA,
 * CA, CH — when STRIPE_CONNECT_ENABLED is on) or Wise (everyone else, and
 * everyone at all when the flag is off). Countries in the wider Paystack
 * footprint (Ghana, Kenya, …) stay on the Stripe-collected path until they're
 * added to PAYSTACK_LAUNCH_COUNTRIES.
 *
 * The Connect flag is toggled mid-file, which works only because
 * resolveProvider reads it per-call rather than at module load.
 *
 * Run:  node src/services/payments/resolveProvider.test.mjs
 */

import assert from "node:assert/strict";
import {
  getPayoutProvider,
  getSettlementProvider,
  hasPayoutOnboarding,
  connectCountryCode,
  currencyForUser,
} from "./resolveProvider.js";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const user = (country, extra = {}) => ({ location: { country }, ...extra });

// Collection is unaffected by the Connect rail, so pin the flag off for this
// first block and prove it stays that way.
delete process.env.STRIPE_CONNECT_ENABLED;

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

check("Connect countries still collect via stripe with the flag ON", () => {
  process.env.STRIPE_CONNECT_ENABLED = "true";
  assert.equal(getPayoutProvider(user("United States")), "stripe");
  assert.equal(getPayoutProvider(user("Germany")), "stripe");
  assert.equal(getPayoutProvider(user("Canada")), "stripe");
  delete process.env.STRIPE_CONNECT_ENABLED;
});

console.log("\ngetSettlementProvider — Connect flag OFF (the deployed-but-dark state):");
check("Nigeria → paystack", () =>
  assert.equal(getSettlementProvider(user("Nigeria")), "paystack")
);
check("United States / United Kingdom / Germany → wise", () => {
  assert.equal(getSettlementProvider(user("United States")), "wise");
  assert.equal(getSettlementProvider(user("United Kingdom")), "wise");
  assert.equal(getSettlementProvider(user("Germany")), "wise");
});
check("Ghana → wise (outside launch scope)", () =>
  assert.equal(getSettlementProvider(user("Ghana")), "wise")
);
check("unknown/missing country → wise", () =>
  assert.equal(getSettlementProvider({}), "wise")
);

console.log("\ngetSettlementProvider — Connect flag ON:");
process.env.STRIPE_CONNECT_ENABLED = "true";
check("Nigeria still wins → paystack", () =>
  assert.equal(getSettlementProvider(user("Nigeria")), "paystack")
);
check("United States, and its free-text aliases → stripe", () => {
  assert.equal(getSettlementProvider(user("United States")), "stripe");
  assert.equal(getSettlementProvider(user("united states of america")), "stripe");
  assert.equal(getSettlementProvider(user("USA")), "stripe");
  assert.equal(getSettlementProvider(user("us")), "stripe");
});
check("United Kingdom / uk / gb → stripe", () => {
  assert.equal(getSettlementProvider(user("United Kingdom")), "stripe");
  assert.equal(getSettlementProvider(user("uk")), "stripe");
  assert.equal(getSettlementProvider(user("gb")), "stripe");
});
check("EEA + CA + CH → stripe", () => {
  for (const c of ["Germany", "Norway", "Iceland", "Switzerland", "Canada", "Czechia", "Czech Republic"]) {
    assert.equal(getSettlementProvider(user(c)), "stripe", `${c} should route to stripe`);
  }
});
check("outside the footprint stays on wise", () => {
  // Australia is the trap: developed and English-speaking, but NOT on Stripe's
  // cross-border-payouts list.
  for (const c of ["Ghana", "Kenya", "South Africa", "India", "Brazil", "Australia", "Japan"]) {
    assert.equal(getSettlementProvider(user(c)), "wise", `${c} should stay on wise`);
  }
  assert.equal(getSettlementProvider({}), "wise");
});
check("a completed Wise recipient is grandfathered onto wise", () =>
  assert.equal(
    getSettlementProvider(
      user("United States", { wiseRecipientId: "1", wiseOnboardingComplete: true })
    ),
    "wise"
  )
);
check("half-finished Wise onboarding does NOT grandfather", () => {
  assert.equal(
    getSettlementProvider(user("United States", { wiseRecipientId: "1" })),
    "stripe"
  );
  assert.equal(
    getSettlementProvider(user("United States", { wiseOnboardingComplete: true })),
    "stripe"
  );
});

console.log("\nconnectCountryCode (the ISO2 accounts.create opens the account in):");
check("resolves the seller's own country, never a default", () => {
  assert.equal(connectCountryCode(user("United Kingdom")), "GB");
  assert.equal(connectCountryCode(user("Germany")), "DE");
  assert.equal(connectCountryCode(user("United States")), "US");
  assert.equal(connectCountryCode(user("canada")), "CA");
});
check("null outside the footprint — callers must not fall back to US", () => {
  assert.equal(connectCountryCode(user("Nigeria")), null);
  assert.equal(connectCountryCode(user("Australia")), null);
  assert.equal(connectCountryCode({}), null);
});

console.log("\nhasPayoutOnboarding — Connect vendors (flag ON):");
check("needs stripeAccountId + stripeOnboardingComplete", () => {
  assert.equal(hasPayoutOnboarding(user("United States")), false);
  assert.equal(
    hasPayoutOnboarding(user("United States", { stripeAccountId: "acct_1" })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(user("United States", { stripeOnboardingComplete: true })),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("United States", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    true
  );
});
check("stripePayoutsEnabled: false does NOT block onboarding", () =>
  assert.equal(
    hasPayoutOnboarding(
      user("Germany", {
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        stripePayoutsEnabled: false,
      })
    ),
    true
  )
);
check("Wise credentials alone don't satisfy a Connect-routed vendor", () =>
  // Only the *completed* Wise pair grandfathers; a bare recipient id leaves them
  // on Connect, where Wise fields are irrelevant.
  assert.equal(
    hasPayoutOnboarding(user("Germany", { wiseRecipientId: "123" })),
    false
  )
);
check("currencyForUser is unaffected by the Connect rail", () => {
  assert.equal(currencyForUser(user("United States")), "USD");
  assert.equal(currencyForUser(user("Germany")), "USD");
});
delete process.env.STRIPE_CONNECT_ENABLED;

console.log("\nhasPayoutOnboarding (flag OFF):");
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
check("US vendor is Wise-settled while the Connect flag is off", () => {
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
