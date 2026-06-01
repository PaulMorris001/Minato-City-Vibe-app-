import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../constants/colors";
import Button from "../components/ui/Button";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid admin credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>CityVibe</span>
          <span style={styles.adminBadge}>Admin</span>
        </div>
        <h2 style={styles.heading}>Sign in to continue</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 8 }}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: colors.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: "36px 32px",
    width: "100%",
    maxWidth: 380,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  logoIcon: { fontSize: 24, color: colors.primary },
  logoText: { fontSize: 18, fontWeight: 700, color: colors.text },
  adminBadge: {
    fontSize: 10,
    fontWeight: 600,
    background: colors.primaryDim,
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: 4,
    padding: "2px 6px",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 24,
  },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: colors.textMuted },
  input: {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    color: colors.text,
    outline: "none",
  },
  error: {
    fontSize: 13,
    color: colors.error,
    background: colors.errorDim,
    border: `1px solid ${colors.error}`,
    borderRadius: 6,
    padding: "8px 12px",
  },
};
