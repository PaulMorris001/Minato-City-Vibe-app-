/**
 * Payment provider routing.
 *
 * Two distinct decisions:
 *  - COLLECTION provider (`getPayoutProvider`): how we charge the buyer. Stripe
 *    (card, USD, into the PLATFORM balance) or Paystack (NGN local methods).
 *  - SETTLEMENT provider (`getSettlementProvider`): how the seller's net is
 *    paid out once an admin approves. Wise for every Stripe-collected seller
 *    (Wise is payout-only: those sellers COLLECT via Stripe but SETTLE via
 *    Wise), Paystack transfers for Nigerian sellers.
 *
 * This module reads its rollout knob straight from process.env (rather than
 * importing the validated config) so it stays free of env-validation side
 * effects and its unit test needs no setup.
 */

// ── Paystack rollout ─────────────────────────────────────────────────────────
// Local-currency selling runs on Paystack. Launch scope is Nigeria only
// (USD + NGN): Nigerian sellers price and collect in NGN and are settled by
// Paystack transfers; everyone else is on the Stripe(USD)+Wise path. Grow
// PAYSTACK_LAUNCH_COUNTRIES as each additional currency's checkout + payout is
// verified. The mobile mirror of these knobs lives in
// mobile/constants/payments.ts — keep them in sync.
const PAYSTACK_ENABLED = process.env.PAYSTACK_ENABLED !== "false";
const PAYSTACK_LAUNCH_COUNTRIES = new Set(["nigeria", "ng"]);

function isPaystackCountry(country) {
  return PAYSTACK_ENABLED && PAYSTACK_LAUNCH_COUNTRIES.has(country);
}

/**
 * Resolve the COLLECTION provider for a seller (how we charge the buyer).
 * @param {object} user - a populated user/seller document
 * @returns {"stripe" | "paystack"}
 */
export function getPayoutProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  return "stripe";
}

/**
 * Resolve the SETTLEMENT provider for a seller (how their net is paid out).
 * Nigerian sellers settle via Paystack transfers; everyone else via Wise.
 * @param {object} user
 * @returns {"wise" | "paystack"}
 */
export function getSettlementProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  return "wise";
}

/**
 * Whether a seller has completed onboarding for the provider that settles them.
 * @param {object} user
 * @returns {boolean}
 */
export function hasPayoutOnboarding(user) {
  const provider = getSettlementProvider(user);
  if (provider === "paystack") {
    return !!(user?.paystackRecipientCode && user?.paystackOnboardingComplete);
  }
  return !!(user?.wiseRecipientId && user?.wiseOnboardingComplete);
}

// Country (lowercased) → default selling currency. Drives the currency a
// vendor's tickets/guides are priced in when they don't specify one. Only
// launch-scope Paystack countries ever reach this map.
const COUNTRY_CURRENCY = {
  nigeria: "NGN",
  ng: "NGN",
  ghana: "GHS",
  gh: "GHS",
  kenya: "KES",
  ke: "KES",
  "south africa": "ZAR",
  za: "ZAR",
};

/**
 * Default selling currency for a user. Paystack-country sellers price in
 * their local currency (launch scope: Nigeria → NGN); everyone else collects
 * via Stripe in USD (Wise converts to the vendor's local currency on payout).
 * @param {object} user
 * @returns {string} ISO currency code
 */
export function currencyForUser(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (!isPaystackCountry(country)) return "USD";
  return COUNTRY_CURRENCY[country] || "USD";
}

export default {
  getPayoutProvider,
  getSettlementProvider,
  hasPayoutOnboarding,
  currencyForUser,
};
