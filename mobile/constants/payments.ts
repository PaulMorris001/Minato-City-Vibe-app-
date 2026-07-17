/**
 * Payment provider routing on the client. Mirrors the server's
 * PAYSTACK_LAUNCH_COUNTRIES (services/payments/resolveProvider.js) so the app
 * sends vendors to the correct payout-onboarding screen.
 *
 * The architecture: Nigerian sellers collect NGN via Paystack and are paid out
 * by Paystack transfers; every other seller collects via Stripe (USD, into the
 * platform balance) and is paid out through Wise.
 */

// Paystack rollout — mirrors the server's PAYSTACK_ENABLED +
// PAYSTACK_LAUNCH_COUNTRIES knobs (services/payments/resolveProvider.js).
// Launch scope is Nigeria only (USD + NGN); grow the launch set as more
// currencies' checkout + payout are verified, in sync with the server.
const PAYSTACK_ENABLED = true;
const PAYSTACK_LAUNCH_COUNTRIES = new Set(["nigeria", "ng"]);

function isPaystackCountry(country: string): boolean {
  return PAYSTACK_ENABLED && PAYSTACK_LAUNCH_COUNTRIES.has(country);
}

/**
 * Which payout provider a vendor in `country` uses. Mirrors the server's
 * getSettlementProvider: launch-scope Paystack countries → Paystack, everyone
 * else → Wise.
 */
export function payoutProviderForCountry(country?: string): "paystack" | "wise" {
  const c = (country || "").trim().toLowerCase();
  if (isPaystackCountry(c)) return "paystack";
  return "wise";
}

// Country (lowercased) → local selling currency, mirroring the server's
// COUNTRY_CURRENCY. Only launch-scope countries ever reach this map.
const COUNTRY_CURRENCY: Record<string, string> = {
  nigeria: "NGN",
  ng: "NGN",
};

/**
 * The currency a seller in `country` prices in. Mirrors the server's
 * currencyForUser: NGN for Nigerian sellers (launch scope), USD otherwise.
 */
export function sellingCurrencyForCountry(country?: string): string {
  const c = (country || "").trim().toLowerCase();
  if (!isPaystackCountry(c)) return "USD";
  return COUNTRY_CURRENCY[c] || "USD";
}

/** Onboarding screen route for a vendor in `country`. */
export function payoutOnboardingRoute(country?: string): string {
  const provider = payoutProviderForCountry(country);
  if (provider === "paystack") return "/paystack-onboarding";
  return "/wise-onboarding";
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
