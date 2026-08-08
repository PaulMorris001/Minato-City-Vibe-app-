/**
 * Payment provider routing.
 *
 * Two distinct decisions:
 *  - COLLECTION provider (`getPayoutProvider`): how we charge the buyer. Stripe
 *    (card, USD, into the PLATFORM balance) or Paystack (NGN local methods).
 *  - SETTLEMENT provider (`getSettlementProvider`): how the seller's net is
 *    paid out once an admin approves. Two rails: Paystack transfers for Nigerian
 *    sellers, Stripe Connect for sellers inside Stripe's cross-border-payouts
 *    footprint. Sellers outside both have NO rail — see below.
 *
 * There used to be a third rail (Wise) covering the long tail. It was removed in
 * Aug 2026: it had never worked in any environment (the API credentials were
 * placeholder strings and no seller ever completed its onboarding), so it was
 * silently routing most of the world to a dead-end screen. Countries outside the
 * two live rails now get an honest, explicit "not available yet" instead — they
 * can still publish free listings. Restoring long-tail coverage means adding a
 * rail that works, not re-adding a default that doesn't.
 *
 * This module reads its rollout knobs straight from process.env (rather than
 * importing the validated config) so it stays free of env-validation side
 * effects and its unit test needs no setup.
 */

// ── Paystack rollout ─────────────────────────────────────────────────────────
// Local-currency selling runs on Paystack. Launch scope is Nigeria only
// (USD + NGN): Nigerian sellers price and collect in NGN and are settled by
// Paystack transfers; everyone else collects in USD via Stripe. Grow
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

// There is deliberately no STRIPE_CONNECT_ENABLED flag any more. With Wise gone,
// Connect is the ONLY rail outside Nigeria, so switching it off would return null
// for the US, UK and the whole EEA at once: every non-Nigerian seller would
// instantly lose paid listings, queued payouts would fail, and sellers with live,
// fully-onboarded Stripe accounts would read as un-onboarded. A kill switch whose
// off position bricks the product is not a kill switch. To pause a country, take
// it out of CONNECT_COUNTRIES.
function isConnectCountry(country) {
  return !!CONNECT_COUNTRIES[country];
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
 *  2. Connect-eligible country → stripe. Transfers draw from the same platform
 *     balance the charge landed in, and Stripe runs KYC/AML on the connected
 *     account.
 *  3. Everyone else → null. No rail reaches them, and saying so is the point.
 *
 * Returning `null` rather than a placeholder string is deliberate: a string would
 * flow unchecked into Payout.provider, ticket.payoutProvider and PaymentIntent
 * metadata, passing every enum until it finally blew up inside runTransfer with
 * the money already collected. `null` forces each call site to decide.
 *
 * Callers that need to explain the state to a human should use `payoutSupported`
 * to tell "not in your country" (permanent) apart from "finish onboarding"
 * (fixable) — they are different messages with different CTAs.
 *
 * @param {object} user
 * @returns {"paystack" | "stripe" | null}
 */
export function getSettlementProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  if (isConnectCountry(country)) return "stripe";
  return null;
}

/**
 * Whether any payout rail can reach this seller's country at all.
 *
 * Distinct from `hasPayoutOnboarding`: this is about the country (the seller can
 * do nothing about it), that is about the seller's own setup (they can).
 *
 * @param {object} user
 * @returns {boolean}
 */
export function payoutSupported(user) {
  return getSettlementProvider(user) !== null;
}

/**
 * Whether a seller has completed onboarding for the provider that settles them.
 * False when no rail reaches them — there is nothing to complete.
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
  return false;
}

/**
 * Every field getSettlementProvider / hasPayoutOnboarding read. Any query whose
 * result is fed to either MUST select these — a field that wasn't selected reads
 * as undefined and silently routes the seller to the wrong rail, or reports them
 * un-onboarded (which blocks paid-event creation and fails their event payouts).
 */
export const PAYOUT_ROUTING_FIELDS =
  "location paystackRecipientCode paystackOnboardingComplete " +
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
 * collects in USD, and Stripe converts on payout. Making this return EUR for
 * them would break the currency check in event.controller.js and produce
 * EUR-priced tickets charged as USD.
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
  payoutSupported,
  hasPayoutOnboarding,
  connectCountryCode,
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
};
