import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";

type Step = "email" | "code" | "password";

/**
 * Password reset, the web twin of mobile's forgot-password → verify-otp →
 * reset-password screens: same three endpoints, collapsed into one page. The
 * code proves the inbox is theirs and swaps for a short-lived `resetToken`,
 * which is what the final call actually authorises against.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  // Carried through so someone sent to log in mid-RSVP still lands back on the event.
  const from: string | undefined = (location.state as any)?.from;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      await api("/auth/forgot-password", { method: "POST", auth: false, body: { email: cleanEmail } });
      if (step === "email") setStep("code");
      else setInfo("A new code is on its way to your inbox.");
    } catch (err: any) {
      setError(
        err.status === 404
          ? "That email isn't registered."
          : err.message || "Couldn't send the code. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const res = await api<{ resetToken: string }>("/auth/verify-otp", {
        method: "POST",
        auth: false,
        body: { email: cleanEmail, otp: otp.trim() },
      });
      setResetToken(res.resetToken);
      setStep("password");
    } catch (err: any) {
      setError(
        err.status === 410
          ? "That code has expired. Request a new one."
          : err.message || "That code didn't work. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: { email: cleanEmail, resetToken, newPassword },
      });
      navigate("/login", { replace: true, state: { from, notice: "password-reset" } });
    } catch (err: any) {
      setError(err.message || "Couldn't reset your password. Please start again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="cv-card">
        {step === "email" && (
          <>
            <h1>Forgot your password?</h1>
            <p className="sub">Enter your email and we'll send you a code to reset it.</p>
            {error && <div className="cv-error">{error}</div>}
            <form onSubmit={sendCode}>
              <label className="cv-label">Email</label>
              <input
                className="cv-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button className="cv-btn" type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send code"}
              </button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <h1>Check your email</h1>
            <p className="sub">
              Enter the 6-digit code we sent to <strong>{cleanEmail}</strong>.
            </p>
            {error && <div className="cv-error">{error}</div>}
            {info && <div className="cv-success">{info}</div>}
            <form onSubmit={verifyCode}>
              <label className="cv-label">Code</label>
              <input
                className="cv-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
              <button className="cv-btn" type="submit" disabled={submitting || otp.length !== 6}>
                {submitting ? "Verifying…" : "Verify code"}
              </button>
            </form>
            <p className="cv-muted cv-center" style={{ marginTop: 16 }}>
              <button type="button" className="cv-linkbtn" onClick={() => sendCode()} disabled={submitting}>
                Resend code
              </button>
            </p>
          </>
        )}

        {step === "password" && (
          <>
            <h1>Choose a new password</h1>
            <p className="sub">
              At least 8 characters, with upper and lower case letters, a number and a symbol.
            </p>
            {error && <div className="cv-error">{error}</div>}
            <form onSubmit={resetPassword}>
              <label className="cv-label">New password</label>
              <input
                className="cv-input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <label className="cv-label">Confirm password</label>
              <input
                className="cv-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button className="cv-btn" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Reset password"}
              </button>
            </form>
          </>
        )}

        <p className="cv-muted cv-center" style={{ marginTop: 20 }}>
          <Link to="/login" state={{ from }} className="cv-link">Back to log in</Link>
        </p>
      </div>
    </Layout>
  );
}
