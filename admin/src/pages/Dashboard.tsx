import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { Stats } from "../types";
import StatCard from "../components/ui/StatCard";
import { colors } from "../constants/colors";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getStats().then((r) => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (loading) return <div style={styles.loading}>Loading...</div>;
  if (!stats) return null;

  return (
    <div style={styles.page}>
      <div style={styles.statsRow}>
        <StatCard label="Total Users" value={stats.totalUsers} icon="👥" accent={colors.primary} />
        <StatCard label="Vendors" value={stats.totalVendors} icon="🏪" accent={colors.success} />
        <StatCard label="Events" value={stats.totalEvents} icon="📅" accent={colors.warning} />
        <StatCard label="Guides" value={stats.totalGuides} icon="📖" accent={colors.info} />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>Recent Signups</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["User", "Email", "Role", "Joined"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.recentUsers.map((u) => (
              <tr key={u._id} style={styles.tr}>
                <td style={styles.td}>
                  <div style={styles.userRow}>
                    {u.profilePicture ? (
                      <img src={u.profilePicture} style={styles.avatar} alt="" />
                    ) : (
                      <div style={styles.avatarPlaceholder}>{u.username[0].toUpperCase()}</div>
                    )}
                    <span>{u.username}</span>
                  </div>
                </td>
                <td style={{ ...styles.td, color: colors.textMuted }}>{u.email}</td>
                <td style={styles.td}>
                  <span style={u.isVendor ? styles.badgeVendor : styles.badgeClient}>
                    {u.isVendor ? "Vendor" : "Client"}
                  </span>
                </td>
                <td style={{ ...styles.td, color: colors.textMuted }}>{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  loading: { color: colors.textMuted, padding: 40, textAlign: "center" },
  statsRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${colors.border}`,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: colors.text },
  table: { width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 16px",
    textAlign: "left",
    color: colors.textMuted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${colors.border}`,
  },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: "12px 16px", color: colors.text, verticalAlign: "middle" },
  userRow: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: "50%", objectFit: "cover" },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: colors.primaryDim,
    color: colors.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
  },
  badgeVendor: {
    background: colors.primaryDim,
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: 20,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
  },
  badgeClient: {
    background: "rgba(255,255,255,0.06)",
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: 20,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
  },
};
