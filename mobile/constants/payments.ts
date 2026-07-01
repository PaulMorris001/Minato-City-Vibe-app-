/**
 * Payment provider routing on the client. Mirrors the server's
 * FLUTTERWAVE_COUNTRIES (services/payments/resolveProvider.js) so the app sends
 * vendors to the correct payout-onboarding screen.
 */

// Country name (lowercased) → Flutterwave country code for the banks endpoint.
export const FLUTTERWAVE_COUNTRY_CODES: Record<string, string> = {
  nigeria: "NG",
  ghana: "GH",
  kenya: "KE",
  "south africa": "ZA",
  uganda: "UG",
  tanzania: "TZ",
  rwanda: "RW",
  zambia: "ZM",
};

export const FLUTTERWAVE_COUNTRIES = new Set(Object.keys(FLUTTERWAVE_COUNTRY_CODES));

// US vendors settle through Stripe Connect.
const US_COUNTRIES = new Set(["united states", "united states of america", "usa", "us"]);

// Flutterwave temporarily hidden (Wise-first rollout) — mirrors the server's
// FLUTTERWAVE_ENABLED flag. Flip to `true` to bring the Flutterwave screen back.
const FLUTTERWAVE_ENABLED = false;

/**
 * Which payout provider a vendor in `country` uses. Mirrors the server's
 * getSettlementProvider. With Flutterwave hidden: US → Stripe, everyone else → Wise.
 */
export function payoutProviderForCountry(country?: string): "stripe" | "flutterwave" | "wise" {
  const c = (country || "").trim().toLowerCase();
  if (FLUTTERWAVE_ENABLED && FLUTTERWAVE_COUNTRIES.has(c)) return "flutterwave";
  if (US_COUNTRIES.has(c)) return "stripe";
  return "wise";
}

/** Onboarding screen route for a vendor in `country`. */
export function payoutOnboardingRoute(country?: string): string {
  const provider = payoutProviderForCountry(country);
  if (provider === "flutterwave") return "/flutterwave-onboarding";
  if (provider === "wise") return "/wise-onboarding";
  return "/stripe-onboarding";
}

// Display symbols for the currencies we support. Unknown codes fall back to the
// code itself (e.g. "GHS 50").
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  NGN: "₦",
  GHS: "₵",
  KES: "KSh ",
  ZAR: "R",
  UGX: "USh ",
  TZS: "TSh ",
  RWF: "FRw ",
  ZMW: "ZK ",
};

/** Prefix to put before a formatted amount for the given currency. */
export function currencyPrefix(currency?: string): string {
  const code = (currency || "USD").toUpperCase();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}
