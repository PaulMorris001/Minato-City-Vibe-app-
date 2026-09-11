import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import { colors } from "../constants/colors";

const LIMIT = 20;

type Status = "pending" | "approved" | "rejected" | "all";

interface EventCancellation {
  _id: string;
  title: string;
  date: string;
  endDate?: string | null;
  location?: string;
  currency?: string;
  createdBy?: { _id: string; username: string; email: string; verified?: boolean };
  cancellationRequest?: {
    status: "none" | "pending" | "approved" | "rejected";
    reason?: string;
    requestedAt?: string;
    ticketsAtRequest?: number;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectReason?: string;
  };
  /** Live count, not the one captured at request time — tickets can have been refunded since. */
  outstandingTickets: number;
  refundTotalText: string;
}

export default function EventCancellations() {
  const [events, setEvents] = useState<EventCancellation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<Status>("pending");
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<EventCancellation | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: LIMIT };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await adminApi.getEventCancellations(params);
      setEvents(res.data.events);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    setActionLoading(approveTarget._id);
    try {
      const res = await adminApi.approveEventCancellation(approveTarget._id);
      const { refunded, failed } = res.data;
      setResult(
        failed > 0
          ? `Cancelled. ${refunded} refunded, ${failed} failed — those need handling by hand.`
          : `Cancelled. ${refunded} ticket${refunded === 1 ? "" : "s"} refunded and everyone emailed.`
      );
      setApproveTarget(null);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await adminApi.rejectEventCancellation(rejectId, rejectReason);
      setRejectId(null);
      setRejectReason("");
      setResult("Request declined. Ticket sales reopened.");
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
          <h1 style={styles.title}>Event Cancellations</h1>
          <p style={styles.subtitle}>
            Organizers who want to call off an event{" "}
            <strong style={{ color: colors.text }}>with tickets already sold</strong> land here.
            Ticket sales are paused the moment they ask. Approving is what actually refunds every
            buyer and emails them — it cannot be undone.
          </p>
        </div>
        <div style={styles.badge}>{total} total</div>
      </div>

      {result && (
        <div style={styles.resultBanner}>
          {result}
          <button style={styles.resultClose} onClick={() => setResult(null)}>
            ×
          </button>
        </div>
      )}

      <div style={styles.tabRow}>
        {(["pending", "approved", "rejected", "all"] as Status[]).map((s) => (
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
        <div style={styles.empty}>
          No {statusFilter !== "all" ? statusFilter : ""} cancellation requests.
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {events.map((e) => {
            const req = e.cancellationRequest;
            const status = req?.status || "none";
            return (
              <div key={e._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderText}>
                    <div style={styles.cardTitle}>{e.title}</div>
                    <div style={styles.cardMeta}>
                      by {e.createdBy?.username ?? "—"} · {e.createdBy?.email ?? "—"}
                      {req?.requestedAt
                        ? ` · asked ${new Date(req.requestedAt).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  <span style={styles.statusBadge}>{status}</span>
                </div>

                <div style={styles.factRow}>
                  <div style={styles.fact}>
                    <div style={styles.factLabel}>Event date</div>
                    <div style={styles.factValue}>{new Date(e.date).toLocaleString()}</div>
                  </div>
                  <div style={styles.fact}>
                    <div style={styles.factLabel}>Tickets to refund</div>
                    <div style={{ ...styles.factValue, color: "#f59e0b" }}>
                      {e.outstandingTickets}
                    </div>
                  </div>
                  <div style={styles.fact}>
                    <div style={styles.factLabel}>Total at risk</div>
                    <div style={{ ...styles.factValue, color: "#f59e0b" }}>{e.refundTotalText}</div>
                  </div>
                  <div style={styles.fact}>
                    <div style={styles.factLabel}>Location</div>
                    <div style={styles.factValue}>{e.location || "—"}</div>
                  </div>
                </div>

                <div style={styles.reasonBox}>
                  <strong style={{ color: colors.textMuted }}>Organizer's reason:</strong>{" "}
                  {req?.reason || <em style={{ color: colors.textMuted }}>none given</em>}
                </div>

                {status === "rejected" && req?.rejectReason && (
                  <div style={styles.rejectReason}>Declined: {req.rejectReason}</div>
                )}

                {status === "pending" && (
                  <div style={styles.actionBtns}>
                    <button
                      style={{ ...styles.btn, ...styles.btnReject }}
                      onClick={() => setApproveTarget(e)}
                      disabled={actionLoading === e._id}
                    >
                      {actionLoading === e._id ? "..." : "Approve & refund"}
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnCancel }}
                      onClick={() => {
                        setRejectId(e._id);
                        setRejectReason("");
                      }}
                      disabled={actionLoading === e._id}
                    >
                      Decline
                    </button>
                  </div>
                )}

                {status !== "pending" && req?.reviewedAt && (
                  <div style={styles.reviewedAt}>
                    Reviewed {new Date(req.reviewedAt).toLocaleString()}
                    {req.reviewedBy ? ` by ${req.reviewedBy}` : ""}
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

      {approveTarget && (
        <div style={styles.modalOverlay} onClick={() => setApproveTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Cancel “{approveTarget.title}”?</h3>
            <p style={styles.modalDesc}>
              This refunds{" "}
              <strong style={{ color: colors.text }}>
                {approveTarget.outstandingTickets} ticket
                {approveTarget.outstandingTickets === 1 ? "" : "s"} totalling{" "}
                {approveTarget.refundTotalText}
              </strong>
              , emails every buyer, and takes the event down. There is no undo.
            </p>
            <div style={styles.modalActions}>
              <button
                style={{ ...styles.btn, ...styles.btnCancel }}
                onClick={() => setApproveTarget(null)}
              >
                Back
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnReject }}
                onClick={handleApproveConfirm}
                disabled={actionLoading !== null}
              >
                {actionLoading ? "Refunding..." : "Cancel & refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectId && (
        <div style={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Decline cancellation</h3>
            <p style={styles.modalDesc}>
              Reason (shown to the organizer in their notification). Ticket sales reopen if the
              request is what closed them.
            </p>
            <textarea
              style={styles.textarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. The event is tomorrow — call us before we refund 200 buyers."
              rows={3}
            />
            <div style={styles.modalActions}>
              <button
                style={{ ...styles.btn, ...styles.btnCancel }}
                onClick={() => setRejectId(null)}
              >
                Back
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnReject }}
                onClick={handleRejectSubmit}
                disabled={actionLoading !== null}
              >
                {actionLoading ? "..." : "Confirm decline"}
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
  resultBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "rgba(34, 197, 94, 0.12)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    borderRadius: 8,
    padding: "10px 14px",
    color: colors.text,
    fontSize: 14,
    marginBottom: 16,
  },
  resultClose: {
    background: "transparent",
    border: "none",
    color: colors.textMuted,
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
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
  factRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 12,
  },
  fact: { minWidth: 0 },
  factLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: 600,
  },
  factValue: { fontSize: 14, color: colors.text, marginTop: 3, wordBreak: "break-word" },
  reasonBox: { fontSize: 13, color: colors.text, lineHeight: 1.5 },
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
    width: 460,
    maxWidth: "90vw",
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: colors.text, margin: "0 0 8px" },
  modalDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 12, lineHeight: 1.6 },
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
