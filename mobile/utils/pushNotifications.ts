import messaging from "@react-native-firebase/messaging";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

export async function registerForPushNotifications() {
  console.log("[PushNotif] Starting Firebase registration...");

  if (!Device.isDevice) {
    console.log("[PushNotif] Skipped — not a physical device");
    return;
  }

  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) {
    console.log("[PushNotif] Permission denied — aborting");
    return;
  }

  let token: string;
  try {
    token = await messaging().getToken();
    console.log("[PushNotif] Got FCM token:", token);
  } catch (err) {
    console.error("[PushNotif] Could not get FCM token:", err);
    return;
  }

  const authToken = await SecureStore.getItemAsync("token");
  console.log("[PushNotif] Auth token present:", !!authToken);

  if (authToken && token) {
    try {
      const res = await fetch(`${BASE_URL}/notifications/token`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
      console.log("[PushNotif] FCM token saved to backend, status:", res.status);
    } catch (err) {
      console.error("[PushNotif] Failed to save token to backend:", err);
    }
  } else {
    console.log("[PushNotif] Skipped backend save — authToken:", !!authToken, "token:", !!token);
  }
}

/**
 * Remove this device's push token from the currently logged-in account.
 * Must be called BEFORE the auth token is cleared on logout, otherwise the
 * request is unauthenticated. Without this, the same device token stays
 * attached to every account that has ever logged in on it, so a single push
 * gets delivered once per account (e.g. duplicate messages in a shared group).
 */
export async function unregisterForPushNotifications() {
  const authToken = await SecureStore.getItemAsync("token");
  if (!authToken) {
    console.log("[PushNotif] Skipped unregister — no auth token");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/notifications/token`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    console.log("[PushNotif] FCM token removed from backend, status:", res.status);
  } catch (err) {
    console.error("[PushNotif] Failed to remove token from backend:", err);
  }
}
