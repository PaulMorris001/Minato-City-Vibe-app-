/**
 * Payment provider routing.
 *
 * Two distinct decisions:
 *  - COLLECTION provider (`getPayoutProvider`): how we charge the buyer. Stripe
 *    (card/USD, into the PLATFORM balance) or Paystack (NGN local methods).
 *  - SETTLEMENT provider (`getSettlementProvider`): how the seller's net is
 *    paid out once an admin approves. Paystack transfers for Nigerian sellers,
 *    Stripe Connect for sellers inside its cross-border-payouts footprint.
 *
 * PayPal is built but OFF, waiting on live API credentials. `PAYPAL_ENABLED`
 * turns it on for both decisions at once; until then every function here behaves
 * exactly as it did before PayPal existed. The one rule that survives the switch
 * being thrown: a seller already settled by Connect keeps Connect, because
 * moving them would read as un-onboarded and block their paid listings.
 *
 * History, because it explains the shape of this file. Wise was removed in Aug
 * 2026 — it had never worked in any environment and was silently routing most of
 * the world to a dead-end screen. That is why a country this file cannot
 * actually pay gets an honest `null`, never a rail that fails after the money is
 * collected. Sellers there can still publish free listings.
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

// ── PayPal rollout ───────────────────────────────────────────────────────────
// OFF until the live API credentials exist. While it is off, every routing
// decision below behaves exactly as it did before PayPal was built: Stripe
// collects and Connect settles outside Nigeria.
//
// Gated on the credentials as well as the flag, deliberately. Setting the flag
// alone on an environment with no keys would route real buyers to a rail that
// cannot create an order, taking checkout down for everyone outside Nigeria.
// The switch cannot be thrown before the rail can actually take money.
const PAYPAL_ENABLED =
  process.env.PAYPAL_ENABLED === "true" &&
  !!process.env.PAYPAL_CLIENT_ID &&
  !!process.env.PAYPAL_CLIENT_SECRET;

// PayPal's country rule is an exclusion list, not an allow list — the opposite
// shape to the Stripe Connect map below. Payouts reach roughly 200 countries, so
// enumerating the ones that work would be longer, staler and more likely to
// wrongly exclude a legitimate seller than naming the ones that don't.
//
// Listed below are countries where PayPal does not operate, or operates without
// the ability to receive a payout. Being wrong in the excluding direction costs
// a seller their paid listings until we fix it; being wrong in the including
// direction takes a buyer's money for a sale whose seller can never be paid. So
// when in doubt, exclude.
//
// `location.country` is free text (a CSC API country name, occasionally an
// ISO2), so each country is keyed by BOTH its lowercased name and its lowercased
// ISO2 — same convention as PAYSTACK_LAUNCH_COUNTRIES above.
//
// RECONCILE THIS AGAINST PayPal's published country list before going live in a
// new market; it is a point-in-time snapshot, not a maintained feed.
const PAYPAL_UNSUPPORTED_COUNTRIES = new Set([
  "afghanistan", "af",
  "bangladesh", "bd",
  "belarus", "by",
  "central african republic", "cf",
  "cuba", "cu",
  "democratic republic of the congo", "cd",
  "haiti", "ht",
  "iran", "ir",
  "iraq", "iq",
  "north korea", "kp",
  "lebanon", "lb",
  "liberia", "lr",
  "libya", "ly",
  "myanmar", "burma", "mm",
  "pakistan", "pk",
  "russia", "russian federation", "ru",
  "somalia", "so",
  "south sudan", "ss",
  "sudan", "sd",
  "syria", "syrian arab republic", "sy",
  "turkey", "türkiye", "tr",
  "uzbekistan", "uz",
  "zimbabwe", "zw",
]);

// An EMPTY country is not "supported" — it is unknown, and the two must not
// collapse. Every caller downstream treats a rail as a promise we can pay, and
// we cannot promise that about a seller whose country we have never asked for.
// `payoutCountryKnown` is what tells the UI to ask instead of apologising.
function isPaypalCountry(country) {
  return PAYPAL_ENABLED && !!country && !PAYPAL_UNSUPPORTED_COUNTRIES.has(country);
}

// ── Stripe Connect rollout ───────────────────────────────────────────────────
// Stripe's cross-border payouts only reach connected accounts in the US, UK,
// EEA, Canada and Switzerland. The funds flow is "separate charges and transfers
// (without on_behalf_of)": collection lands in the platform balance and a
// Transfer to the connected account runs only at admin-approval time. Stripe
// takes 0.25% per payout.
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

// There is deliberately no STRIPE_CONNECT_ENABLED flag. While PayPal is off,
// Connect is the ONLY rail outside Nigeria, so switching it off would return
// null for the US, UK and the whole EEA at once: every non-Nigerian seller would
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
 * Both rails collect into the PLATFORM balance, with no per-charge split and no
 * application fee. Money only leaves at admin-approval time, through
 * getSettlementProvider's rail. Do not reintroduce per-charge destination
 * transfers — that shape is incompatible with the admin-approval gate.
 *
 * @param {object} user - a populated user/seller document
 * @returns {"stripe" | "paypal" | "paystack"}
 */
export function getPayoutProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  // Collection is not country-gated on either rail — both can charge any buyer.
  // While PayPal is off this is always Stripe, exactly as before.
  if (PAYPAL_ENABLED) return "paypal";
  return "stripe";
}

/**
 * Resolve the SETTLEMENT provider for a seller (how their net is paid out).
 *
 * Precedence, and why:
 *  1. Nigeria → paystack. Collection and settlement are the same rail; nothing
 *     else here can reach an NGN bank.
 *  2. Anywhere PayPal operates → paypal. Payouts draw from the same PayPal
 *     balance the capture landed in, and PayPal runs KYC on the recipient.
 *  3. Everyone else → null. No rail reaches them, and saying so is the point.
 *
 * Returning `null` rather than a placeholder string is deliberate: a string would
 * flow unchecked into Payout.provider and ticket.payoutProvider, passing every
 * enum until it finally blew up inside runTransfer with the money already
 * collected. `null` forces each call site to decide.
 *
 * Callers that need to explain the state to a human should use `payoutSupported`
 * to tell "not in your country" (permanent) apart from "finish onboarding"
 * (fixable) — they are different messages with different CTAs.
 *
 * @param {object} user
 * A seller who has already finished Connect onboarding keeps Stripe even after
 * PayPal is switched on. Moving them would read as un-onboarded and block their
 * paid listings until they added a PayPal address, so a working rail always wins
 * over a newly available one.
 *
 * @returns {"paystack" | "stripe" | "paypal" | null}
 */
export function getSettlementProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (isPaystackCountry(country)) return "paystack";
  if (isConnectCountry(country) && user?.stripeOnboardingComplete) return "stripe";
  if (isPaypalCountry(country)) return "paypal";
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
 * Whether we know where this seller is at all.
 *
 * Every function above keys off `location.country`, and an empty one falls into
 * the same `null` bucket as a genuinely unsupported country — which told the
 * majority of accounts (nobody is asked for a country on social sign-in) that
 * payouts would never reach them, with no way to act on it. Callers MUST check
 * this before showing "not in your country": unknown is fixable, unsupported is
 * not, and only one of them gets a CTA.
 *
 * @param {object} user
 * @returns {boolean}
 */
export function payoutCountryKnown(user) {
  return !!(user?.location?.country || "").trim();
}

/**
 * Whether a seller has completed onboarding for the provider that settles them.
 * False when no rail reaches them — there is nothing to complete.
 *
 * "Onboarding" is a much smaller thing on PayPal than on Stripe Connect: a payout
 * needs the seller's PayPal email and nothing else, so there is no hosted KYC
 * flow, no account id and no transient capability flag to gate on.
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
  if (provider === "paypal") {
    return !!(user?.paypalPayoutEmail && user?.paypalOnboardingComplete);
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
  "stripeAccountId stripeAccountCountry stripeOnboardingComplete stripePayoutsEnabled " +
  "paypalPayoutEmail paypalOnboardingComplete";

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
 * via PayPal in USD.
 *
 * Eurozone sellers are NOT an exception — a German seller still prices and
 * collects in USD, and PayPal converts on payout. Making this return EUR for
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
  payoutCountryKnown,
  hasPayoutOnboarding,
  connectCountryCode,
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
};
