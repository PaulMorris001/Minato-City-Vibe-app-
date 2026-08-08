/**
 * Pure-logic tests for payment provider routing.
 *
 * Reflects the current rollout: Paystack is enabled for the launch scope
 * (Nigeria → NGN, collect + settle); everyone else collects via Stripe (USD)
 * into the platform balance. Settlement has exactly two live rails — Paystack
 * for Nigeria, Stripe Connect for the cross-border-payouts footprint (US, UK,
 * EEA, CA, CH) — and sellers outside both have NO rail, which
 * getSettlementProvider reports as `null`.
 *
 * The null case carries the most weight here. The Wise rail used to be the
 * catch-all default, so the long tail *looked* routable while being a dead end
 * in practice. These assertions pin the honest answer in place: several of them
 * exist specifically to fail if someone reintroduces a fallback rail.
 *
 * Run:  node src/services/payments/resolveProvider.test.mjs
 */

import assert from "node:assert/strict";
import {
  getPayoutProvider,
  getSettlementProvider,
  payoutSupported,
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

// Countries with no payout rail at all. Australia and Japan are the traps here:
// developed, English-friendly, obviously "should work" — and not on Stripe's
// cross-border-payouts list.
const UNSUPPORTED = [
  "Ghana",
  "Kenya",
  "South Africa",
  "India",
  "Brazil",
  "Australia",
  "Japan",
  "Singapore",
  "United Arab Emirates",
  "Mexico",
];

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
check("United States / United Kingdom / Germany → stripe", () => {
  assert.equal(getPayoutProvider(user("United States")), "stripe");
  assert.equal(getPayoutProvider(user("United Kingdom")), "stripe");
  assert.equal(getPayoutProvider(user("Germany")), "stripe");
});
check("collection still works where SETTLEMENT has no rail", () => {
  // Collection and settlement are independent decisions: a buyer can always be
  // charged. Only paying the seller out is blocked, which is why the listing
  // gate lives at creation time rather than at checkout.
  for (const c of UNSUPPORTED) {
    assert.equal(getPayoutProvider(user(c)), "stripe", `${c} should still collect via stripe`);
  }
});

console.log("\ngetSettlementProvider (two live rails, null for everyone else):");
check("Nigeria → paystack", () =>
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
  for (const c of [
    "Germany",
    "Norway",
    "Iceland",
    "Switzerland",
    "Canada",
    "Czechia",
    "Czech Republic",
  ]) {
    assert.equal(getSettlementProvider(user(c)), "stripe", `${c} should route to stripe`);
  }
});
check("outside both footprints → null, NOT a fallback rail", () => {
  for (const c of UNSUPPORTED) {
    assert.equal(getSettlementProvider(user(c)), null, `${c} should have no rail`);
  }
});
check("unknown / missing country → null", () => {
  assert.equal(getSettlementProvider({}), null);
  assert.equal(getSettlementProvider(user("")), null);
  assert.equal(getSettlementProvider(user("Wakanda")), null);
  assert.equal(getSettlementProvider(undefined), null);
});
check("settlement ignores leftover Wise fields on old user docs", () => {
  // Docs predating the migration may still carry these. They must not resurrect
  // the dead rail or divert a seller off Connect.
  assert.equal(
    getSettlementProvider(
      user("United States", { wiseRecipientId: "1", wiseOnboardingComplete: true })
    ),
    "stripe"
  );
  assert.equal(
    getSettlementProvider(
      user("Ghana", { wiseRecipientId: "1", wiseOnboardingComplete: true })
    ),
    null
  );
});

console.log("\npayoutSupported (country-level, distinct from onboarding):");
check("true on both live rails", () => {
  assert.equal(payoutSupported(user("Nigeria")), true);
  assert.equal(payoutSupported(user("Germany")), true);
  assert.equal(payoutSupported(user("Canada")), true);
});
check("false outside them", () => {
  for (const c of UNSUPPORTED) {
    assert.equal(payoutSupported(user(c)), false, `${c} should be unsupported`);
  }
  assert.equal(payoutSupported({}), false);
});
check("independent of whether the seller has onboarded", () => {
  // The whole point of the split: supported-but-not-onboarded is fixable by the
  // seller, unsupported is not. The two must never collapse into one flag.
  assert.equal(payoutSupported(user("Germany")), true);
  assert.equal(hasPayoutOnboarding(user("Germany")), false);
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

console.log("\nhasPayoutOnboarding:");
check("Connect vendor needs stripeAccountId + stripeOnboardingComplete", () => {
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
  // It flips false transiently whenever Stripe re-requests KYC; gating on it
  // would revoke a live organizer's ability to sell mid-season.
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
});
check("credentials for the WRONG rail never satisfy the gate", () => {
  // A Nigerian seller with Connect credentials, and a German seller with
  // Paystack ones. Each is checked only against the rail that actually settles
  // them.
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    false
  );
  assert.equal(
    hasPayoutOnboarding(
      user("Germany", { paystackRecipientCode: "RCP_1", paystackOnboardingComplete: true })
    ),
    false
  );
});
check("no rail → never onboarded, whatever credentials are present", () => {
  // Nothing a Ghanaian seller can do makes this true — which is exactly why the
  // UI must show them the country message and not a setup screen.
  assert.equal(hasPayoutOnboarding(user("Ghana")), false);
  assert.equal(
    hasPayoutOnboarding(
      user("Ghana", {
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        paystackRecipientCode: "RCP_1",
        paystackOnboardingComplete: true,
        wiseRecipientId: "1",
        wiseOnboardingComplete: true,
      })
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
check("Connect sellers still price in USD, not their local currency", () => {
  // Returning EUR here would break the currency check in event.controller.js and
  // produce EUR-priced tickets charged as USD.
  assert.equal(currencyForUser(user("Germany")), "USD");
  assert.equal(currencyForUser(user("United States")), "USD");
  assert.equal(currencyForUser({}), "USD");
});

console.log(`\n✅ All ${passed} provider-routing checks passed.`);
