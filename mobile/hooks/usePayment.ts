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

/** One stop of a programme the buyer is checking out. */
export interface ProgrammeItem {
  subEvent: string | null;
  tierId?: string;
  recipientEmail: string;
  recipientName?: string;
}

/**
 * Provider-agnostic payment hook.
 *
 * One flow for every purchase: ask the server which provider the seller uses,
 * run that provider's checkout, then confirm server-side to grant access.
 *  - Stripe: native payment sheet (all non-Nigerian sellers, USD).
 *  - Paystack: hosted checkout in a web browser session (Nigerian sellers, NGN).
 *  - PayPal: hosted approval in a web browser session. Built, but the server
 *    never selects it until PAYPAL_ENABLED is on, so this branch is currently
 *    unreachable.
 *
 * The server owns the choice — this only runs whatever `init.provider` names.
 */
export function usePayment() {
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const pay = async (
    type: PurchaseType,
    id: string,
    tierId?: string,
    discountCode?: string,
    useCoupon?: boolean,
    locationIndex?: number | null
  ): Promise<PaymentResult> => {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return { success: false, error: "Not authenticated" };

    // 1. Ask the server how to charge for this item. For tiered events the
    // tierId picks which server-known price applies — the server never trusts
    // a client-sent amount, and discount codes are validated and priced
    // server-side too. `useCoupon` asks the server to knock the buyer's
    // OurCityVibe coupon balance off an order's total before charging.
    let init: any;
    try {
      const res = await fetch(`${BASE_URL}/payments/init/${type}/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(tierId ? { tierId } : {}),
          ...(discountCode ? { discountCode } : {}),
          ...(useCoupon ? { useCoupon: true } : {}),
          // Which venue of a multi-venue event this ticket is for. Stripe and
          // PayPal keep it on their own payment metadata from here, so their
          // webhooks issue the pass against the right door even if this app
          // never gets to confirm.
          ...(locationIndex != null ? { locationIndex } : {}),
        }),
      });
      init = await res.json();
      if (!res.ok) {
        return { success: false, error: init.message || "Payment setup failed", code: init.code };
      }
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }

    // A 100%-off discount code leaves nothing to charge — the server skips
    // both providers and hands back a free reference. Confirm immediately;
    // the server verifies the reserved redemption really zeroes the price.
    if (init.provider === "none" && init.free) {
      return confirmPurchase(type, id, token, {
        provider: "none",
        reference: init.reference,
        tierId,
        locationIndex,
      });
    }

    // 2. Run the provider checkout to obtain a payment reference.
    if (init.provider === "stripe") {
      const stripeRes = await payWithStripe(init.clientSecret);
      if (!stripeRes.success) return stripeRes;
      return confirmPurchase(type, id, token, {
        provider: "stripe",
        reference: stripeRes.reference!,
        tierId,
        locationIndex,
      });
    }

    // Paystack and PayPal are both hosted checkouts in a browser session, so
    // they share one flow from here.
    const hosted = await payWithHostedCheckout(init);
    if (!hosted.success) {
      // The browser session can close without handing back the redirect
      // (user tapped Done on the receipt page, return page failed to load…)
      // even though the payment went through. Probe confirm once with the
      // init-time reference — the server verifies with the provider, so a
      // genuine cancel just comes back unsuccessful and stays quiet.
      if (!hosted.error && init.reference) {
        const rescued = await confirmPurchase(type, id, token, {
          provider: init.provider,
          reference: init.reference,
          tierId,
          locationIndex,
        });
        if (rescued.success) return rescued;
      }
      return hosted;
    }

    // 3. Confirm server-side — this grants access / issues the ticket, and on
    // PayPal it is also what captures the money.
    return confirmPurchase(type, id, token, {
      provider: init.provider,
      reference: hosted.reference!,
      tierId,
      locationIndex,
    });
  };

  const confirmPurchase = async (
    type: PurchaseType,
    id: string,
    token: string,
    body: {
      provider: string;
      reference: string;
      tierId?: string;
      locationIndex?: number | null;
    }
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
            "Payment succeeded but access could not be granted. Please contact support@ourcityvibe.com.",
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

  // ── Hosted checkout (Paystack, and PayPal once enabled) ────────────────────
  const payWithHostedCheckout = async (
    init: any
  ): Promise<PaymentResult & { reference?: string }> => {
    if (!init.paymentLink) return { success: false, error: "Couldn't start checkout." };
    try {
      const result = await WebBrowser.openAuthSessionAsync(init.paymentLink, init.redirectUrl);
      if (result.type !== "success" || !result.url) {
        // User dismissed the browser without finishing.
        return { success: false };
      }
      const params = parseQuery(result.url);

      // PayPal's cancel_url is the same bounce page with ?cancelled=1, so
      // backing out of the approval still comes back as a "success" redirect.
      // Without this it would look like a completed payment and be confirmed.
      if (params.cancelled === "1") return { success: false };

      // Neither redirect carries a status we can trust: Paystack sends
      // ?trxref=&reference=, PayPal sends ?token=&PayerID=. Whether money moved
      // is decided server-side when confirm verifies (and, for PayPal, captures)
      // the payment.
      const reference = params.reference || params.trxref || params.token || init.reference;
      if (!reference) return { success: false, error: "Payment reference missing." };
      return { success: true, reference };
    } catch {
      return { success: false, error: "Checkout could not be opened." };
    }
  };

  /**
   * A programme checkout: one charge covering every stop the buyer picked,
   * whatever mix of free and paid — the batch rail (`/payments/init/tickets`),
   * not the single-item one above. A programme event refuses the single rail
   * server-side, so this is the only path for buying into one.
   */
  const payForProgramme = async (
    eventId: string,
    items: ProgrammeItem[],
    discountCode?: string,
    offerId?: string
  ): Promise<PaymentResult> => {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return { success: false, error: "Not authenticated" };

    let init: any;
    try {
      const res = await fetch(`${BASE_URL}/payments/init/tickets/${eventId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items, ...(offerId ? { offerId } : {}), ...(discountCode ? { discountCode } : {}) }),
      });
      init = await res.json();
      if (!res.ok) {
        return { success: false, error: init.message || "Payment setup failed", code: init.code };
      }
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }

    const confirmBatch = (body: { provider: string; reference: string }) =>
      confirmPurchaseBatch(eventId, token, body);

    // An all-free selection (every ticked stop is free, or a 100%-off code
    // zeroed the total) — no provider call at all.
    if (init.provider === "none" && init.free) {
      return confirmBatch({ provider: "none", reference: init.reference });
    }

    if (init.provider === "stripe") {
      const stripeRes = await payWithStripe(init.clientSecret);
      if (!stripeRes.success) return stripeRes;
      return confirmBatch({ provider: "stripe", reference: stripeRes.reference! });
    }

    const hosted = await payWithHostedCheckout(init);
    if (!hosted.success) {
      if (!hosted.error && init.reference) {
        const rescued = await confirmBatch({ provider: init.provider, reference: init.reference });
        if (rescued.success) return rescued;
      }
      return hosted;
    }
    return confirmBatch({ provider: init.provider, reference: hosted.reference! });
  };

  const confirmPurchaseBatch = async (
    eventId: string,
    token: string,
    body: { provider: string; reference: string }
  ): Promise<PaymentResult> => {
    try {
      const res = await fetch(`${BASE_URL}/payments/confirm/tickets/${eventId}`, {
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
            "Payment succeeded but access could not be granted. Please contact support@ourcityvibe.com.",
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

  const payForTicket = (
    eventId: string,
    tierId?: string,
    discountCode?: string,
    locationIndex?: number | null
  ) => pay("ticket", eventId, tierId, discountCode, undefined, locationIndex);
  const payForGuide = (guideId: string) => pay("guide", guideId);
  const payForBooking = (bookingId: string) => pay("booking", bookingId);
  const payForOrder = (orderId: string, useCoupon?: boolean) =>
    pay("order", orderId, undefined, undefined, useCoupon);

  return { payForTicket, payForGuide, payForBooking, payForOrder, payForProgramme };
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
