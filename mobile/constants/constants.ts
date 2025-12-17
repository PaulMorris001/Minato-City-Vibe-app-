import Constants from "expo-constants";

/**
 * Get the API base URL
 * Set USE_LOCAL to true for local development, false for deployed backend
 */
const USE_LOCAL = false; // Toggle this: true = local, false = Render

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
