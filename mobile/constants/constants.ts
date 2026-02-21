import Constants from "expo-constants";

/**
 * Get the API base URL
 * Set USE_LOCAL to true for local development, false for deployed backend
 */
const USE_LOCAL = true; // Toggle this: true = local, false = Render

const getBaseUrl = () => {
  // Check for explicit environment variable first
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }

  // Use local backend during development
  if (USE_LOCAL) {
    let host = "localhost";
    if (Constants.expoConfig?.hostUri) {
      host = Constants.expoConfig.hostUri.split(":")[0];
    }
    const port = process.env.EXPO_PUBLIC_API_PORT || "3000";
    return `http://${host}:${port}/api`;
  }

  // Use Render backend (for production/testing deployed backend)
  return "https://night-vibe.onrender.com/api";
};

export const BASE_URL = getBaseUrl();

console.log("API Base URL:", BASE_URL);

export const config = {
  apiUrl: BASE_URL,
  socketUrl: BASE_URL.replace("/api", ""),
  isProduction: process.env.NODE_ENV === "production" || !__DEV__,
};

// Static Cities Data
export const CITIES = [
  { _id: "691660f69fce6d48f9f04c98", name: "Boston", state: "Massachusetts" },
  { _id: "691660f69fce6d48f9f04c99", name: "New York City", state: "New York" },
  { _id: "691660f69fce6d48f9f04c9a", name: "Atlanta", state: "Georgia" },
  { _id: "691660f69fce6d48f9f04c9b", name: "Los Angeles", state: "California" },
  { _id: "691660f69fce6d48f9f04c9c", name: "Houston", state: "Texas" },
  { _id: "691660f69fce6d48f9f04c9d", name: "Chicago", state: "Illinois" },
  { _id: "691660f69fce6d48f9f04c9e", name: "Washington", state: "DC" },
  { _id: "691660f69fce6d48f9f04c9f", name: "Miami", state: "Florida" },
  { _id: "691660f69fce6d48f9f04ca0", name: "New Orleans", state: "Louisiana" },
  { _id: "691660f69fce6d48f9f04ca1", name: "Detroit", state: "Michigan" },
  {
    _id: "691660f69fce6d48f9f04ca2",
    name: "San Francisco",
    state: "California",
  },
];

// Static Vendor Types Data
export const VENDOR_TYPES = [
  { _id: "691660f69fce6d48f9f04ca4", name: "Chefs", icon: "restaurant" },
  { _id: "691660f69fce6d48f9f04ca5", name: "Restaurants", icon: "fast-food" },
  {
    _id: "691660f69fce6d48f9f04ca6",
    name: "Music and Bands",
    icon: "musical-notes",
  },
  { _id: "691660f69fce6d48f9f04ca7", name: "Bars and Clubs", icon: "beer" },
  { _id: "691660f69fce6d48f9f04ca8", name: "Casinos", icon: "dice" },
  { _id: "691660f69fce6d48f9f04ca9", name: "Concerts", icon: "mic" },
  { _id: "691660f69fce6d48f9f04caa", name: "Events", icon: "calendar" },
  { _id: "691660f69fce6d48f9f04cab", name: "Transportation", icon: "car" },
  { _id: "691660f69fce6d48f9f04cac", name: "Venues", icon: "business" },
  { _id: "691660f69fce6d48f9f04cad", name: "Florists", icon: "flower" },
  {
    _id: "691660f69fce6d48f9f04cae",
    name: "Decorations",
    icon: "color-palette",
  },
  { _id: "691660f69fce6d48f9f04caf", name: "Desserts", icon: "ice-cream" },
  { _id: "691660f69fce6d48f9f04cb0", name: "Beverages", icon: "wine" },
  {
    _id: "691660f69fce6d48f9f04cb1",
    name: "Other",
    icon: "ellipsis-horizontal",
  },
];
