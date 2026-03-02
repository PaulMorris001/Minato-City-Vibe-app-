import Expo from "expo-server-sdk";

const expo = new Expo();

/**
 * Send a push notification to a single Expo push token.
 * Silently no-ops if the token is missing or invalid.
 */
export async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) return;

  const message = {
    to: pushToken,
    title,
    body,
    data,
    sound: "default",
  };

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([message]);
    if (ticket.status === "error") {
      console.error("Push notification ticket error:", ticket.message);
    }
  } catch (err) {
    console.error("Push notification send error:", err);
  }
}
