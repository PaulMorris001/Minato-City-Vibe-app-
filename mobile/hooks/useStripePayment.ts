import { usePaymentSheet } from "@stripe/stripe-react-native";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

export function useStripePayment() {
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  /**
   * Fetch a PaymentIntent clientSecret from the backend, open the Stripe
   * payment sheet, and return the paymentIntentId on success so the caller
   * can immediately confirm the purchase server-side.
   */
  const pay = async (endpoint: string): Promise<PaymentResult> => {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return { success: false, error: "Not authenticated" };

    // 1. Create PaymentIntent on server
    let clientSecret: string;
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || "Payment setup failed" };
      }
      clientSecret = data.clientSecret;
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }

    // 2. Init payment sheet
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: "NightVibe",
      style: "alwaysDark",
      defaultBillingDetails: {},
    });

    if (initError) {
      return { success: false, error: initError.message };
    }

    // 3. Present sheet — user completes payment
    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === "Canceled") {
        return { success: false };
      }
      return { success: false, error: presentError.message };
    }

    // Extract PaymentIntent ID from the client secret (format: pi_xxx_secret_xxx)
    const paymentIntentId = clientSecret.split("_secret_")[0];

    return { success: true, paymentIntentId };
  };

  const payForTicket = (eventId: string) =>
    pay(`/stripe/payment-intent/ticket/${eventId}`);

  const payForGuide = (guideId: string) =>
    pay(`/stripe/payment-intent/guide/${guideId}`);

  return { payForTicket, payForGuide };
}
