import { useCallback } from "react";

/**
 * Custom hook for formatting prices with comma separators
 * Adds a comma to every third digit from the right
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
  const formatPrice = useCallback((price: number | string | undefined): string => {
    // Handle undefined, null, or empty values
    if (price === undefined || price === null || price === "") {
      return "0";
    }

    // Convert to number if it's a string
    const numericPrice = typeof price === "string" ? parseFloat(price) : price;

    // Handle invalid numbers
    if (isNaN(numericPrice)) {
      return "0";
    }

    // Split the number into integer and decimal parts
    const parts = numericPrice.toFixed(2).split(".");
    const integerPart = parts[0];
    const decimalPart = parts[1];

    // Add commas to the integer part (every third digit from the right)
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Return formatted price
    // If decimal part is "00", omit it; otherwise include it
    if (decimalPart === "00") {
      return formattedInteger;
    }

    return `${formattedInteger}.${decimalPart}`;
  }, []);

  return formatPrice;
}
