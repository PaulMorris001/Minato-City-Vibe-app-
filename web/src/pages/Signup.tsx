import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export default function Signup() {
  const { register, verifyEmail, needsVerification } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(username, email, password);
      // needsVerification flips true → the OTP step renders below.
    } catch (err: any) {
      setError(err.message || "Couldn't create your account. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await verifyEmail(otp);
      navigate("/events", { replace: true });
    } catch (err: any) {
      setError(err.message || "That code didn't work. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    setError("");
    setInfo("");
    try {
      await api("/auth/resend-signup-otp", { method: "POST" });
      setInfo("A new code is on its way to your inbox.");
    } catch (err: any) {
      setError(err.message || "Couldn't resend the code.");
    }
  }

  return (
    <Layout>
      <div className="cv-card">
        {!needsVerification ? (
          <>
            <h1>Create your account</h1>
            <p className="sub">Sign up to buy tickets to events.</p>
            {error && <div className="cv-error">{error}</div>}
            <form onSubmit={handleRegister}>
              <label className="cv-label">Username</label>
              <input
                className="cv-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourname"
                required
              />
              <label className="cv-label">Email</label>
              <input
                className="cv-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <label className="cv-label">Password</label>
              <input
                className="cv-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                required
              />
              <button className="cv-btn" type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create account"}
              </button>
            </form>
            <p className="cv-muted cv-center" style={{ marginTop: 20 }}>
              Already have an account? <Link to="/login" className="cv-link">Log in</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Verify your email</h1>
            <p className="sub">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to
              finish setting up your account.
            </p>
            {error && <div className="cv-error">{error}</div>}
            {info && <div className="cv-error" style={{ background: "rgba(34,197,94,0.12)", borderColor: "#22c55e", color: "#86efac" }}>{info}</div>}
            <form onSubmit={handleVerify}>
              <label className="cv-label">Verification code</label>
              <input
                className="cv-input"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                required
              />
              <button className="cv-btn" type="submit" disabled={submitting || otp.length !== 6}>
                {submitting ? "Verifying…" : "Verify & continue"}
              </button>
            </form>
            <p className="cv-muted cv-center" style={{ marginTop: 20 }}>
              Didn't get it? <span className="cv-link" onClick={resendCode}>Resend code</span>
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
