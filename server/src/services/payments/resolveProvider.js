/**
 * Payment provider routing.
 *
 * Two distinct decisions:
 *  - COLLECTION provider (`getPayoutProvider`): how we charge the buyer. Stripe
 *    (card, USD, into the PLATFORM balance) or Paystack (NGN local methods).
 *  - SETTLEMENT provider (`getSettlementProvider`): how the seller's net is
 *    paid out once an admin approves. Three rails: Paystack transfers for
 *    Nigerian sellers, Stripe Connect for sellers inside Stripe's cross-border
 *    -payouts footprint, and Wise for everyone else. Both non-Paystack rails
 *    COLLECT via Stripe into the platform balance — they differ only in how the
 *    money leaves it.
 *
 * This module reads its rollout knobs straight from process.env (rather than
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

// ── Stripe Connect rollout ───────────────────────────────────────────────────
// Stripe's cross-border payouts only reach connected accounts in the US, UK,
// EEA, Canada and Switzerland, and the account must NOT be under a recipient
// service agreement. The funds flow is "separate charges and transfers (without
// on_behalf_of)": collection is unchanged (everything lands in the platform
// balance) and a Transfer to the connected account runs only at admin-approval
// time. Stripe takes 0.25% per payout.
//
// `location.country` is free text (a CSC API country name, occasionally an
// ISO2), so each country is keyed by BOTH its lowercased name and its lowercased
// ISO2 — same convention as PAYSTACK_LAUNCH_COUNTRIES above. The value is the
// ISO2 that stripe.accounts.create requires; account country is immutable once
// set, so getting it right at creation matters.
const CONNECT_COUNTRIES = {
  // North America
  "united states": "US", "united states of america": "US", usa: "US", us: "US",
  canada: "CA", ca: "CA",
  // UK + Switzerland
  "united kingdom": "GB", "great britain": "GB", uk: "GB", gb: "GB",
  switzerland: "CH", ch: "CH",
  // EEA — EU 27
  austria: "AT", at: "AT",
  belgium: "BE", be: "BE",
  bulgaria: "BG", bg: "BG",
  croatia: "HR", hr: "HR",
  cyprus: "CY", cy: "CY",
  czechia: "CZ", "czech republic": "CZ", cz: "CZ",
  denmark: "DK", dk: "DK",
  estonia: "EE", ee: "EE",
  finland: "FI", fi: "FI",
  france: "FR", fr: "FR",
  germany: "DE", de: "DE",
  greece: "GR", gr: "GR",
  hungary: "HU", hu: "HU",
  ireland: "IE", ie: "IE",
  italy: "IT", it: "IT",
  latvia: "LV", lv: "LV",
  lithuania: "LT", lt: "LT",
  luxembourg: "LU", lu: "LU",
  malta: "MT", mt: "MT",
  netherlands: "NL", "the netherlands": "NL", nl: "NL",
  poland: "PL", pl: "PL",
  portugal: "PT", pt: "PT",
  romania: "RO", ro: "RO",
  slovakia: "SK", sk: "SK",
  slovenia: "SI", si: "SI",
  spain: "ES", es: "ES",
  sweden: "SE", se: "SE",
  // EEA — non-EU
  iceland: "IS", is: "IS",
  liechtenstein: "LI", li: "LI",
  norway: "NO", no: "NO",
};

// Read lazily, NOT at module load (unlike PAYSTACK_ENABLED above). The unit test
// uses static ESM imports, so it can't set the env var before this module
// evaluates — reading per-call is what lets it toggle the flag between
// assertions and cover both the dark and live states. Don't "tidy" this into a
// module-level const.
function connectEnabled() {
  return process.env.STRIPE_CONNECT_ENABLED === "true";
}

function isConnectCountry(country) {
  return connectEnabled() && !!CONNECT_COUNTRIES[country];
}

/**
 * ISO2 country code to open a seller's Express account in, or null if they're
 * outside the cross-border-payouts footprint. Callers must treat null as "not
 * eligible" rather than defaulting to a country — the account's country is
 * immutable once created, and a mismatched one can't accept the seller's bank.
 * @param {object} user
 * @returns {string | null}
 */
export function connectCountryCode(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  return CONNECT_COUNTRIES[country] || null;
}

/**
 * Resolve the COLLECTION provider for a seller (how we charge the buyer).
 *
 * Unaffected by the Connect rail: Connect sellers collect through the PLATFORM
 * Stripe account exactly like Wise sellers, with no transfer_data and no
 * application_fee_amount. (The pre-2026 Connect implementation used per-charge
 * destination transfers — do not reintroduce that; it's incompatible with the
 * admin-approval gate AND with cross-border payouts.)
 *
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
 *
 * Precedence, and why:
 *  1. Nigeria → paystack. Collection and settlement are the same rail; nothing
 *     else here can reach an NGN bank.
 *  2. A seller with a working Wise recipient keeps Wise, even if their country
 *     is Connect-eligible. Nobody matches this today (no Wise onboarding has
 *     ever completed), but it guarantees that enabling Connect can never strand
 *     a live seller behind a fresh KYC wall or reopen in-flight payouts against
 *     the wrong rail. To migrate one deliberately, an admin clears
 *     wiseOnboardingComplete and they route to Connect on their next visit.
 *  3. Connect-eligible country → stripe. Transfers draw from the same platform
 *     balance the charge landed in (no Wise pre-funding float), and Stripe runs
 *     KYC/AML on the connected account.
 *  4. Everyone else → wise. The long tail (GH, KE, ZA, IN, LatAm, SEA) that only
 *     Wise reaches.
 *
 * @param {object} user
 * @returns {"wise" | "paystack" | "stripe"}
 */
export function getSettlementProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  if (user?.wiseRecipientId && user?.wiseOnboardingComplete) return "wise";
  if (isConnectCountry(country)) return "stripe";
  return "wise";
}

/**
 * Whether a seller has completed onboarding for the provider that settles them.
 *
 * The Connect branch deliberately does NOT require `stripePayoutsEnabled`: that
 * flips false transiently whenever Stripe re-requests KYC, and gating on it
 * would revoke a live organizer's ability to sell mid-season. Transfers still
 * succeed while it's false (the money waits in the vendor's Stripe balance), so
 * it's surfaced in the UI instead.
 *
 * @param {object} user
 * @returns {boolean}
 */
export function hasPayoutOnboarding(user) {
  const provider = getSettlementProvider(user);
  if (provider === "paystack") {
    return !!(user?.paystackRecipientCode && user?.paystackOnboardingComplete);
  }
  if (provider === "stripe") {
    return !!(user?.stripeAccountId && user?.stripeOnboardingComplete);
  }
  return !!(user?.wiseRecipientId && user?.wiseOnboardingComplete);
}

/**
 * Every field getSettlementProvider / hasPayoutOnboarding read. Any query whose
 * result is fed to either MUST select these — a field that wasn't selected reads
 * as undefined and silently routes the seller to the wrong rail, or reports them
 * un-onboarded (which blocks paid-event creation and fails their event payouts).
 */
export const PAYOUT_ROUTING_FIELDS =
  "location paystackRecipientCode paystackOnboardingComplete " +
  "wiseRecipientId wiseRecipientCurrency wiseOnboardingComplete " +
  "stripeAccountId stripeAccountCountry stripeOnboardingComplete stripePayoutsEnabled";

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
 * via Stripe in USD.
 *
 * Connect sellers are NOT an exception — a German seller still prices and
 * collects in USD, and Stripe converts on payout, exactly as Wise does. Making
 * this return EUR for them would break the currency check in event.controller.js
 * and produce EUR-priced tickets charged as USD.
 *
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
  connectCountryCode,
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
};
