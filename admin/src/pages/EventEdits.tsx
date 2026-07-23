import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import { colors } from "../constants/colors";

const LIMIT = 20;

type Status = "pending" | "rejected" | "all";

interface EventEdit {
  _id: string;
  title: string;
  date: string;
  currency?: string;
  createdBy?: { _id: string; username: string; email: string; verified?: boolean };
  pendingEdits?: {
    status: "none" | "pending" | "rejected";
    submittedAt?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectReason?: string;
  };
  diff?: { current: Record<string, any>; proposed: Record<string, any> };
}

const FIELD_LABELS: Record<string, string> = {
  date: "Date & time",
  ticketPrice: "Ticket price (from)",
  maxGuests: "Capacity",
  ticketTiers: "Ticket tiers",
};

function formatValue(key: string, value: any, currency?: string): string {
  if (value === undefined || value === null) return "—";
  if (key === "date") return new Date(value).toLocaleString();
  if (key === "ticketTiers") {
    if (!Array.isArray(value) || value.length === 0) return "—";
    return value
      .map(
        (t: any) =>
          `${t.name}: ${currency || "USD"} ${t.price}${
            t.quantity !== undefined ? ` ×${t.quantity}` : ""
          }`
      )
      .join("  ·  ");
  }
  if (key === "ticketPrice") return `${currency || "USD"} ${value}`;
  return String(value);
}

export default function EventEdits() {
  const [events, setEvents] = useState<EventEdit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<Status>("pending");
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: LIMIT };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await adminApi.getEventEdits(params);
      setEvents(res.data.events);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.approveEventEdit(id);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await adminApi.rejectEventEdit(rejectId, rejectReason);
      setRejectId(null);
      setRejectReason("");
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.title}>Event Edits</h1>
          <p style={styles.subtitle}>
            Review creator changes to <strong style={{ color: colors.text }}>price, tiers,
            capacity and date</strong> on already-public events. The live event keeps its current
            details until you approve. Minor edits (title, description, photos, location) are not
            shown here — they go live immediately.
          </p>
        </div>
        <div style={styles.badge}>{total} total</div>
      </div>

      <div style={styles.tabRow}>
        {(["pending", "rejected", "all"] as Status[]).map((s) => (
          <button
            key={s}
            style={{ ...styles.tab, ...(statusFilter === s ? styles.tabActive : {}) }}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={styles.empty}>No {statusFilter !== "all" ? statusFilter : ""} event edits.</div>
      ) : (
        <div style={styles.cardGrid}>
          {events.map((e) => {
            const proposed = e.diff?.proposed || {};
            const current = e.diff?.current || {};
            const keys = Object.keys(proposed);
            const status = e.pendingEdits?.status || "none";
            return (
              <div key={e._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderText}>
                    <div style={styles.cardTitle}>{e.title}</div>
                    <div style={styles.cardMeta}>
                      by {e.createdBy?.username ?? "—"} · {e.createdBy?.email ?? "—"}
                      {e.pendingEdits?.submittedAt
                        ? ` · submitted ${new Date(e.pendingEdits.submittedAt).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  <span style={styles.statusBadge}>{status}</span>
                </div>

                <div style={styles.diffTable}>
                  <div style={{ ...styles.diffRow, ...styles.diffHead }}>
                    <div style={styles.diffCol}>Field</div>
                    <div style={styles.diffCol}>Current</div>
                    <div style={styles.diffCol}>Proposed</div>
                  </div>
                  {keys.map((k) => (
                    <div key={k} style={styles.diffRow}>
                      <div style={{ ...styles.diffCol, color: colors.textMuted }}>
                        {FIELD_LABELS[k] || k}
                      </div>
                      <div style={styles.diffCol}>{formatValue(k, current[k], e.currency)}</div>
                      <div style={{ ...styles.diffCol, color: "#22c55e" }}>
                        {formatValue(k, proposed[k], e.currency)}
                      </div>
                    </div>
                  ))}
                </div>

                {status === "rejected" && e.pendingEdits?.rejectReason && (
                  <div style={styles.rejectReason}>Rejected: {e.pendingEdits.rejectReason}</div>
                )}

                {status === "pending" && (
                  <div style={styles.actionBtns}>
                    <button
                      style={{ ...styles.btn, ...styles.btnApprove }}
                      onClick={() => handleApprove(e._id)}
                      disabled={actionLoading === e._id}
                    >
                      {actionLoading === e._id ? "..." : "Approve"}
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnReject }}
                      onClick={() => {
                        setRejectId(e._id);
                        setRejectReason("");
                      }}
                      disabled={actionLoading === e._id}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {status !== "pending" && e.pendingEdits?.reviewedAt && (
                  <div style={styles.reviewedAt}>
                    Reviewed {new Date(e.pendingEdits.reviewedAt).toLocaleString()}
                    {e.pendingEdits.reviewedBy ? ` by ${e.pendingEdits.reviewedBy}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span style={styles.pageInfo}>
            {page} / {totalPages}
          </span>
          <button
            style={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}

      {rejectId && (
        <div style={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Reject Event Edit</h3>
            <p style={styles.modalDesc}>Reason (shown to the creator in their notification):</p>
            <textarea
              style={styles.textarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Ticket price increase is too large for an event already on sale."
              rows={3}
            />
            <div style={styles.modalActions}>
              <button style={{ ...styles.btn, ...styles.btnCancel }} onClick={() => setRejectId(null)}>
                Cancel
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnReject }}
                onClick={handleRejectSubmit}
                disabled={actionLoading !== null}
              >
                {actionLoading ? "..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: "32px 28px", maxWidth: 1200 },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 24,
  },
  title: { fontSize: 26, fontWeight: 700, color: colors.text, margin: 0 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4, maxWidth: 720 },
  badge: {
    fontSize: 13,
    color: colors.primary,
    background: colors.primaryDim,
    border: `1px solid ${colors.primary}`,
    borderRadius: 8,
    padding: "4px 12px",
    fontWeight: 600,
    flexShrink: 0,
  },
  tabRow: { display: "flex", gap: 8, marginBottom: 20 },
  tab: {
    padding: "7px 18px",
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  tabActive: { background: colors.primaryDim, color: colors.primary, borderColor: colors.primary },
  empty: { textAlign: "center", padding: "60px 0", color: colors.textMuted, fontSize: 15 },
  cardGrid: { display: "flex", flexDirection: "column", gap: 16 },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  cardHeader: { display: "flex", alignItems: "center", gap: 14 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: 700, color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  diffTable: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  diffRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1.4fr 1.4fr",
    gap: 12,
    padding: "10px 12px",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 13,
    color: colors.text,
  },
  diffHead: {
    background: colors.bg,
    color: colors.textMuted,
    fontWeight: 600,
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  diffCol: { minWidth: 0, wordBreak: "break-word" },
  rejectReason: {
    fontSize: 13,
    color: "#ef4444",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    padding: 10,
  },
  actionBtns: { display: "flex", gap: 8 },
  btn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  btnApprove: { background: "#22c55e", color: "#fff" },
  btnReject: { background: "#ef4444", color: "#fff" },
  btnCancel: { background: colors.border, color: colors.text },
  reviewedAt: { fontSize: 12, color: colors.textMuted },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "3px 10px",
    textTransform: "capitalize",
    flexShrink: 0,
    color: colors.textMuted,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    justifyContent: "center",
  },
  pageBtn: {
    padding: "6px 16px",
    borderRadius: 7,
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: colors.text,
    cursor: "pointer",
    fontSize: 13,
  },
  pageInfo: { fontSize: 14, color: colors.textMuted },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 28,
    width: 420,
    maxWidth: "90vw",
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: colors.text, margin: "0 0 8px" },
  modalDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
  textarea: {
    width: "100%",
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    fontSize: 14,
    resize: "vertical",
    boxSizing: "border-box",
  },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
};
