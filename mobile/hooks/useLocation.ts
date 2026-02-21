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
          "NightVibe needs access to your location to show nearby vendors and events. Please enable location access in your device settings.",
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
