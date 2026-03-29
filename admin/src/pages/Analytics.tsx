import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { AnalyticsSummary, AnalyticsLog } from "../types";
import StatCard from "../components/ui/StatCard";
import Pagination from "../components/ui/Pagination";
import { colors } from "../constants/colors";

const EVENT_LABELS: Record<string, string> = {
  event_viewed: "Event Viewed",
  event_rsvp: "Event RSVP",
  ticket_purchased: "Ticket Purchased",
  chat_opened: "Chat Opened",
  message_sent: "Message Sent",
  event_created: "Event Created",
  search_performed: "Search Performed",
};

const EVENT_ICONS: Record<string, string> = {
  event_viewed: "👁",
  event_rsvp: "✅",
  ticket_purchased: "🎟",
  chat_opened: "💬",
  message_sent: "📨",
  event_created: "📅",
  search_performed: "🔍",
};

const ACCENT_COLORS = [
  colors.primary,
  colors.info,
  colors.success,
  colors.warning,
  colors.error,
  "#f97316",
  "#ec4899",
];

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [logs, setLogs] = useState<AnalyticsLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterEvent, setFilterEvent] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const limit = 20;

  useEffect(() => {
    adminApi.getAnalyticsSummary()
      .then((r) => setSummary(r.data))
      .finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    setLoadingLogs(true);
    adminApi.getAnalyticsEvents({ event: filterEvent || undefined, page, limit })
      .then((r) => {
        setLogs(r.data.logs);
        setTotal(r.data.total);
      })
      .finally(() => setLoadingLogs(false));
  }, [filterEvent, page]);

  const maxDayCount = summary ? Math.max(...summary.dailySeries.map((d) => d.count), 1) : 1;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div style={styles.page}>
      {/* Summary stat cards */}
      <div style={styles.statsRow}>
        <StatCard
          label="Total Events Tracked"
          value={loadingSummary ? "..." : (summary?.totalEvents ?? 0)}
          icon="📊"
          accent={colors.primary}
        />
        {!loadingSummary && summary?.eventBreakdown.slice(0, 3).map((eb, i) => (
          <StatCard
            key={eb._id}
            label={EVENT_LABELS[eb._id] ?? eb._id}
            value={eb.count}
            icon={EVENT_ICONS[eb._id] ?? "•"}
            accent={ACCENT_COLORS[i + 1] ?? colors.info}
          />
        ))}
      </div>

      <div style={styles.row}>
        {/* Daily activity chart */}
        <div style={{ ...styles.card, flex: 1 }}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>Daily Activity (Last 7 Days)</h3>
          </div>
          <div style={styles.chartArea}>
            {loadingSummary ? (
              <div style={styles.empty}>Loading...</div>
            ) : summary?.dailySeries.map((day) => (
              <div key={day.date} style={styles.barGroup}>
                <div style={styles.barLabel}>{day.count}</div>
                <div
                  style={{
                    ...styles.bar,
                    height: Math.max((day.count / maxDayCount) * 140, day.count > 0 ? 4 : 0),
                    background: colors.primary,
                  }}
                />
                <div style={styles.barDate}>{formatDay(day.date).split(" ").slice(0, 2).join(" ")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Event type breakdown */}
        <div style={{ ...styles.card, width: 280 }}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>By Event Type</h3>
          </div>
          <div style={styles.breakdownList}>
            {loadingSummary ? (
              <div style={styles.empty}>Loading...</div>
            ) : summary?.eventBreakdown.length === 0 ? (
              <div style={styles.empty}>No data yet</div>
            ) : summary?.eventBreakdown.map((eb, i) => {
              const total = summary.totalEvents || 1;
              const pct = Math.round((eb.count / total) * 100);
              return (
                <div key={eb._id} style={styles.breakdownItem}>
                  <div style={styles.breakdownLeft}>
                    <span style={styles.breakdownIcon}>{EVENT_ICONS[eb._id] ?? "•"}</span>
                    <span style={styles.breakdownName}>{EVENT_LABELS[eb._id] ?? eb._id}</span>
                  </div>
                  <div style={styles.breakdownRight}>
                    <div
                      style={{
                        ...styles.breakdownBar,
                        width: `${pct}%`,
                        background: ACCENT_COLORS[i % ACCENT_COLORS.length],
                      }}
                    />
                    <span style={styles.breakdownCount}>{eb.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top users */}
      {!loadingSummary && summary && summary.topUsers.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>Most Active Users</h3>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                {["User", "Email", "Events Triggered"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.topUsers.map((u, i) => (
                <tr key={u._id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.userRow}>
                      <div style={{ ...styles.rank, background: i === 0 ? colors.primaryDim : "rgba(255,255,255,0.06)", color: i === 0 ? colors.primary : colors.textMuted }}>
                        #{i + 1}
                      </div>
                      {u.username ?? "—"}
                    </div>
                  </td>
                  <td style={{ ...styles.td, color: colors.textMuted }}>{u.email ?? "—"}</td>
                  <td style={styles.td}>
                    <span style={styles.countBadge}>{u.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Event log table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>Event Log</h3>
          <select
            style={styles.select}
            value={filterEvent}
            onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }}
          >
            <option value="">All Events</option>
            {Object.entries(EVENT_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {loadingLogs ? (
          <div style={styles.empty}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={styles.empty}>No analytics events tracked yet. They will appear here once users interact with the app.</div>
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Event", "User", "Platform", "App Version", "Time"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.eventBadge}>
                        {EVENT_ICONS[log.event] ?? "•"} {EVENT_LABELS[log.event] ?? log.event}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: colors.textMuted }}>
                      {log.userId?.username ?? <span style={{ color: colors.textDim }}>anonymous</span>}
                    </td>
                    <td style={{ ...styles.td, color: colors.textMuted, textTransform: "capitalize" }}>
                      {log.platform ?? "—"}
                    </td>
                    <td style={{ ...styles.td, color: colors.textMuted }}>
                      {log.appVersion ?? "—"}
                    </td>
                    <td style={{ ...styles.td, color: colors.textDim, fontSize: 12 }}>
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.paginationWrapper}>
              <Pagination
                page={page}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  statsRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  row: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: colors.text, margin: 0 },
  // Bar chart
  chartArea: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    padding: "20px 20px 12px",
    minHeight: 180,
  },
  barGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  barLabel: { fontSize: 11, color: colors.textMuted, minHeight: 16 },
  bar: {
    width: "100%",
    maxWidth: 40,
    borderRadius: "4px 4px 0 0",
    minHeight: 2,
    transition: "height 0.3s",
  },
  barDate: { fontSize: 10, color: colors.textDim, textAlign: "center" as const },
  // Breakdown
  breakdownList: {
    display: "flex",
    flexDirection: "column",
    padding: "8px 0",
  },
  breakdownItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    gap: 8,
  },
  breakdownLeft: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 },
  breakdownIcon: { fontSize: 14, flexShrink: 0 },
  breakdownName: { fontSize: 12, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  breakdownRight: { display: "flex", alignItems: "center", gap: 8, width: 80, flexShrink: 0 },
  breakdownBar: { height: 6, borderRadius: 3, minWidth: 2 },
  breakdownCount: { fontSize: 12, color: colors.textMuted, width: 30, textAlign: "right" as const, flexShrink: 0 },
  // Table
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 16px",
    textAlign: "left",
    color: colors.textMuted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    borderBottom: `1px solid ${colors.border}`,
  },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: "12px 16px", color: colors.text, verticalAlign: "middle" },
  userRow: { display: "flex", alignItems: "center", gap: 8 },
  rank: {
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 4,
    padding: "2px 6px",
  },
  countBadge: {
    background: colors.primaryDim,
    color: colors.primary,
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  eventBadge: {
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 500,
  },
  select: {
    background: colors.surfaceHover,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  empty: {
    padding: "32px 20px",
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 1.6,
  },
  paginationWrapper: {
    padding: "12px 16px",
    borderTop: `1px solid ${colors.border}`,
  },
};
