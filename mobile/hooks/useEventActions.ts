import { useCallback } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { usePayment } from "@/hooks/usePayment";
import { trackEvent as trackAnalyticsEvent } from "@/utils/analytics";

/**
 * Buying a ticket / joining a free event, shared by every surface that renders
 * a public event card.
 *
 * Both actions send logged-out users to login first, and report success or
 * failure via Alert. `onDone` is called after a successful action so the caller
 * can refresh its feed.
 */
export function useEventActions({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const { payForTicket } = usePayment();

  const purchaseTicket = useCallback(
    async (eventId: string, eventTitle: string, multiVenue?: boolean) => {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.push("/login");
        return;
      }
      // A multi-venue event needs a venue picked before it can be charged for,
      // and a feed card has nowhere to ask — same hand-off as a multi-tier
      // event below.
      if (multiVenue) {
        router.push(`/event/${eventId}`);
        return;
      }
      // The hook runs checkout AND confirms server-side before returning.
      const result = await payForTicket(eventId);
      if (!result.success) {
        if (result.code === "tier_required" || result.code === "negotiation_required") {
          // Multi-tier event — the detail screen owns the tier picker.
          router.push(`/event/${eventId}`);
          return;
        }
        if (result.error) Alert.alert("Payment Failed", result.error);
        return;
      }
      trackAnalyticsEvent("ticket_purchased", { eventId, eventTitle });
      Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
      onDone?.();
    },
    [payForTicket, router, onDone]
  );

  const joinFreeEvent = useCallback(
    async (eventId: string, eventTitle: string, multiVenue?: boolean) => {
      try {
        const token = await SecureStore.getItemAsync("token");
        if (!token) {
          router.push("/login");
          return;
        }
        // See purchaseTicket: joining without naming a venue would leave the
        // organizer's guest list unable to say which door to expect them at.
        if (multiVenue) {
          router.push(`/event/${eventId}`);
          return;
        }
        const res = await fetch(`${BASE_URL}/events/${eventId}/join`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          Alert.alert("Success!", `You've joined "${eventTitle}"`);
          onDone?.();
        } else {
          Alert.alert("Error", data.message || "Failed to join event");
        }
      } catch {
        Alert.alert("Error", "Failed to join event");
      }
    },
    [router, onDone]
  );

  return { purchaseTicket, joinFreeEvent };
}

export default useEventActions;
