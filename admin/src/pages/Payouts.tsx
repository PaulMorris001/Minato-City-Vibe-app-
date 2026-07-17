import React, { useEffect, useState, useCallback } from "react";
import { adminApi, type AdminPayout } from "../api/admin";
import { colors } from "../constants/colors";

const LIMIT = 20;

type Status = "awaiting_approval" | "paid" | "failed" | "rejected" | "all";

const STATUS_TABS: Status[] = ["awaiting_approval", "paid", "failed", "rejected", "all"];

const STATUS_LABEL: Record<Status, string> = {
  awaiting_approval: "Awaiting Approval",
  paid: "Paid",
  failed: "Failed",
  rejected: "Rejected",
  all: "All",
};

const statusColor: Record<string, string> = {
  awaiting_approval: "#f59e0b",
  processing: "#3b82f6",
  paid: "#22c55e",
  failed: "#ef4444",
  rejected: "#9ca3af",
};

// stripe/flutterwave remain only so legacy payout docs created before the
// Paystack/Wise remap still render with a color.
const providerColor: Record<string, string> = {
  wise: "#9c40ff",
  paystack: "#09a5db",
  stripe: "#635bff",
  flutterwave: "#f5a623",
};

function money(p: AdminPayout): string {
  const amt = p.displayAmount ?? p.amount;
  const cur = p.displayCurrency ?? p.currency;
  return `${cur} ${Number(amt).toFixed(2)}`;
}

export default function Payouts() {
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<Status>("awaiting_approval");
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: LIMIT };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await adminApi.getPayouts(params);
      setPayouts(res.data.payouts);
      setTotal(res.data.pagination.total);
      setTotalPages(res.data.pagination.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    setBanner(null);
    try {
      const res = await adminApi.approvePayout(id);
      setBanner({ kind: "ok", text: res.data.message || "Payout approved and sent" });
      load();
    } catch (err: any) {
      // e.g. underfunded Wise balance, vendor missing a payout account.
      setBanner({
        kind: "error",
        text: err?.response?.data?.message || "Couldn't release payout",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await adminApi.rejectPayout(rejectId, rejectReason);
      setRejectId(null);
      setRejectReason("");
      load();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.title}>Payouts</h1>
          <p style={styles.subtitle}>
            Vendor earnings are held in the platform balance until you approve them.
            Approving runs the actual transfer{" "}
            <strong style={{ color: colors.text }}>(Paystack / Wise)</strong>.
            Nothing leaves the platform without approval.
          </p>
        </div>
        <div style={styles.badge}>{total} total</div>
      </div>

      {banner && (
        <div
          style={{
            ...styles.actionBanner,
            ...(banner.kind === "error" ? styles.actionBannerError : styles.actionBannerOk),
          }}
          onClick={() => setBanner(null)}
        >
          {banner.text} <span style={styles.bannerDismiss}>✕</span>
        </div>
      )}

      {/* Status filter tabs */}
      <div style={styles.tabRow}>
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            style={{ ...styles.tab, ...(statusFilter === s ? styles.tabActive : {}) }}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : payouts.length === 0 ? (
        <div style={styles.empty}>
          No {statusFilter !== "all" ? STATUS_LABEL[statusFilter].toLowerCase() : ""} payouts.
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {payouts.map((p) => {
            const canAct = p.status === "awaiting_approval" || p.status === "failed";
            return (
              <div key={p._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.amountBlock}>
                    <div style={styles.amount}>{money(p)}</div>
                    <div style={styles.relatedType}>{p.relatedType} payout</div>
                  </div>
                  <div style={styles.headerBadges}>
                    <span
                      style={{
                        ...styles.providerBadge,
                        color: providerColor[p.provider] ?? colors.text,
                        borderColor: providerColor[p.provider] ?? colors.border,
                      }}
                    >
                      {p.provider}
                    </span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        color: statusColor[p.status] ?? colors.text,
                        borderColor: statusColor[p.status] ?? colors.border,
                      }}
                    >
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>

                <div style={styles.vendorRow}>
                  <div style={styles.avatarPlaceholder}>
                    {(p.vendor?.businessName || p.vendor?.username || "?")[0]?.toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.vendorName}>
                      {p.vendor?.businessName || p.vendor?.username || "Unknown vendor"}
                      {p.vendor?.location?.country ? (
                        <span style={styles.country}> · {p.vendor.location.country}</span>
                      ) : null}
                    </div>
                    <div style={styles.vendorMeta}>{p.vendor?.email || "—"}</div>
                  </div>
                </div>

                <div style={styles.metaRow}>
                  <Meta label="Reference" value={p.reference} mono />
                  <Meta label="Created" value={new Date(p.createdAt).toLocaleString()} />
                  {p.transferId && <Meta label="Transfer" value={p.transferId} mono />}
                  {p.approvedBy && <Meta label="Approved by" value={p.approvedBy} />}
                </div>

                {p.status === "failed" && p.error && (
                  <div style={styles.errorBox}>⚠ {p.error}</div>
                )}
                {p.status === "rejected" && p.rejectedReason && (
                  <div style={styles.rejectReason}>Rejected: {p.rejectedReason}</div>
                )}

                {canAct && (
                  <div style={styles.actionBtns}>
                    <button
                      style={{ ...styles.btn, ...styles.btnApprove }}
                      onClick={() => handleApprove(p._id)}
                      disabled={actionLoading === p._id}
                    >
                      {actionLoading === p._id
                        ? "..."
                        : p.status === "failed"
                        ? "Retry"
                        : "Approve & Send"}
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnReject }}
                      onClick={() => {
                        setRejectId(p._id);
                        setRejectReason("");
                      }}
                      disabled={actionLoading === p._id}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
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

      {/* Reject Modal */}
      {rejectId && (
        <div style={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Reject Payout</h3>
            <p style={styles.modalDesc}>
              The funds stay in the platform balance — nothing is sent. Optional reason:
            </p>
            <textarea
              style={styles.textarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Sale was refunded / suspected fraud."
              rows={3}
            />
            <div style={styles.modalActions}>
              <button
                style={{ ...styles.btn, ...styles.btnCancel }}
                onClick={() => setRejectId(null)}
              >
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

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={styles.meta}>
      <div style={styles.metaLabel}>{label}</div>
      <div
        style={{
          ...styles.metaValue,
          ...(mono ? { fontFamily: "ui-monospace, monospace", fontSize: 12 } : {}),
        }}
      >
        {value}
      </div>
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
  actionBanner: {
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionBannerError: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    color: "#ef4444",
  },
  actionBannerOk: {
    background: "rgba(34, 197, 94, 0.12)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    color: "#22c55e",
  },
  bannerDismiss: { opacity: 0.6, marginLeft: 12 },
  tabRow: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
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
  tabActive: {
    background: colors.primaryDim,
    color: colors.primary,
    borderColor: colors.primary,
  },
  empty: {
    textAlign: "center",
    padding: "60px 0",
    color: colors.textMuted,
    fontSize: 15,
  },
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
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  amountBlock: { display: "flex", flexDirection: "column", gap: 2 },
  amount: { fontSize: 24, fontWeight: 800, color: colors.text },
  relatedType: { fontSize: 13, color: colors.textMuted, textTransform: "capitalize" },
  headerBadges: { display: "flex", gap: 8, flexShrink: 0 },
  vendorRow: { display: "flex", alignItems: "center", gap: 12 },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: colors.primaryDim,
    color: colors.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
  },
  vendorName: {
    fontWeight: 700,
    color: colors.text,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  country: { color: colors.textMuted, fontWeight: 500 },
  vendorMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  metaRow: {
    display: "flex",
    gap: 24,
    padding: "12px 0",
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    flexWrap: "wrap",
  },
  meta: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  metaLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: { fontSize: 13, fontWeight: 600, color: colors.text, wordBreak: "break-all" },
  errorBox: {
    fontSize: 13,
    color: "#ef4444",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    padding: 10,
  },
  rejectReason: {
    fontSize: 13,
    color: colors.textMuted,
    background: "rgba(156, 163, 175, 0.1)",
    border: `1px solid ${colors.border}`,
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
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid",
    borderRadius: 6,
    padding: "3px 10px",
    textTransform: "capitalize",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  providerBadge: {
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 6,
    padding: "3px 10px",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 0,
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
