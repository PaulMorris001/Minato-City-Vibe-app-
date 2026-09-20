import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../api/admin";
import type { ActionItems, Stats } from "../types";
import StatCard from "../components/ui/StatCard";
import { colors } from "../constants/colors";

interface ActionItemConfig {
  key: keyof ActionItems;
  label: string;
  icon: string;
  route: string;
  /** Informational items (new signups) always render in the info color,
   *  never the "needs attention" amber/red treatment. */
  informational?: boolean;
}

const ACTION_ITEMS: ActionItemConfig[] = [
  { key: "verifications", label: "Identity Verifications", icon: "🛡️", route: "/verifications" },
  { key: "payouts", label: "Payouts", icon: "💸", route: "/payouts" },
  { key: "eventEdits", label: "Event Edits", icon: "✏️", route: "/event-edits" },
  { key: "paidEvents", label: "Paid Events", icon: "🎫", route: "/paid-events" },
  { key: "cancellations", label: "Cancellations", icon: "🚫", route: "/event-cancellations" },
  { key: "reports", label: "Reports", icon: "🚩", route: "/reports" },
  { key: "newUsersToday", label: "New Users Today", icon: "👋", route: "/users", informational: true },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [actionItems, setActionItems] = useState<ActionItems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getStats(), adminApi.getActionItems()])
      .then(([statsRes, actionRes]) => {
        setStats(statsRes.data);
        setActionItems(actionRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (loading) return <div style={styles.loading}>Loading...</div>;
  if (!stats) return null;

  const totalPending = actionItems
    ? ACTION_ITEMS.filter((i) => !i.informational).reduce((sum, i) => sum + actionItems[i.key], 0)
    : 0;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>Action Items</h3>
          {totalPending > 0 && (
            <span style={styles.headerBadge}>{totalPending} need{totalPending === 1 ? "s" : ""} attention</span>
          )}
        </div>
        <div style={styles.actionGrid}>
          {actionItems &&
            ACTION_ITEMS.map((item) => {
              const count = actionItems[item.key];
              const active = !item.informational && count > 0;
              return (
                <button
                  key={item.key}
                  style={{
                    ...styles.actionTile,
                    borderColor: active ? colors.warning : colors.border,
                    background: active ? "rgba(245, 158, 11, 0.08)" : colors.surface,
                  }}
                  onClick={() => navigate(item.route)}
                >
                  <span style={styles.actionIcon}>{item.icon}</span>
                  <span
                    style={{
                      ...styles.actionCount,
                      color: item.informational ? colors.info : active ? colors.warning : colors.textMuted,
                    }}
                  >
                    {count}
                  </span>
                  <span style={styles.actionLabel}>{item.label}</span>
                </button>
              );
            })}
        </div>
      </div>

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
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 20px",
    borderBottom: `1px solid ${colors.border}`,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: colors.text },
  headerBadge: {
    background: "rgba(245, 158, 11, 0.12)",
    color: colors.warning,
    border: `1px solid ${colors.warning}`,
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  actionGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: 20,
  },
  actionTile: {
    flex: "1 1 140px",
    minWidth: 140,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "14px 16px",
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
  },
  actionIcon: { fontSize: 18 },
  actionCount: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  actionLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: 500 },
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
