/**
 * Payment provider routing on the client. Mirrors the server's rollout knobs in
 * services/payments/resolveProvider.js so the app sends vendors to the correct
 * payout-onboarding screen — keep the two in sync.
 *
 * The architecture: Nigerian sellers collect NGN via Paystack and are paid out
 * by Paystack transfers. Everyone else collects via Stripe (USD, into the
 * platform balance) and is paid out through either Stripe Connect (sellers
 * inside Stripe's cross-border-payouts footprint) or Wise (everyone else).
 *
 * This mirror is exact only because settlement routing is a pure function of
 * country. The server also carries a grandfather clause for sellers with a
 * completed Wise recipient, which the client can't see — no seller matches it
 * today (none has ever finished Wise onboarding), and the Connect rail is meant
 * to go live before that becomes possible. If that ordering ever slips, the
 * client will need the provider handed to it by the server instead.
 */

export type PayoutProvider = "paystack" | "wise" | "stripe";

// Paystack rollout — mirrors the server's PAYSTACK_ENABLED +
// PAYSTACK_LAUNCH_COUNTRIES knobs (services/payments/resolveProvider.js).
// Launch scope is Nigeria only (USD + NGN); grow the launch set as more
// currencies' checkout + payout are verified, in sync with the server.
const PAYSTACK_ENABLED = true;
const PAYSTACK_LAUNCH_COUNTRIES = new Set(["nigeria", "ng"]);

function isPaystackCountry(country: string): boolean {
  return PAYSTACK_ENABLED && PAYSTACK_LAUNCH_COUNTRIES.has(country);
}

// Stripe Connect rollout — mirrors the server's STRIPE_CONNECT_ENABLED env flag
// and CONNECT_COUNTRIES map. Stripe's cross-border payouts only reach connected
// accounts in the US, UK, EEA, CA and CH. Keys are lowercased country names and
// ISO2 codes, matching the free-text `location.country` the app stores. The
// client doesn't need the ISO2 values the server maps to, only membership.
//
// FLIP THIS IN LOCKSTEP WITH THE SERVER'S STRIPE_CONNECT_ENABLED — if the client
// says Connect and the server says Wise, vendors land on an onboarding screen
// whose status endpoint will never report them set up.
const STRIPE_CONNECT_ENABLED = true;
const CONNECT_COUNTRIES = new Set([
  // North America
  "united states", "united states of america", "usa", "us", "canada", "ca",
  // UK + Switzerland
  "united kingdom", "great britain", "uk", "gb", "switzerland", "ch",
  // EEA — EU 27
  "austria", "at", "belgium", "be", "bulgaria", "bg", "croatia", "hr",
  "cyprus", "cy", "czechia", "czech republic", "cz", "denmark", "dk",
  "estonia", "ee", "finland", "fi", "france", "fr", "germany", "de",
  "greece", "gr", "hungary", "hu", "ireland", "ie", "italy", "it",
  "latvia", "lv", "lithuania", "lt", "luxembourg", "lu", "malta", "mt",
  "netherlands", "the netherlands", "nl", "poland", "pl", "portugal", "pt",
  "romania", "ro", "slovakia", "sk", "slovenia", "si", "spain", "es",
  "sweden", "se",
  // EEA — non-EU
  "iceland", "is", "liechtenstein", "li", "norway", "no",
]);

function isConnectCountry(country: string): boolean {
  return STRIPE_CONNECT_ENABLED && CONNECT_COUNTRIES.has(country);
}

/**
 * Which payout provider a vendor in `country` uses. Mirrors the server's
 * getSettlementProvider: Nigeria → Paystack, the cross-border footprint →
 * Stripe Connect, everyone else → Wise.
 */
export function payoutProviderForCountry(country?: string): PayoutProvider {
  const c = (country || "").trim().toLowerCase();
  if (isPaystackCountry(c)) return "paystack";
  if (isConnectCountry(c)) return "stripe";
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

/** Payout-onboarding screen for each rail. */
export const PAYOUT_ONBOARDING_ROUTES: Record<PayoutProvider, string> = {
  paystack: "/paystack-onboarding",
  wise: "/wise-onboarding",
  stripe: "/stripe-connect-onboarding",
};

/** Onboarding-status endpoint for each rail. All three return the same shape. */
export const PAYOUT_STATUS_ENDPOINTS: Record<PayoutProvider, string> = {
  paystack: "/paystack/connect/status",
  wise: "/wise/connect/status",
  stripe: "/stripe/connect/status",
};

/** Onboarding screen route for a vendor in `country`. */
export function payoutOnboardingRoute(country?: string): string {
  return PAYOUT_ONBOARDING_ROUTES[payoutProviderForCountry(country)];
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
