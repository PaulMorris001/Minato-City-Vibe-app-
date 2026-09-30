import { useState } from "react";
import { api } from "../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Guest email confirmation: an emailed code swaps for a short-lived guest token,
 * so checkout and free RSVPs work without an account. Shared by Pay and
 * EventDetails.
 */
export default function GuestEmailGate({
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
