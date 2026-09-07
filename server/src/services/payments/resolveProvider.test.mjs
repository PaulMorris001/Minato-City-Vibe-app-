/**
 * Pure-logic tests for payment provider routing.
 *
 * Current rollout: Paystack for the launch scope (Nigeria → NGN, collect +
 * settle), Stripe for everyone else, with Stripe Connect settling inside its
 * cross-border-payouts footprint (US, UK, EEA, CA, CH) and `null` everywhere
 * else. PayPal is built but OFF, waiting on live credentials.
 *
 * Two things carry the most weight here.
 *
 * The null case: Wise used to be a catch-all default, so the long tail *looked*
 * routable while being a dead end. Several assertions exist specifically to fail
 * if someone reintroduces a fallback rail.
 *
 * The flag: the first block pins "PayPal off behaves exactly as it did before
 * PayPal existed", which is what protects production today. The last block
 * re-imports the module with the flag on and pins what happens when it is
 * eventually thrown — including that a seller already settled by Connect is not
 * moved, because moving them would block their paid listings.
 *
 * Run:  node src/services/payments/resolveProvider.test.mjs
 */

import assert from "node:assert/strict";
import {
  getPayoutProvider,
  getSettlementProvider,
  payoutSupported,
  payoutCountryKnown,
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

// Countries with no payout rail while PayPal is off. Australia and Japan are the
// traps: developed, English-friendly, obviously "should work", and not on
// Stripe's cross-border-payouts list.
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
check("Ghana → stripe (not in Paystack launch scope)", () =>
  assert.equal(getPayoutProvider(user("Ghana")), "stripe")
);
check("United States / United Kingdom / Germany → stripe", () => {
  assert.equal(getPayoutProvider(user("United States")), "stripe");
  assert.equal(getPayoutProvider(user("United Kingdom")), "stripe");
  assert.equal(getPayoutProvider(user("Germany")), "stripe");
});
check("collection still works where SETTLEMENT has no rail", () => {
  // Collection and settlement are independent: a buyer can always be charged.
  // Only paying the seller out is blocked, which is why the listing gate lives
  // at creation time rather than at checkout.
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
  for (const c of ["Germany", "Norway", "Iceland", "Switzerland", "Canada", "Czechia"]) {
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
check("PayPal fields on a user do NOT activate the disabled rail", () => {
  // The gate is the env flag, not the presence of seller data. A user who
  // somehow has a PayPal address must still route by the live rails.
  assert.equal(
    getSettlementProvider(
      user("Kenya", { paypalPayoutEmail: "s@example.com", paypalOnboardingComplete: true })
    ),
    null
  );
  assert.equal(getPayoutProvider(user("Kenya", { paypalPayoutEmail: "s@example.com" })), "stripe");
});
check("settlement ignores leftover Wise fields on old user docs", () => {
  assert.equal(
    getSettlementProvider(
      user("United States", { wiseRecipientId: "1", wiseOnboardingComplete: true })
    ),
    "stripe"
  );
  assert.equal(
    getSettlementProvider(user("Ghana", { wiseRecipientId: "1", wiseOnboardingComplete: true })),
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
  assert.equal(payoutSupported(user("Germany")), true);
  assert.equal(hasPayoutOnboarding(user("Germany")), false);
});

console.log("\npayoutCountryKnown (unknown country ≠ unsupported country):");
check("false when the account has no country", () => {
  // The common case, not an edge one: social sign-in collects no location, so
  // most accounts arrive here. Reporting these as "unsupported" told sellers in
  // Lagos and Houston alike that payouts would never reach them.
  assert.equal(payoutCountryKnown({}), false);
  assert.equal(payoutCountryKnown({ location: {} }), false);
  assert.equal(payoutCountryKnown(user("")), false);
  assert.equal(payoutCountryKnown(user("   ")), false);
});
check("true whenever a country is set, supported or not", () => {
  assert.equal(payoutCountryKnown(user("Nigeria")), true);
  assert.equal(payoutCountryKnown(user("Japan")), true);
});
check("splits the two false cases of payoutSupported apart", () => {
  const unknown = {};
  const unsupported = user("Japan");
  assert.equal(payoutSupported(unknown), false);
  assert.equal(payoutSupported(unsupported), false);
  assert.equal(payoutCountryKnown(unknown), false);
  assert.equal(payoutCountryKnown(unsupported), true);
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
  assert.equal(hasPayoutOnboarding(user("United States", { stripeAccountId: "acct_1" })), false);
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
  assert.equal(hasPayoutOnboarding(user("Nigeria", { paystackOnboardingComplete: true })), false);
  assert.equal(
    hasPayoutOnboarding(
      user("Nigeria", { paystackRecipientCode: "RCP_1", paystackOnboardingComplete: true })
    ),
    true
  );
});
check("credentials for the WRONG rail never satisfy the gate", () => {
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
  assert.equal(hasPayoutOnboarding(user("Ghana")), false);
  assert.equal(
    hasPayoutOnboarding(
      user("Ghana", {
        stripeAccountId: "acct_1",
        stripeOnboardingComplete: true,
        paystackRecipientCode: "RCP_1",
        paystackOnboardingComplete: true,
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

// ── The flag, thrown ─────────────────────────────────────────────────────────
// The module reads its knobs once at load, so this re-imports it under a fresh
// specifier with the env set. Everything above proves the OFF contract; this
// proves what changes, and what deliberately does not, when PayPal goes live.

console.log("\nPAYPAL_ENABLED=true (what happens when the switch is thrown):");
process.env.PAYPAL_ENABLED = "true";
process.env.PAYPAL_CLIENT_ID = "test-client-id";
process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
const live = await import("./resolveProvider.js?paypal-enabled");

check("collection moves to paypal outside Nigeria", () => {
  assert.equal(live.getPayoutProvider(user("United States")), "paypal");
  assert.equal(live.getPayoutProvider(user("Nigeria")), "paystack");
});
check("countries Connect could never reach finally get a rail", () => {
  for (const c of ["Ghana", "Kenya", "India", "Brazil", "Japan"]) {
    assert.equal(live.getSettlementProvider(user(c)), "paypal", `${c} should gain a rail`);
  }
});
check("a seller already finished on Connect is NOT moved", () => {
  // The migration hazard in one assertion. Flipping them to PayPal would report
  // them un-onboarded and block their paid listings until they added an address.
  assert.equal(
    live.getSettlementProvider(user("Germany", { stripeOnboardingComplete: true })),
    "stripe"
  );
  assert.equal(
    live.hasPayoutOnboarding(
      user("Germany", { stripeAccountId: "acct_1", stripeOnboardingComplete: true })
    ),
    true
  );
});
check("a seller NOT on Connect moves to paypal", () => {
  assert.equal(live.getSettlementProvider(user("Germany")), "paypal");
});
check("PayPal's own exclusions still get null", () => {
  for (const c of ["Turkey", "Pakistan", "Iran", "North Korea"]) {
    assert.equal(live.getSettlementProvider(user(c)), null, `${c} should have no rail`);
  }
});
check("unknown country still null, never 'supported by default'", () => {
  // The exclusion-list shape makes this the easy mistake: "" is not in the
  // unsupported set, so a naive check would promise a payout we cannot make.
  assert.equal(live.getSettlementProvider({}), null);
  assert.equal(live.getSettlementProvider(user("   ")), null);
});
// Imported out here because `check` runs its callback synchronously; an async
// callback would resolve after the assertions were reported.
process.env.PAYPAL_CLIENT_SECRET = "";
const halfConfigured = await import("./resolveProvider.js?paypal-halfconfigured");
process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";

check("the flag alone is not enough — credentials must exist too", () => {
  // Setting the flag on an environment with no keys would route real buyers to a
  // rail that cannot create an order. The switch cannot be thrown early.
  assert.equal(halfConfigured.getPayoutProvider(user("United States")), "stripe");
  assert.equal(halfConfigured.getSettlementProvider(user("Kenya")), null);
});

console.log(`\n✅ All ${passed} provider-routing checks passed.`);
