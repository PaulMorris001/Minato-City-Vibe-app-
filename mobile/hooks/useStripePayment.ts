import { usePaymentSheet } from "@stripe/stripe-react-native";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { BASE_URL } from "@/constants/constants";

interface PaymentResult {
  success: boolean;
  error?: string;
  /** Machine-readable failure code, e.g. "tier_required" → open the tier picker. */
  code?: string;
}

type PurchaseType = "ticket" | "guide" | "booking" | "order";

/**
 * Provider-agnostic payment hook.
 *
 * One flow for every purchase: ask the server which provider the seller uses,
 * run that provider's checkout, then confirm server-side to grant access.
 *  - Stripe: native payment sheet (all non-Nigerian sellers, USD).
 *  - Paystack: hosted checkout opened in a web browser session (Nigerian
 *    sellers, NGN) — no native SDK required.
 *
 * The name is kept as `useStripePayment` for backward compatibility with
 * existing imports; it now covers both providers.
 */
export function useStripePayment() {
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const pay = async (
    type: PurchaseType,
    id: string,
    tierId?: string
  ): Promise<PaymentResult> => {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return { success: false, error: "Not authenticated" };

    // 1. Ask the server how to charge for this item. For tiered events the
    // tierId picks which server-known price applies — the server never trusts
    // a client-sent amount.
    let init: any;
    try {
      const res = await fetch(`${BASE_URL}/payments/init/${type}/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(tierId ? { tierId } : {}),
      });
      init = await res.json();
      if (!res.ok) {
        return { success: false, error: init.message || "Payment setup failed", code: init.code };
      }
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }

    // 2. Run the provider checkout to obtain a payment reference.
    let reference: string;
    if (init.provider === "paystack") {
      const ps = await payWithPaystack(init);
      if (!ps.success) {
        // The browser session can close without handing back the redirect
        // (user tapped Done on the receipt page, return page failed to load…)
        // even though the charge went through. Probe confirm once with the
        // init-time reference — the server verifies with Paystack, so a
        // genuine cancel just comes back unsuccessful and stays quiet.
        if (!ps.error && init.reference) {
          const rescued = await confirmPurchase(type, id, token, {
            provider: "paystack",
            reference: init.reference,
            tierId,
          });
          if (rescued.success) return rescued;
        }
        return ps;
      }
      reference = ps.reference!;
    } else {
      const stripeRes = await payWithStripe(init.clientSecret);
      if (!stripeRes.success) return stripeRes;
      reference = stripeRes.reference!;
    }

    // 3. Confirm server-side — this grants access / issues the ticket.
    return confirmPurchase(type, id, token, {
      provider: init.provider || "stripe",
      reference,
      tierId,
    });
  };

  const confirmPurchase = async (
    type: PurchaseType,
    id: string,
    token: string,
    body: { provider: string; reference: string; tierId?: string }
  ): Promise<PaymentResult> => {
    try {
      const res = await fetch(`${BASE_URL}/payments/confirm/${type}/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return {
          success: false,
          error:
            d.message ||
            "Payment succeeded but access could not be granted. Please contact Support@nvibez.com.",
        };
      }
      return { success: true };
    } catch {
      return {
        success: false,
        error: "Payment succeeded but confirmation failed. Please contact support.",
      };
    }
  };

  // ── Stripe native payment sheet ────────────────────────────────────────────
  const payWithStripe = async (
    clientSecret: string
  ): Promise<PaymentResult & { reference?: string }> => {
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: "CityVibe",
      style: "alwaysDark",
      defaultBillingDetails: {},
    });
    if (initError) return { success: false, error: initError.message };

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === "Canceled") return { success: false };
      return { success: false, error: presentError.message };
    }
    // PaymentIntent id is the part of the client secret before `_secret_`.
    return { success: true, reference: clientSecret.split("_secret_")[0] };
  };

  // ── Paystack hosted checkout ───────────────────────────────────────────────
  const payWithPaystack = async (
    init: any
  ): Promise<PaymentResult & { reference?: string }> => {
    if (!init.paymentLink) return { success: false, error: "Couldn't start checkout." };
    try {
      const result = await WebBrowser.openAuthSessionAsync(init.paymentLink, init.redirectUrl);
      if (result.type !== "success" || !result.url) {
        // User dismissed the browser without finishing.
        return { success: false };
      }
      // Paystack's redirect carries ?trxref=&reference= and no status param —
      // success is decided server-side when confirm verifies the charge.
      const params = parseQuery(result.url);
      const reference = params.reference || params.trxref || init.reference;
      if (!reference) return { success: false, error: "Payment reference missing." };
      return { success: true, reference };
    } catch {
      return { success: false, error: "Checkout could not be opened." };
    }
  };

  const payForTicket = (eventId: string, tierId?: string) => pay("ticket", eventId, tierId);
  const payForGuide = (guideId: string) => pay("guide", guideId);
  const payForBooking = (bookingId: string) => pay("booking", bookingId);
  const payForOrder = (orderId: string) => pay("order", orderId);

  return { payForTicket, payForGuide, payForBooking, payForOrder };
}

/** Parse the query string off a redirect URL into a plain object. */
function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = url.split("?")[1];
  if (!q) return out;
  for (const pair of q.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}
