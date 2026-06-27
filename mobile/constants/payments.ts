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

/** Which payout provider a vendor in `country` uses. */
export function payoutProviderForCountry(country?: string): "stripe" | "flutterwave" {
  const c = (country || "").trim().toLowerCase();
  return FLUTTERWAVE_COUNTRIES.has(c) ? "flutterwave" : "stripe";
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
