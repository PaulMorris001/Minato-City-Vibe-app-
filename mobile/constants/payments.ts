/**
 * Payment provider routing on the client. Mirrors the server's rollout knobs in
 * services/payments/resolveProvider.js so the app sends vendors to the correct
 * payout-onboarding screen — keep the two in sync.
 *
 * The architecture: Nigerian sellers collect NGN via Paystack and are paid out
 * by Paystack transfers. Everyone else collects via Stripe (USD, into the
 * platform balance) and is paid out through Stripe Connect — but only if they're
 * inside Stripe's cross-border-payouts footprint. Sellers outside both get
 * `null`: there is no rail that reaches them, so they can publish free listings
 * but not paid ones.
 *
 * This mirror is exact because settlement routing is a pure function of country
 * on both sides. Keep it that way — the moment the server needs per-seller state
 * to decide, this file has to be replaced by a value handed down from the API.
 */

export type PayoutProvider = "paystack" | "stripe";

// Paystack rollout — mirrors the server's PAYSTACK_ENABLED +
// PAYSTACK_LAUNCH_COUNTRIES knobs (services/payments/resolveProvider.js).
// Launch scope is Nigeria only (USD + NGN); grow the launch set as more
// currencies' checkout + payout are verified, in sync with the server.
const PAYSTACK_ENABLED = true;
const PAYSTACK_LAUNCH_COUNTRIES = new Set(["nigeria", "ng"]);

function isPaystackCountry(country: string): boolean {
  return PAYSTACK_ENABLED && PAYSTACK_LAUNCH_COUNTRIES.has(country);
}

// Stripe Connect footprint — mirrors the server's CONNECT_COUNTRIES map. Stripe's
// cross-border payouts only reach connected accounts in the US, UK, EEA, CA and
// CH. Keys are lowercased country names and ISO2 codes, matching the free-text
// `location.country` the app stores. The client doesn't need the ISO2 values the
// server maps to, only membership.
//
// There is no enable/disable flag: Connect is the only rail outside Nigeria, so
// turning it off would strand every non-Nigerian seller at once. To pause a
// country, remove it here and on the server together.
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
  return CONNECT_COUNTRIES.has(country);
}

/**
 * Which payout provider a vendor in `country` uses. Mirrors the server's
 * getSettlementProvider: Nigeria → Paystack, the cross-border footprint →
 * Stripe Connect, everyone else → null (no rail reaches them).
 */
export function payoutProviderForCountry(country?: string): PayoutProvider | null {
  const c = (country || "").trim().toLowerCase();
  if (isPaystackCountry(c)) return "paystack";
  if (isConnectCountry(c)) return "stripe";
  return null;
}

/**
 * Whether payouts are available in `country` at all. Use this to tell the
 * permanent "not in your country yet" state apart from the fixable "finish your
 * setup" one — they need different copy and only one of them has a CTA.
 */
export function payoutSupportedForCountry(country?: string): boolean {
  return payoutProviderForCountry(country) !== null;
}

/**
 * Whether we know where this user is. An account with no country falls into the
 * same `null` provider bucket as a genuinely unsupported one, and most accounts
 * have no country — social sign-in never asks, and Settings only writes one
 * after a successful GPS reverse-geocode. Screens MUST branch on this before
 * showing "payouts aren't available in your country": unknown is fixable and
 * gets a CTA, unsupported is permanent and doesn't.
 */
export function payoutCountryKnown(country?: string): boolean {
  return !!(country || "").trim();
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
  stripe: "/stripe-connect-onboarding",
};

/** Onboarding-status endpoint for each rail. Both return the same shape. */
export const PAYOUT_STATUS_ENDPOINTS: Record<PayoutProvider, string> = {
  paystack: "/paystack/connect/status",
  stripe: "/stripe/connect/status",
};

/**
 * Onboarding screen route for a vendor in `country`, or null when no rail
 * reaches them. Callers MUST handle null — routing to an onboarding screen that
 * can't succeed is the exact dead end the Wise rail used to create.
 */
export function payoutOnboardingRoute(country?: string): string | null {
  const provider = payoutProviderForCountry(country);
  return provider ? PAYOUT_ONBOARDING_ROUTES[provider] : null;
}

/**
 * Copy for a seller whose country has no payout rail. Kept here so the wording
 * stays identical everywhere it surfaces.
 */
export function payoutUnavailableMessage(country?: string): string {
  if (!payoutCountryKnown(country)) {
    return `Set your location so we can send you your money — tap here, then ` +
      `"Use my current location" in Settings.`;
  }
  return `Payouts aren't available in ${(country || "").trim()} yet. ` +
    `You can still publish free events and guides — we'll let you know the moment ` +
    `payouts launch where you are.`;
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

/**
 * Thousands-separated amount with no currency symbol. "1000" → "1,000".
 * Trailing ".00" is dropped, so whole amounts read cleanly.
 *
 * This is the implementation behind useFormatPrice(). It exists as a PURE
 * function because the hook can't be called from module-level render helpers
 * (MessageBubble, list item renderers defined outside a component) — which is
 * exactly why those call sites hardcoded "$" instead of formatting properly.
 */
export function formatAmount(value?: number | string | null): string {
  if (value === undefined || value === null || value === "") return "0";

  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numeric)) return "0";

  const [integerPart, decimalPart] = numeric.toFixed(2).split(".");
  const withSeparators = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decimalPart === "00" ? withSeparators : `${withSeparators}.${decimalPart}`;
}

/**
 * Amount with its currency symbol: formatMoney(12500, "NGN") → "₦12,500".
 * Defaults to USD when the currency is unknown, matching currencyPrefix.
 *
 * Always pass the item's OWN currency (guide.currency, event.currency, …) — a
 * seller's prices are denominated in their selling currency, not the viewer's.
 */
export function formatMoney(value?: number | string | null, currency?: string): string {
  return `${currencyPrefix(currency)}${formatAmount(value)}`;
}

/**
 * Price for display, with free items labelled rather than shown as a zero.
 * priceLabel(0) → "FREE"; priceLabel(15000, "NGN") → "₦15,000".
 */
export function priceLabel(
  price?: number | null,
  currency?: string,
  freeLabel = "FREE"
): string {
  if (price === 0 || price === null || price === undefined) return freeLabel;
  return formatMoney(price, currency);
}
