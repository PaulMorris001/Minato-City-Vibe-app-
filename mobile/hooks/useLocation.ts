import { useState, useEffect } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
}

interface UseLocationResult {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
  permissionStatus: Location.PermissionStatus | null;
  requestPermission: () => Promise<boolean>;
  getCurrentLocation: () => Promise<LocationData | null>;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<Location.PermissionStatus | null>(null);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(status);
    } catch (err) {
      console.error("Error checking location permission:", err);
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "CityVibe needs access to your location to show nearby vendors and events. Please enable location access in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                if (Platform.OS === "ios") {
                  Linking.openURL("app-settings:");
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        return false;
      }

      return true;
    } catch (err) {
      console.error("Error requesting location permission:", err);
      setError("Failed to request location permission");
      return false;
    }
  };

  const getCurrentLocation = async (): Promise<LocationData | null> => {
    setLoading(true);
    setError(null);

    try {
      // Check permission first
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          setLoading(false);
          return null;
        }
      }

      // Get current position
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      // Try to get city and state from reverse geocoding
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (address) {
          locationData.city = address.city || address.subregion || undefined;
          locationData.state = address.region || undefined;
        }
      } catch (geocodeErr) {
        console.warn("Reverse geocoding failed:", geocodeErr);
      }

      setLocation(locationData);
      setLoading(false);
      return locationData;
    } catch (err: any) {
      console.error("Error getting location:", err);
      setError(err.message || "Failed to get location");
      setLoading(false);
      return null;
    }
  };

  return {
    location,
    loading,
    error,
    permissionStatus,
    requestPermission,
    getCurrentLocation,
  };
}

export interface DeviceAddress {
  city: string | null;
  state?: string;
  country?: string;
}

// Resolves the device's current GPS position to a city/state/country via
// reverse geocoding. Assumes location permission has already been granted —
// callers own the permission-request flow (home feed banner vs. Settings'
// "Use my current location" button want slightly different prompt copy),
// then call this to do the actual GPS + reverse-geocode work identically
// either way.
export async function getAddressFromCurrentPosition(): Promise<DeviceAddress | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [address] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    return {
      city: address?.city || address?.subregion || address?.region || null,
      state: address?.region || undefined,
      country: address?.country || undefined,
    };
  } catch {
    return null;
  }
}

// City-only convenience wrapper for callers (the home feed) that don't need
// state/country.
export async function getCityFromCurrentPosition(): Promise<string | null> {
  const address = await getAddressFromCurrentPosition();
  return address?.city || null;
}

async function fetchWithTimeout(url: string, init?: RequestInit, ms = 5000): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Approximate the user's coordinates from their network connection (IP
// address) — no device permission required. Tries ipapi.co first, falling
// back to ipwho.is since free IP-geolocation tiers are rate-limited and
// occasionally miss.
async function getConnectionCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  const primary = await fetchWithTimeout("https://ipapi.co/json/");
  if (primary) {
    const data = await primary.json().catch(() => null);
    if (data && !data.error && typeof data.latitude === "number" && typeof data.longitude === "number") {
      return { latitude: data.latitude, longitude: data.longitude };
    }
  }

  const secondary = await fetchWithTimeout("https://ipwho.is/");
  if (secondary) {
    const data = await secondary.json().catch(() => null);
    if (data && data.success !== false && typeof data.latitude === "number" && typeof data.longitude === "number") {
      return { latitude: data.latitude, longitude: data.longitude };
    }
  }

  return null;
}

// Markets CityVibe actively has content for — same list the backend uses to
// ingest external events (server/src/jobs/externalEventsRefresh.job.js).
// IP geolocation is coarse (often resolves to an ISP hub tens of km from the
// user, or the wrong suburb entirely), so instead of trusting its raw city
// label we snap to whichever of these known cities is closest — a city the
// user will actually find content in, not an obscure suburb name.
export const POPULAR_CITIES: { city: string; state?: string; latitude: number; longitude: number }[] = [
  { city: "New York", state: "NY", latitude: 40.7128, longitude: -74.006 },
  { city: "Los Angeles", state: "CA", latitude: 34.0522, longitude: -118.2437 },
  { city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298 },
  { city: "Las Vegas", state: "NV", latitude: 36.1699, longitude: -115.1398 },
  { city: "Atlanta", state: "GA", latitude: 33.749, longitude: -84.388 },
  { city: "Miami", state: "FL", latitude: 25.7617, longitude: -80.1918 },
  { city: "Dallas", state: "TX", latitude: 32.7767, longitude: -96.797 },
  { city: "Houston", state: "TX", latitude: 29.7604, longitude: -95.3698 },
  { city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 },
  { city: "Nashville", state: "TN", latitude: 36.1627, longitude: -86.7816 },
  { city: "Lagos", latitude: 6.5244, longitude: 3.3792 },
  { city: "Abuja", latitude: 9.0765, longitude: 7.3986 },
  { city: "Port Harcourt", latitude: 4.8156, longitude: 7.0498 },
  { city: "Ibadan", latitude: 7.3775, longitude: 3.947 },
  { city: "Kano", latitude: 12.0022, longitude: 8.592 },
  { city: "Benin City", latitude: 6.335, longitude: 5.6037 },
  { city: "Kaduna", latitude: 10.5105, longitude: 7.4165 },
  { city: "Enugu", latitude: 6.5244, longitude: 7.5086 },
  { city: "Jos", latitude: 9.8965, longitude: 8.8583 },
  { city: "Onitsha", latitude: 6.1667, longitude: 6.7833 },
];

function nearestPopularCity(latitude: number, longitude: number) {
  let nearest = POPULAR_CITIES[0];
  let nearestDistance = calculateDistance(latitude, longitude, nearest.latitude, nearest.longitude);
  for (const candidate of POPULAR_CITIES.slice(1)) {
    const distance = calculateDistance(latitude, longitude, candidate.latitude, candidate.longitude);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// Approximate the user's city from their network connection (IP address) —
// no device permission required. Used as the app's default location on a
// user's first visit, before they've granted (or declined) precise device
// location, so the home feed opens to "near me" instead of "All". Snaps to
// the closest city CityVibe actively has content for, rather than an IP
// database's raw (and often noisy) city guess.
export async function getApproximateLocation(): Promise<{
  city: string | null;
  state?: string;
  latitude?: number;
  longitude?: number;
} | null> {
  const coords = await getConnectionCoordinates();
  if (!coords) return null;

  const nearest = nearestPopularCity(coords.latitude, coords.longitude);
  return { city: nearest.city, state: nearest.state, latitude: coords.latitude, longitude: coords.longitude };
}

// Calculate distance between two coordinates in kilometers
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Format distance for display
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}
