import { useCallback } from "react";
import { formatAmount } from "../constants/payments";

/**
 * Hook wrapper around `formatAmount` — formats a number with comma separators
 * and no currency symbol.
 *
 * Prefer `formatMoney(value, currency)` or `priceLabel(price, currency)` from
 * constants/payments for anything user-facing: this returns a bare number, so
 * every call site has to supply its own symbol, and historically they all
 * hardcoded "$" regardless of the seller's actual selling currency.
 *
 * @returns A function that formats a number/string as a price with commas
 *
 * @example
 * const formatPrice = useFormatPrice();
 * formatPrice(1000) // "1,000"
 * formatPrice(1234567.89) // "1,234,567.89"
 * formatPrice("5000") // "5,000"
 */
export function useFormatPrice() {
  return useCallback((price: number | string | undefined): string => formatAmount(price), []);
}
