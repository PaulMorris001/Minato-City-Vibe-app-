import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { money, formatDateTime } from "../lib/format";
import type { EventItem } from "../lib/types";

interface PaymentsConfig {
  stripePublishableKey: string;
  paystackPublicKey: string;
}

// Mirrors the mobile provider rule: Nigerian sellers price in NGN and collect
// via Paystack; everyone else charges USD via Stripe. The event's `currency`
// tells us which upfront (it's set server-side from the organizer's country),
// so we can render the right form without a round-trip.
function providerFor(currency?: string): "stripe" | "paystack" {
  return (currency || "USD").toUpperCase() === "NGN" ? "paystack" : "stripe";
}

export default function Pay() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const tierId = params.get("tier") || undefined;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ev, setEv] = useState<EventItem | null>(null);
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Set once the ticket is issued — swaps the form for the success screen
  // (which is where we push people to the app, since the QR lives there).
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login", { state: { from: `/events/${eventId}/pay` }, replace: true });
      return;
    }
    Promise.all([
      api<{ event: EventItem }>(`/events/${eventId}`),
      api<PaymentsConfig>("/payments/config", { auth: false }),
    ])
      .then(([{ event }, c]) => {
        setEv(event);
        setConfig(c);
        document.title = `Pay – ${event.title}`;
      })
      .catch((err) => setError(err.message || "Couldn't load checkout"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const amount = useMemo(() => {
    if (!ev) return 0;
    const tiers = ev.ticketTiers || [];
    if (tierId) return tiers.find((t) => t._id === tierId)?.price ?? 0;
    if (tiers.length === 1) return tiers[0].price;
    return ev.ticketPrice || 0;
  }, [ev, tierId]);

  if (loading) {
    return (
      <Layout>
        <p className="cv-muted">Loading checkout…</p>
      </Layout>
    );
  }
  if (error || !ev || !config) {
    return (
      <Layout>
        <div className="cv-error">{error || "Checkout unavailable"}</div>
      </Layout>
    );
  }

  const provider = providerFor(ev.currency);
  const tierName = (ev.ticketTiers || []).find((t) => t._id === tierId)?.name;

  // ── Paid: confirmation + "get the app" ─────────────────────────────────────
  if (paid) {
    return (
      <Layout>
        <div style={{ maxWidth: 640 }}>
          <div className="cv-panel cv-section">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎟️</div>
            <h1 className="cv-h1">You're in!</h1>
            <p className="cv-h2" style={{ marginBottom: 20 }}>
              Your ticket to <strong>{ev.title}</strong> is confirmed. We've emailed your receipt.
            </p>

            <div className="cv-row" style={{ marginBottom: 10 }}>
              <span className="cv-muted">Event</span>
              <span>{formatDateTime(ev.date)}</span>
            </div>
            <div className="cv-row" style={{ marginBottom: 10 }}>
              <span className="cv-muted">Where</span>
              <span>{ev.isVirtual ? "Online" : ev.location}</span>
            </div>
            {tierName && (
              <div className="cv-row" style={{ marginBottom: 10 }}>
                <span className="cv-muted">Ticket</span>
                <span>{tierName}</span>
              </div>
            )}
            <div className="cv-row">
              <span className="cv-muted">Paid</span>
              <strong>{money(amount, ev.currency)}</strong>
            </div>
          </div>

          <div className="cv-section">
            <AppPromo variant="ticket" />
          </div>

          <div className="cv-chips">
            <Link className="cv-btn cv-btn-ghost cv-btn-inline" to="/profile">
              View my tickets
            </Link>
            <Link className="cv-btn cv-btn-ghost cv-btn-inline" to={`/events/${eventId}`}>
              Back to event
            </Link>
            <Link className="cv-btn cv-btn-ghost cv-btn-inline" to="/events">
              Browse more events
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="cv-h1">Checkout</h1>
      <p className="cv-h2">{ev.title}</p>

      <div className="cv-card" style={{ maxWidth: 480, marginLeft: 0 }}>
        <div className="cv-row" style={{ marginBottom: 8 }}>
          <span className="cv-muted">{tierName || "General admission"}</span>
          <span className="cv-muted">{formatDateTime(ev.date)}</span>
        </div>
        <div className="cv-row" style={{ marginBottom: 20 }}>
          <span className="cv-muted">Total</span>
          <strong style={{ fontSize: 22 }}>{money(amount, ev.currency)}</strong>
        </div>

        {provider === "stripe" ? (
          <StripeCheckout
            eventId={eventId!}
            tierId={tierId}
            publishableKey={config.stripePublishableKey}
            onPaid={() => setPaid(true)}
          />
        ) : (
          <PaystackCheckout eventId={eventId!} tierId={tierId} onPaid={() => setPaid(true)} />
        )}
      </div>
    </Layout>
  );
}

// ── Stripe (USD) ─────────────────────────────────────────────────────────────

const stripeCache: Record<string, Promise<Stripe | null>> = {};
function stripePromiseFor(key: string) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
}

function StripeCheckout({
  eventId,
  tierId,
  publishableKey,
  onPaid,
}: {
  eventId: string;
  tierId?: string;
  publishableKey: string;
  onPaid: () => void;
}) {
  if (!publishableKey) {
    return <div className="cv-error">Card payments aren't configured.</div>;
  }
  return (
    <Elements stripe={stripePromiseFor(publishableKey)}>
      <StripeForm eventId={eventId} tierId={tierId} onPaid={onPaid} />
    </Elements>
  );
}

function StripeForm({
  eventId,
  tierId,
  onPaid,
}: {
  eventId: string;
  tierId?: string;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setError("");
    setBusy(true);
    try {
      // 1. Server creates the PaymentIntent and returns its client secret.
      const init = await api<{ provider: string; clientSecret: string }>(
        `/payments/init/ticket/${eventId}`,
        { method: "POST", body: tierId ? { tierId } : {} }
      );

      // 2. Confirm the card on the client.
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card details are missing.");
      const result = await stripe.confirmCardPayment(init.clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        setError(result.error.message || "Your card was declined.");
        return;
      }
      const reference = result.paymentIntent?.id;
      if (!reference) throw new Error("Payment could not be verified.");

      // 3. Server verifies + issues the ticket.
      await api(`/payments/confirm/ticket/${eventId}`, {
        method: "POST",
        body: { provider: "stripe", reference, ...(tierId ? { tierId } : {}) },
      });
      onPaid();
    } catch (err: any) {
      setError(err.message || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="cv-error">{error}</div>}
      <label className="cv-label">Card details</label>
      <div
        style={{
          background: "#111827",
          border: "1px solid #374151",
          borderRadius: 10,
          padding: "14px",
          marginBottom: 16,
        }}
      >
        <CardElement
          options={{
            style: {
              base: { color: "#e5e7eb", fontSize: "16px", "::placeholder": { color: "#6b7280" } },
              invalid: { color: "#fca5a5" },
            },
          }}
        />
      </div>
      <button className="cv-btn" onClick={pay} disabled={busy || !stripe}>
        {busy ? "Processing…" : "Pay now"}
      </button>
    </>
  );
}

// ── Paystack (NGN) ───────────────────────────────────────────────────────────

function PaystackCheckout({
  eventId,
  tierId,
  onPaid,
}: {
  eventId: string;
  tierId?: string;
  onPaid: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The server initializes a Paystack transaction and returns its hosted
  // `paymentLink` (authorization_url). Paystack's callback targets the mobile
  // app scheme, so on web we open the hosted page in a popup and detect success
  // by polling our own confirm endpoint (which verifies the charge with
  // Paystack) rather than relying on the redirect coming back.
  function pollConfirm(reference: string, win: Window | null) {
    let ticks = 0;
    let closedTicks = 0;
    const timer = setInterval(async () => {
      ticks++;
      try {
        await api(`/payments/confirm/ticket/${eventId}`, {
          method: "POST",
          body: { provider: "paystack", reference, ...(tierId ? { tierId } : {}) },
        });
        clearInterval(timer);
        try {
          if (win && !win.closed) win.close();
        } catch {}
        onPaid();
      } catch {
        // Not paid yet — verify returns non-success. Keep waiting.
        if (win && win.closed) {
          closedTicks++;
          // A couple of grace polls after the user closes the popup, then stop.
          if (closedTicks >= 2) {
            clearInterval(timer);
            setBusy(false);
          }
        }
        if (ticks >= 100) {
          // ~5 min cap.
          clearInterval(timer);
          setBusy(false);
          setError(
            "We couldn't confirm your payment. If you were charged, it may still come through — contact support if your ticket doesn't appear."
          );
        }
      }
    }, 3000);
  }

  async function pay() {
    setError("");
    setBusy(true);
    // Open the popup synchronously inside the click gesture so it isn't blocked.
    const win = window.open("", "cv_paystack", "width=480,height=760");
    if (!win) {
      setBusy(false);
      setError("Please allow pop-ups for this site to pay with Paystack, then try again.");
      return;
    }
    win.document.write("<p style='font-family:sans-serif;padding:24px'>Starting secure checkout…</p>");
    try {
      const init = await api<{ reference: string; paymentLink?: string }>(
        `/payments/init/ticket/${eventId}`,
        { method: "POST", body: tierId ? { tierId } : {} }
      );
      if (!init.paymentLink) throw new Error("Couldn't start Paystack checkout.");
      win.location.href = init.paymentLink;
      pollConfirm(init.reference, win);
    } catch (err: any) {
      try {
        win.close();
      } catch {}
      setError(err.message || "Payment failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="cv-error">{error}</div>}
      <button className="cv-btn" onClick={pay} disabled={busy}>
        {busy ? "Waiting for payment…" : "Pay with Paystack"}
      </button>
      {busy && (
        <p className="cv-muted" style={{ marginTop: 12, fontSize: 13 }}>
          Complete your payment in the Paystack window. This page will update
          automatically once it goes through.
        </p>
      )}
    </>
  );
}
