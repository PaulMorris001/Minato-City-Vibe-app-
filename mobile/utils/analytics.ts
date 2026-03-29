import { BASE_URL } from "@/constants/constants";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

export type AnalyticsEvent =
  | "event_viewed"
  | "event_rsvp"
  | "ticket_purchased"
  | "chat_opened"
  | "message_sent"
  | "event_created"
  | "search_performed";

export async function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, any>
): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return;

    fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        message: event,
        level: "info",
        context: properties || {},
        deviceInfo: {
          platform: Platform.OS,
          osVersion: String(Platform.Version ?? ""),
          appVersion: Constants.expoConfig?.version ?? "unknown",
        },
      }),
    }).catch(() => {}); // fire-and-forget, ignore all errors
  } catch {
    // analytics should never crash the app
  }
}
