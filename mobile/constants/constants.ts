import Constants from "expo-constants";

const getBaseUrl = () => {
  // Explicit override always wins (useful for testing prod from dev)
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }

  // In development builds, point to the local server
  if (__DEV__) {
    let host = "localhost";
    if (Constants.expoConfig?.hostUri) {
      host = Constants.expoConfig.hostUri.split(":")[0];
    }
    const port = process.env.EXPO_PUBLIC_API_PORT || "3100";
    return `http://${host}:${port}/api`;
  }

  // Production builds use the deployed backend
  return "https://api.ourcityvibe.com/api";
};

export const BASE_URL = getBaseUrl();

console.log("API Base URL:", BASE_URL);

export const config = {
  apiUrl: BASE_URL,
  socketUrl: BASE_URL.replace("/api", ""),
  isProduction: process.env.NODE_ENV === "production" || !__DEV__,
};

