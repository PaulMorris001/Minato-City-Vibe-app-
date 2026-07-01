/**
 * Payment provider routing.
 *
 * Two distinct decisions, historically conflated:
 *  - COLLECTION provider (`getPayoutProvider`): how we charge the buyer. Stripe
 *    (card, USD) or Flutterwave (African local methods).
 *  - SETTLEMENT provider (`getSettlementProvider`): how the seller's net is paid
 *    out. Stripe Connect, Flutterwave transfers, or Wise (international vendors
 *    outside both footprints). Wise is payout-only, so its vendors COLLECT via
 *    Stripe but SETTLE via Wise.
 *
 * This module reads the Wise routing knobs straight from process.env (rather than
 * importing the validated config) so it stays free of env-validation side effects
 * and its unit test needs no setup.
 */

// Wise routing knobs, read lazily so import order / env-load timing don't matter.
function wiseRouting() {
  const enabled = !!process.env.WISE_API_TOKEN;
  const countries = new Set(
    (process.env.WISE_COUNTRIES || "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
  );
  return { enabled, countries };
}

// Countries we route to Flutterwave. Lowercased on lookup so we tolerate
// "Nigeria" / "nigeria" and both names + ISO codes that may appear in user data.
const FLUTTERWAVE_COUNTRIES = new Set([
  "nigeria",
  "ng",
  "ghana",
  "gh",
  "kenya",
  "ke",
  "south africa",
  "za",
  "uganda",
  "ug",
  "tanzania",
  "tz",
  "rwanda",
  "rw",
  "zambia",
  "zm",
]);

// US sellers settle through Stripe Connect (collect + pay out unified).
const US_COUNTRIES = new Set(["united states", "united states of america", "usa", "us"]);

// ── Flutterwave temporarily disabled (Wise-first rollout) ────────────────────
// While Wise is the rail we're setting up first, Flutterwave is hidden: EVERYONE
// collects via Stripe (USD) and non-US vendors settle via Wise (which converts
// USD → their local currency on the payout). This keeps collection and payout in
// the same currency pot. To bring Flutterwave back, flip this to `true` — the
// FLUTTERWAVE_COUNTRIES branches below (and currencyForUser) re-activate.
const FLUTTERWAVE_ENABLED = false;

/**
 * Resolve the COLLECTION provider for a seller (how we charge the buyer).
 * With Flutterwave hidden, everyone collects via Stripe (USD).
 * @param {object} user - a populated user/seller document
 * @returns {"stripe" | "flutterwave"}
 */
export function getPayoutProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (FLUTTERWAVE_ENABLED && FLUTTERWAVE_COUNTRIES.has(country)) return "flutterwave";
  return "stripe";
}

/**
 * Resolve the SETTLEMENT provider for a seller (how their net is paid out).
 * With Flutterwave hidden: US → Stripe Connect, everyone else → Wise.
 * @param {object} user
 * @returns {"wise" | "stripe" | "flutterwave"}
 */
export function getSettlementProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (FLUTTERWAVE_ENABLED && FLUTTERWAVE_COUNTRIES.has(country)) return "flutterwave";
  if (US_COUNTRIES.has(country)) return "stripe";
  // International vendor. Route to Wise when it's configured and either no
  // allowlist is set (Wise covers all international) or this country is on it.
  const { enabled, countries } = wiseRouting();
  if (enabled && (countries.size === 0 || countries.has(country))) return "wise";
  // Legacy fallback (Wise not configured): Stripe, as before.
  return "stripe";
}

/**
 * Whether a seller has completed onboarding for the provider that settles them.
 * Generalizes the previous Stripe-only `stripeOnboardingComplete` gate.
 * @param {object} user
 * @returns {boolean}
 */
export function hasPayoutOnboarding(user) {
  const provider = getSettlementProvider(user);
  if (provider === "wise") {
    return !!(user?.wiseRecipientId && user?.wiseOnboardingComplete);
  }
  if (provider === "flutterwave") {
    return !!user?.flutterwaveOnboardingComplete;
  }
  return !!(user?.stripeAccountId && user?.stripeOnboardingComplete);
}

// Country (lowercased) → default selling currency. Drives the currency a
// vendor's tickets/guides are priced in when they don't specify one.
const COUNTRY_CURRENCY = {
  nigeria: "NGN",
  ng: "NGN",
  ghana: "GHS",
  gh: "GHS",
  kenya: "KES",
  ke: "KES",
  "south africa": "ZAR",
  za: "ZAR",
  uganda: "UGX",
  ug: "UGX",
  tanzania: "TZS",
  tz: "TZS",
  rwanda: "RWF",
  rw: "RWF",
  zambia: "ZMW",
  zm: "ZMW",
};

/**
 * Default selling currency for a user. With Flutterwave hidden, everyone
 * collects via Stripe in USD (Wise converts to the vendor's local currency on
 * payout), so pricing is USD across the board.
 * @param {object} user
 * @returns {string} ISO currency code
 */
export function currencyForUser(user) {
  if (!FLUTTERWAVE_ENABLED) return "USD";
  const country = (user?.location?.country || "").trim().toLowerCase();
  return COUNTRY_CURRENCY[country] || "USD";
}

export { FLUTTERWAVE_COUNTRIES };
export default {
  getPayoutProvider,
  getSettlementProvider,
  hasPayoutOnboarding,
  currencyForUser,
  FLUTTERWAVE_COUNTRIES,
};
