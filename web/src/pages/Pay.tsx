import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import Layout from "../components/Layout";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { money, formatDateTime } from "../lib/format";
import type { EventItem, EventTier } from "../lib/types";

interface PaymentsConfig {
  stripePublishableKey: string;
  paystackPublicKey: string;
}

// One ticket in the buyer's cart. `tierId` is empty for single-price events.
interface Slot {
  id: string;
  tierId: string;
  tierName: string;
  price: number;
  // Where this pass is emailed: the buyer's own inbox or someone else's.
  mode: "me" | "other";
  email: string;
  confirmEmail: string;
  name: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the mobile provider rule: Nigerian sellers price in NGN and collect
// via Paystack; everyone else charges USD via Stripe.
function providerFor(currency?: string): "stripe" | "paystack" {
  return (currency || "USD").toUpperCase() === "NGN" ? "paystack" : "stripe";
}

let slotSeq = 0;
const nextSlotId = () => `slot_${slotSeq++}`;

export default function Pay() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const preselectTier = params.get("tier") || "";
  const { user } = useAuth();

  const [ev, setEv] = useState<EventItem | null>(null);
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Cart + guest identity.
  const [slots, setSlots] = useState<Slot[]>([]);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [buyerEmail, setBuyerEmail] = useState<string>(user?.email || "");

  // Result after a successful purchase.
  const [result, setResult] = useState<{ recipients: string[] } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ event: EventItem }>(`/events/${eventId}`),
      api<PaymentsConfig>("/payments/config", { auth: false }),
    ])
      .then(([{ event }, c]) => {
        setEv(event);
        setConfig(c);
        document.title = `Get tickets – ${event.title}`;
      })
      .catch((err) => setError(err.message || "Couldn't load checkout"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Keep the buyer email in sync with a logged-in account.
  useEffect(() => {
    if (user?.email) setBuyerEmail(user.email);
  }, [user?.email]);

  // The tiers we sell: real tiers, or a synthetic "General admission" for
  // single-price events (tierId "" → the server treats it as no tier).
  const saleTiers = useMemo<EventTier[]>(() => {
    if (!ev) return [];
    if (ev.ticketTiers && ev.ticketTiers.length) return ev.ticketTiers;
    return [
      {
        _id: "",
        name: "General admission",
        price: ev.ticketPrice ?? 0,
        remaining: ev.ticketsRemaining,
      },
    ];
  }, [ev]);

  // Seed one ticket for the preselected/only tier the first time the event loads.
  useEffect(() => {
    if (!ev || slots.length) return;
    const seed =
      saleTiers.find((t) => t._id === preselectTier) ||
      (saleTiers.length === 1 ? saleTiers[0] : null);
    if (seed && !(seed.remaining !== undefined && seed.remaining <= 0)) {
      setSlots([makeSlot(seed)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev]);

  function makeSlot(t: EventTier): Slot {
    return {
      id: nextSlotId(),
      tierId: t._id,
      tierName: t.name,
      price: t.price,
      mode: "me",
      email: "",
      confirmEmail: "",
      name: "",
    };
  }

  function countFor(tierId: string) {
    return slots.filter((s) => s.tierId === tierId).length;
  }
  function addTicket(t: EventTier) {
    setSlots((prev) => [...prev, makeSlot(t)]);
  }
  function removeTicket(tierId: string) {
    setSlots((prev) => {
      const idx = [...prev].reverse().findIndex((s) => s.tierId === tierId);
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });
  }
  function updateSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  const total = useMemo(() => slots.reduce((sum, s) => sum + s.price, 0), [slots]);

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

  // ── Success ────────────────────────────────────────────────────────────────
  if (result) {
    const unique = Array.from(new Set(result.recipients));
    return (
      <Layout>
        <div style={{ maxWidth: 640 }}>
          <div className="cv-panel cv-section">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎟️</div>
            <h1 className="cv-h1">You're all set!</h1>
            <p className="cv-h2" style={{ marginBottom: 20 }}>
              {result.recipients.length} pass{result.recipients.length === 1 ? "" : "es"} to{" "}
              <strong>{ev.title}</strong> {result.recipients.length === 1 ? "is" : "are"} on the way.
            </p>
            <p className="cv-muted" style={{ marginBottom: 8 }}>
              Each pass — with its QR code to scan at the door — has been emailed to:
            </p>
            <ul style={{ margin: "0 0 8px 18px", padding: 0 }}>
              {unique.map((r) => (
                <li key={r} style={{ marginBottom: 4 }}>
                  <strong>{r}</strong>
                </li>
              ))}
            </ul>
            <p className="cv-muted" style={{ fontSize: 13 }}>
              Don't see it? Check spam, or the promotions tab.
            </p>
          </div>

          <div className="cv-section">
            <AppPromo variant="ticket" />
          </div>

          <div className="cv-chips">
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

  const provider = providerFor(ev.currency);
  const buyerReady = !!user || (!!guestToken && EMAIL_RE.test(buyerEmail));

  // Every "someone else" slot needs a valid, matching email; "me" slots need a
  // confirmed buyer email.
  const recipientsValid =
    slots.length > 0 &&
    slots.every((s) =>
      s.mode === "me"
        ? EMAIL_RE.test(buyerEmail)
        : EMAIL_RE.test(s.email) && s.email.trim().toLowerCase() === s.confirmEmail.trim().toLowerCase()
    );

  const canPay = buyerReady && recipientsValid && total >= 0 && slots.length > 0;

  function buildItems() {
    return slots.map((s) => ({
      tierId: s.tierId || undefined,
      recipientEmail: (s.mode === "me" ? buyerEmail : s.email).trim().toLowerCase(),
      recipientName: s.name.trim() || undefined,
    }));
  }

  return (
    <Layout>
      <Link to={`/events/${eventId}`} className="cv-muted" style={{ display: "inline-block", marginBottom: 12 }}>
        ← Back to event
      </Link>
      <h1 className="cv-h1">Get tickets</h1>
      <p className="cv-h2">{ev.title}</p>
      <p className="cv-muted" style={{ marginBottom: 20 }}>
        {formatDateTime(ev.date)} · {ev.isVirtual ? "Online" : ev.location} · Prices in{" "}
        {ev.currency || "USD"}
      </p>

      <div style={{ maxWidth: 560 }}>
        {/* 1 — Choose tickets */}
        <section className="cv-card cv-section" style={{ marginLeft: 0 }}>
          <h3 className="cv-h3" style={{ marginBottom: 12 }}>
            1. Choose your tickets
          </h3>
          {saleTiers.map((t) => {
            const soldOut = t.remaining !== undefined && t.remaining <= 0;
            const count = countFor(t._id);
            const atCap = t.remaining !== undefined && count >= t.remaining;
            return (
              <div
                key={t._id || "_single"}
                className="cv-row"
                style={{ marginBottom: 12, opacity: soldOut ? 0.5 : 1 }}
              >
                <span>
                  <strong>{t.name}</strong>
                  <span className="cv-muted" style={{ display: "block", fontSize: 13 }}>
                    {money(t.price, ev.currency)}
                    {soldOut
                      ? " · Sold out"
                      : t.remaining !== undefined
                      ? ` · ${t.remaining} left`
                      : ""}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    className="cv-btn cv-btn-ghost cv-btn-inline"
                    style={{ minWidth: 40 }}
                    disabled={count === 0}
                    onClick={() => removeTicket(t._id)}
                    aria-label={`Remove one ${t.name}`}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{count}</span>
                  <button
                    type="button"
                    className="cv-btn cv-btn-ghost cv-btn-inline"
                    style={{ minWidth: 40 }}
                    disabled={soldOut || atCap}
                    onClick={() => addTicket(t)}
                    aria-label={`Add one ${t.name}`}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </section>

        {/* 2 — Who each ticket is for */}
        {slots.length > 0 && (
          <section className="cv-card cv-section" style={{ marginLeft: 0 }}>
            <h3 className="cv-h3" style={{ marginBottom: 4 }}>
              2. Who are they for?
            </h3>
            <p className="cv-muted" style={{ marginBottom: 16, fontSize: 13 }}>
              Send each pass to your own email or straight to the person you're buying for.
            </p>
            {slots.map((s, i) => (
              <div
                key={s.id}
                style={{
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottom: i < slots.length - 1 ? "1px solid #26262e" : undefined,
                }}
              >
                <div className="cv-row" style={{ marginBottom: 10 }}>
                  <strong>
                    Ticket {i + 1}
                    <span className="cv-muted" style={{ fontWeight: 400 }}>
                      {" "}
                      · {s.tierName}
                    </span>
                  </strong>
                  <strong>{money(s.price, ev.currency)}</strong>
                </div>
                <div className="cv-chips" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={`cv-btn cv-btn-inline ${s.mode === "me" ? "" : "cv-btn-ghost"}`}
                    onClick={() => updateSlot(s.id, { mode: "me" })}
                  >
                    Send to me
                  </button>
                  <button
                    type="button"
                    className={`cv-btn cv-btn-inline ${s.mode === "other" ? "" : "cv-btn-ghost"}`}
                    onClick={() => updateSlot(s.id, { mode: "other" })}
                  >
                    Send to someone else
                  </button>
                </div>
                {s.mode === "other" && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      className="cv-input"
                      placeholder="Recipient name (optional)"
                      value={s.name}
                      onChange={(e) => updateSlot(s.id, { name: e.target.value })}
                    />
                    <input
                      className="cv-input"
                      type="email"
                      placeholder="Recipient email"
                      value={s.email}
                      onChange={(e) => updateSlot(s.id, { email: e.target.value })}
                    />
                    <input
                      className="cv-input"
                      type="email"
                      placeholder="Confirm recipient email"
                      value={s.confirmEmail}
                      onChange={(e) => updateSlot(s.id, { confirmEmail: e.target.value })}
                    />
                    {s.email &&
                      s.confirmEmail &&
                      s.email.trim().toLowerCase() !== s.confirmEmail.trim().toLowerCase() && (
                        <span className="cv-error" style={{ fontSize: 13 }}>
                          Emails don't match.
                        </span>
                      )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* 3 — Your email (guests confirm with a code) */}
        {slots.length > 0 && (
          <section className="cv-card cv-section" style={{ marginLeft: 0 }}>
            <h3 className="cv-h3" style={{ marginBottom: 12 }}>
              3. Your email
            </h3>
            {user ? (
              <p className="cv-muted">
                Passes and your receipt go to <strong>{user.email}</strong>.
              </p>
            ) : (
              <GuestEmailGate
                email={buyerEmail}
                setEmail={setBuyerEmail}
                verified={!!guestToken}
                onVerified={(token, email) => {
                  setGuestToken(token);
                  setBuyerEmail(email);
                }}
              />
            )}
          </section>
        )}

        {/* 4 — Pay */}
        {slots.length > 0 && (
          <section className="cv-card cv-section" style={{ marginLeft: 0 }}>
            <div className="cv-row" style={{ marginBottom: 16 }}>
              <span className="cv-muted">
                Total · {slots.length} ticket{slots.length === 1 ? "" : "s"}
              </span>
              <strong style={{ fontSize: 22 }}>{money(total, ev.currency)}</strong>
            </div>

            {!buyerReady && (
              <p className="cv-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                Confirm your email above to continue.
              </p>
            )}

            {provider === "stripe" ? (
              <StripeCheckout
                eventId={eventId!}
                publishableKey={config.stripePublishableKey}
                token={guestToken || undefined}
                buildItems={buildItems}
                disabled={!canPay}
                onPaid={(r) => setResult(r)}
              />
            ) : (
              <PaystackCheckout
                eventId={eventId!}
                token={guestToken || undefined}
                buildItems={buildItems}
                disabled={!canPay}
                onPaid={(r) => setResult(r)}
              />
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}

// ── Guest email confirmation (OTP) ───────────────────────────────────────────

function GuestEmailGate({
  email,
  setEmail,
  verified,
  onVerified,
}: {
  email: string;
  setEmail: (v: string) => void;
  verified: boolean;
  onVerified: (token: string, email: string) => void;
}) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailsMatch = email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();

  if (verified) {
    return (
      <p className="cv-muted">
        Email confirmed ✓ Passes go to <strong>{email}</strong>.
      </p>
    );
  }

  async function sendCode() {
    setError("");
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
    if (!emailsMatch) return setError("Emails don't match.");
    setBusy(true);
    try {
      await api("/payments/guest/start-otp", {
        method: "POST",
        auth: false,
        body: { email: email.trim().toLowerCase() },
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Couldn't send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError("");
    setBusy(true);
    try {
      const res = await api<{ token: string; email: string }>("/payments/guest/verify-otp", {
        method: "POST",
        auth: false,
        body: { email: email.trim().toLowerCase(), otp: otp.trim() },
      });
      onVerified(res.token, res.email);
    } catch (err: any) {
      setError(err.message || "That code didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="cv-muted" style={{ fontSize: 13 }}>
        No account needed — we'll email your pass here. Confirm your email with a quick code.
      </p>
      {error && <div className="cv-error">{error}</div>}
      {!sent ? (
        <>
          <input
            className="cv-input"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="cv-input"
            type="email"
            placeholder="Confirm your email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
          <button className="cv-btn" onClick={sendCode} disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </>
      ) : (
        <>
          <p className="cv-muted" style={{ fontSize: 13 }}>
            Enter the 6-digit code we sent to <strong>{email}</strong>.
          </p>
          <input
            className="cv-input"
            inputMode="numeric"
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <button className="cv-btn" onClick={verify} disabled={busy || otp.trim().length < 4}>
            {busy ? "Verifying…" : "Confirm email"}
          </button>
          <button
            className="cv-btn cv-btn-ghost cv-btn-inline"
            onClick={sendCode}
            disabled={busy}
            style={{ justifySelf: "start" }}
          >
            Resend code
          </button>
        </>
      )}
    </div>
  );
}

// ── Stripe (USD) ─────────────────────────────────────────────────────────────

type PaidResult = { recipients: string[] };
type ItemsPayload = { tierId?: string; recipientEmail: string; recipientName?: string }[];

const stripeCache: Record<string, Promise<Stripe | null>> = {};
function stripePromiseFor(key: string) {
  if (!stripeCache[key]) stripeCache[key] = loadStripe(key);
  return stripeCache[key];
}

function StripeCheckout({
  eventId,
  publishableKey,
  token,
  buildItems,
  disabled,
  onPaid,
}: {
  eventId: string;
  publishableKey: string;
  token?: string;
  buildItems: () => ItemsPayload;
  disabled: boolean;
  onPaid: (r: PaidResult) => void;
}) {
  if (!publishableKey) {
    return <div className="cv-error">Card payments aren't configured.</div>;
  }
  return (
    <Elements stripe={stripePromiseFor(publishableKey)}>
      <StripeForm
        eventId={eventId}
        token={token}
        buildItems={buildItems}
        disabled={disabled}
        onPaid={onPaid}
      />
    </Elements>
  );
}

function StripeForm({
  eventId,
  token,
  buildItems,
  disabled,
  onPaid,
}: {
  eventId: string;
  token?: string;
  buildItems: () => ItemsPayload;
  disabled: boolean;
  onPaid: (r: PaidResult) => void;
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
      const items = buildItems();
      const init = await api<{ clientSecret: string }>(
        `/payments/init/tickets/${eventId}`,
        { method: "POST", body: { items }, token }
      );
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card details are missing.");
      const res = await stripe.confirmCardPayment(init.clientSecret, {
        payment_method: { card },
      });
      if (res.error) {
        setError(res.error.message || "Your card was declined.");
        return;
      }
      const reference = res.paymentIntent?.id;
      if (!reference) throw new Error("Payment could not be verified.");
      const done = await api<{ recipients: string[] }>(
        `/payments/confirm/tickets/${eventId}`,
        { method: "POST", body: { provider: "stripe", reference }, token }
      );
      onPaid({ recipients: done.recipients || [] });
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
      <button className="cv-btn" onClick={pay} disabled={busy || disabled || !stripe}>
        {busy ? "Processing…" : "Pay now"}
      </button>
    </>
  );
}

// ── Paystack (NGN) ───────────────────────────────────────────────────────────

function PaystackCheckout({
  eventId,
  token,
  buildItems,
  disabled,
  onPaid,
}: {
  eventId: string;
  token?: string;
  buildItems: () => ItemsPayload;
  disabled: boolean;
  onPaid: (r: PaidResult) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function pollConfirm(reference: string, win: Window | null) {
    let ticks = 0;
    let closedTicks = 0;
    let inFlight = false; // never run two confirms at once — avoids double-fulfilling
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      ticks++;
      try {
        const done = await api<{ recipients: string[] }>(
          `/payments/confirm/tickets/${eventId}`,
          { method: "POST", body: { provider: "paystack", reference }, token }
        );
        clearInterval(timer);
        try {
          if (win && !win.closed) win.close();
        } catch {}
        onPaid({ recipients: done.recipients || [] });
      } catch {
        if (win && win.closed) {
          closedTicks++;
          if (closedTicks >= 2) {
            clearInterval(timer);
            setBusy(false);
          }
        }
        if (ticks >= 100) {
          clearInterval(timer);
          setBusy(false);
          setError(
            "We couldn't confirm your payment. If you were charged, your passes may still arrive by email — contact support if they don't."
          );
        }
      } finally {
        inFlight = false;
      }
    }, 3000);
  }

  async function pay() {
    setError("");
    setBusy(true);
    const win = window.open("", "cv_paystack", "width=480,height=760");
    if (!win) {
      setBusy(false);
      setError("Please allow pop-ups for this site to pay with Paystack, then try again.");
      return;
    }
    win.document.write("<p style='font-family:sans-serif;padding:24px'>Starting secure checkout…</p>");
    try {
      const items = buildItems();
      const init = await api<{ reference: string; paymentLink?: string }>(
        `/payments/init/tickets/${eventId}`,
        { method: "POST", body: { items }, token }
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
      <button className="cv-btn" onClick={pay} disabled={busy || disabled}>
        {busy ? "Waiting for payment…" : "Pay with Paystack"}
      </button>
      {busy && (
        <p className="cv-muted" style={{ marginTop: 12, fontSize: 13 }}>
          Complete your payment in the Paystack window. This page updates automatically once it goes
          through.
        </p>
      )}
    </>
  );
}
