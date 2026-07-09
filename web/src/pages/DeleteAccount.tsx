import { useEffect, useState, type FormEvent } from "react";
import { API_BASE } from "../config";

// Mirrors the look of the original server-rendered delete-account page, but
// submits to the backend's JSON endpoint instead of doing a form POST that
// returns a full HTML page.
export default function DeleteAccount() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Delete Account – OurCityvibe";
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDone(true);
      } else {
        setError(data.message || "Something went wrong. Please try again later.");
      }
    } catch {
      setError("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{css}</style>
      <div className="card">
        {done ? (
          <div style={{ textAlign: "center" }}>
            <div className="icon">✓</div>
            <h1>Account Deleted</h1>
            <p>
              Your OurCityvibe account and all associated data have been permanently
              deleted. We're sorry to see you go.
            </p>
          </div>
        ) : (
          <>
            <h1>Delete Account</h1>
            <p>
              Permanently delete your OurCityvibe account and all associated data. This
              action cannot be undone.
            </p>
            {error ? <div className="message">{error}</div> : null}
            <div className="warning">
              ⚠️ This will permanently delete your profile, event history, messages,
              and all data linked to your account.
            </div>
            <form onSubmit={handleSubmit}>
              <label>Email address</label>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label>Password</label>
              <input
                type="password"
                name="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={submitting}>
                {submitting ? "Deleting…" : "Delete My Account"}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d0d1a;
    color: #e5e7eb;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #1f1f2e;
    border: 1px solid #374151;
    border-radius: 16px;
    padding: 40px;
    max-width: 420px;
    width: 100%;
  }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
  p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
  label { display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px; }
  input {
    width: 100%;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 10px;
    color: #e5e7eb;
    font-size: 15px;
    padding: 12px 14px;
    margin-bottom: 16px;
    outline: none;
  }
  input:focus { border-color: #a855f7; }
  button {
    width: 100%;
    background: #dc2626;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    padding: 14px;
    cursor: pointer;
    margin-top: 4px;
  }
  button:hover { background: #b91c1c; }
  button:disabled { opacity: 0.6; cursor: default; }
  .message {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    margin-bottom: 20px;
    background: rgba(220,38,38,0.15);
    border: 1px solid #dc2626;
    color: #fca5a5;
  }
  .warning {
    background: rgba(245,158,11,0.1);
    border: 1px solid #f59e0b;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    color: #fcd34d;
    margin-bottom: 20px;
  }
  .icon { font-size: 48px; margin-bottom: 16px; }
`;
