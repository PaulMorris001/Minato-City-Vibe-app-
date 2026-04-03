import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import { colors } from "../constants/colors";

const LIMIT = 20;

type VerifStatus = "all" | "pending" | "approved" | "rejected";

interface VerifRequest {
  _id: string;
  user: { _id: string; username: string; email: string; profilePicture?: string };
  documentImageUrl: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

const statusColor: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

export default function Verifications() {
  const [requests, setRequests] = useState<VerifRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<VerifStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: LIMIT };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await adminApi.getVerifications(params);
      setRequests(res.data.requests);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.approveVerification(id);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await adminApi.rejectVerification(rejectId, rejectNotes);
      setRejectId(null);
      setRejectNotes("");
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
          <h1 style={styles.title}>Verifications</h1>
          <p style={styles.subtitle}>Review and approve vendor verification requests</p>
        </div>
        <div style={styles.badge}>{total} total</div>
      </div>

      {/* Status filter tabs */}
      <div style={styles.tabRow}>
        {(["pending", "approved", "rejected", "all"] as VerifStatus[]).map((s) => (
          <button
            key={s}
            style={{
              ...styles.tab,
              ...(statusFilter === s ? styles.tabActive : {}),
            }}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={styles.empty}>No {statusFilter !== "all" ? statusFilter : ""} requests.</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["User", "Email", "Submitted", "Document", "Status", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r._id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.userCell}>
                      {r.user?.profilePicture ? (
                        <img src={r.user.profilePicture} style={styles.avatar} alt="" />
                      ) : (
                        <div style={styles.avatarPlaceholder}>
                          {r.user?.username?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      <span style={styles.username}>{r.user?.username ?? "—"}</span>
                    </div>
                  </td>
                  <td style={styles.td}>{r.user?.email ?? "—"}</td>
                  <td style={styles.td}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    <a href={r.documentImageUrl} target="_blank" rel="noreferrer">
                      <img
                        src={r.documentImageUrl}
                        style={styles.docThumb}
                        alt="document"
                      />
                    </a>
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, color: statusColor[r.status], borderColor: statusColor[r.status] }}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                    {r.status === "rejected" && r.reviewNotes && (
                      <div style={styles.reviewNotes}>{r.reviewNotes}</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    {r.status === "pending" && (
                      <div style={styles.actionBtns}>
                        <button
                          style={{ ...styles.btn, ...styles.btnApprove }}
                          onClick={() => handleApprove(r._id)}
                          disabled={actionLoading === r._id}
                        >
                          {actionLoading === r._id ? "..." : "Approve"}
                        </button>
                        <button
                          style={{ ...styles.btn, ...styles.btnReject }}
                          onClick={() => { setRejectId(r._id); setRejectNotes(""); }}
                          disabled={actionLoading === r._id}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {r.status !== "pending" && (
                      <span style={styles.reviewedBy}>
                        {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          <span style={styles.pageInfo}>{page} / {totalPages}</span>
          <button style={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div style={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Reject Verification</h3>
            <p style={styles.modalDesc}>Provide a reason (shown to the vendor):</p>
            <textarea
              style={styles.textarea}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="e.g. Image is blurry or unreadable"
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
  page: { padding: "32px 28px", maxWidth: 1100 },
  pageHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: colors.text, margin: 0 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  badge: { fontSize: 13, color: colors.primary, background: colors.primaryDim, border: `1px solid ${colors.primary}`, borderRadius: 8, padding: "4px 12px", fontWeight: 600 },
  tabRow: { display: "flex", gap: 8, marginBottom: 20 },
  tab: { padding: "7px 18px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 14, fontWeight: 500 },
  tabActive: { background: colors.primaryDim, color: colors.primary, borderColor: colors.primary },
  empty: { textAlign: "center", padding: "60px 0", color: colors.textMuted, fontSize: 15 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: "12px 14px", verticalAlign: "middle", color: colors.text },
  userCell: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: "50%", objectFit: "cover" },
  avatarPlaceholder: { width: 34, height: 34, borderRadius: "50%", background: colors.primaryDim, color: colors.primary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  username: { fontWeight: 600 },
  docThumb: { width: 60, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}`, cursor: "pointer" },
  statusBadge: { fontSize: 12, fontWeight: 600, border: "1px solid", borderRadius: 6, padding: "2px 8px" },
  reviewNotes: { fontSize: 11, color: colors.textMuted, marginTop: 4, maxWidth: 180 },
  actionBtns: { display: "flex", gap: 6 },
  btn: { padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnApprove: { background: "#22c55e", color: "#fff" },
  btnReject: { background: "#ef4444", color: "#fff" },
  btnCancel: { background: colors.border, color: colors.text },
  reviewedBy: { fontSize: 12, color: colors.textMuted },
  pagination: { display: "flex", alignItems: "center", gap: 12, marginTop: 20, justifyContent: "center" },
  pageBtn: { padding: "6px 16px", borderRadius: 7, border: `1px solid ${colors.border}`, background: "transparent", color: colors.text, cursor: "pointer", fontSize: 13 },
  pageInfo: { fontSize: 14, color: colors.textMuted },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 28, width: 420, maxWidth: "90vw" },
  modalTitle: { fontSize: 18, fontWeight: 700, color: colors.text, margin: "0 0 8px" },
  modalDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
  textarea: { width: "100%", background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, color: colors.text, fontSize: 14, resize: "vertical", boxSizing: "border-box" },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
};
