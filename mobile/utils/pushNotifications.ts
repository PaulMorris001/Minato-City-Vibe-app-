import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

/**
 * Request push notification permission, get the Expo push token,
 * and save it to the backend. Safe to call multiple times — no-ops
 * gracefully in Expo Go or if permissions are denied.
 */
export async function registerForPushNotifications() {
  if (!Device.isDevice) return; // Simulators can't receive push notifications

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  let token: string | undefined;
  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: "a1e5c06d-26a5-4e05-89d9-3b9acf9a3ea4",
    });
    token = result.data;
  } catch {
    // Expo Go (SDK 53+) doesn't support remote push tokens — silently skip
    return;
  }

  const authToken = await SecureStore.getItemAsync("token");
  if (authToken && token) {
    try {
      await fetch(`${BASE_URL}/notifications/token`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
    } catch (err) {
      console.error("Failed to save push token:", err);
    }
  }
}
