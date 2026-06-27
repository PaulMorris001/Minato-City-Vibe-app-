/**
 * Payment provider routing.
 *
 * A transaction always pays out to the seller, so the provider is chosen by the
 * seller's country: US sellers settle through Stripe Connect; sellers in
 * Flutterwave-supported African countries settle through Flutterwave.
 */

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

/**
 * Resolve the payout provider for a seller.
 * @param {object} user - a populated user/seller document
 * @returns {"stripe" | "flutterwave"}
 */
export function getPayoutProvider(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  if (FLUTTERWAVE_COUNTRIES.has(country)) return "flutterwave";
  return "stripe";
}

/**
 * Whether a seller has completed onboarding for the provider they're routed to.
 * Generalizes the previous Stripe-only `stripeOnboardingComplete` gate.
 * @param {object} user
 * @returns {boolean}
 */
export function hasPayoutOnboarding(user) {
  const provider = getPayoutProvider(user);
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
 * Default selling currency for a user, based on their country. US/unknown → USD.
 * @param {object} user
 * @returns {string} ISO currency code
 */
export function currencyForUser(user) {
  const country = (user?.location?.country || "").trim().toLowerCase();
  return COUNTRY_CURRENCY[country] || "USD";
}

export { FLUTTERWAVE_COUNTRIES };
export default { getPayoutProvider, hasPayoutOnboarding, currencyForUser, FLUTTERWAVE_COUNTRIES };
