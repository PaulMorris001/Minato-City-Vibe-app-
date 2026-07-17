import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import { colors } from "../constants/colors";

const LIMIT = 20;

type Status = "pending" | "approved" | "rejected" | "all";

interface PaidEvent {
  _id: string;
  title: string;
  description?: string;
  date: string;
  location: string;
  image?: string;
  venueProofImage?: string;
  ticketPrice: number;
  maxGuests: number;
  approvalStatus: "pending" | "approved" | "rejected";
  approvalReviewedAt?: string;
  approvalRejectReason?: string;
  payoutStatus?: "none" | "pending" | "awaiting_approval" | "released" | "failed";
  payoutDelayHours?: number;
  payoutReleasedAt?: string;
  fraudReportCount?: number;
  createdAt: string;
  createdBy?: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
    verified?: boolean;
    paidEventsApproved?: boolean;
    paidEventsCount?: number;
    /** Computed server-side: vendor has completed Paystack or Wise payout setup. */
    payoutOnboarded?: boolean;
    emailVerifiedAt?: string;
    contactInfo?: { phone?: string };
  };
}

const statusColor: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const payoutColor: Record<string, string> = {
  pending: "#f59e0b",
  awaiting_approval: "#f59e0b",
  released: "#22c55e",
  failed: "#ef4444",
  none: "#9ca3af",
};

export default function PaidEvents() {
  const [events, setEvents] = useState<PaidEvent[]>([]);
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
      const res = await adminApi.getPaidEvents(params);
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
      await adminApi.approvePaidEvent(id);
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await adminApi.rejectPaidEvent(rejectId, rejectReason);
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
          <h1 style={styles.title}>Paid Events</h1>
          <p style={styles.subtitle}>
            Approve first-time organizers before their paid events go on sale.
            Funds are held until {" "}
            <strong style={{ color: colors.text }}>
              48h after event end
            </strong>{" "}
            and then released to the organizer's Stripe Connect account.
          </p>
        </div>
        <div style={styles.badge}>{total} total</div>
      </div>

      {/* Status filter tabs */}
      <div style={styles.tabRow}>
        {(["pending", "approved", "rejected", "all"] as Status[]).map((s) => (
          <button
            key={s}
            style={{
              ...styles.tab,
              ...(statusFilter === s ? styles.tabActive : {}),
            }}
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
          No {statusFilter !== "all" ? statusFilter : ""} paid events.
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {events.map((e) => {
            const isFirstEvent = !e.createdBy?.paidEventsApproved;
            return (
              <div key={e._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  {e.image ? (
                    <img src={e.image} style={styles.cardImage} alt="" />
                  ) : (
                    <div style={styles.cardImagePlaceholder}>🎟️</div>
                  )}
                  <div style={styles.cardHeaderText}>
                    <div style={styles.cardTitle}>{e.title}</div>
                    <div style={styles.cardMeta}>
                      {new Date(e.date).toLocaleString()} · {e.location}
                    </div>
                  </div>
                  <span
                    style={{
                      ...styles.statusBadge,
                      color: statusColor[e.approvalStatus],
                      borderColor: statusColor[e.approvalStatus],
                    }}
                  >
                    {e.approvalStatus}
                  </span>
                </div>

                {e.description && (
                  <div style={styles.description}>{e.description}</div>
                )}

                {e.venueProofImage && (
                  <div style={styles.venueProofBlock}>
                    <div style={styles.venueProofLabel}>Venue proof</div>
                    <a href={e.venueProofImage} target="_blank" rel="noreferrer">
                      <img
                        src={e.venueProofImage}
                        style={styles.venueProofThumb}
                        alt="Venue booking proof"
                      />
                    </a>
                  </div>
                )}

                <div style={styles.statRow}>
                  <Stat label="Ticket price" value={`$${e.ticketPrice.toFixed(2)}`} />
                  <Stat label="Max guests" value={String(e.maxGuests)} />
                  <Stat
                    label="Potential revenue"
                    value={`$${(e.ticketPrice * e.maxGuests).toFixed(2)}`}
                  />
                  <Stat
                    label="Payout"
                    value={e.payoutStatus ?? "—"}
                    color={payoutColor[e.payoutStatus ?? "none"]}
                  />
                </div>

                <div style={styles.organizerBlock}>
                  <div style={styles.organizerHeader}>
                    {e.createdBy?.profilePicture ? (
                      <img
                        src={e.createdBy.profilePicture}
                        style={styles.avatar}
                        alt=""
                      />
                    ) : (
                      <div style={styles.avatarPlaceholder}>
                        {e.createdBy?.username?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <div style={styles.organizerName}>
                        {e.createdBy?.username ?? "—"}
                        {e.createdBy?.verified && (
                          <span style={styles.verifiedDot}>✓</span>
                        )}
                      </div>
                      <div style={styles.organizerMeta}>
                        {e.createdBy?.email ?? "—"}
                        {e.createdBy?.contactInfo?.phone
                          ? ` · ${e.createdBy.contactInfo.phone}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div style={styles.trustChipRow}>
                    <TrustChip
                      ok={!!e.createdBy?.payoutOnboarded}
                      label="Payouts onboarded"
                    />
                    <TrustChip
                      ok={!!e.createdBy?.verified}
                      label="ID verified"
                    />
                    <TrustChip
                      ok={!!e.createdBy?.emailVerifiedAt}
                      label="Email verified"
                    />
                    <TrustChip
                      ok={!isFirstEvent}
                      label={
                        isFirstEvent
                          ? "FIRST paid event"
                          : `${e.createdBy?.paidEventsCount ?? 0} past events`
                      }
                      warn={isFirstEvent}
                    />
                    {!!e.fraudReportCount && e.fraudReportCount > 0 && (
                      <TrustChip
                        ok={false}
                        label={`⚠ ${e.fraudReportCount} fraud report${e.fraudReportCount === 1 ? "" : "s"}`}
                      />
                    )}
                  </div>
                </div>

                {e.approvalStatus === "rejected" && e.approvalRejectReason && (
                  <div style={styles.rejectReason}>
                    Rejected: {e.approvalRejectReason}
                  </div>
                )}

                {e.approvalStatus === "pending" && (
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

                {e.approvalStatus !== "pending" && e.approvalReviewedAt && (
                  <div style={styles.reviewedAt}>
                    Reviewed {new Date(e.approvalReviewedAt).toLocaleString()}
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
            <h3 style={styles.modalTitle}>Reject Paid Event</h3>
            <p style={styles.modalDesc}>
              Reason (shown to the organizer in their notification):
            </p>
            <textarea
              style={styles.textarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. We need proof of venue booking before approving."
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

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: color || colors.text }}>
        {value}
      </div>
    </div>
  );
}

function TrustChip({
  ok,
  label,
  warn,
}: {
  ok: boolean;
  label: string;
  warn?: boolean;
}) {
  const color = warn ? "#f59e0b" : ok ? "#22c55e" : "#ef4444";
  const icon = warn ? "⚠" : ok ? "✓" : "✗";
  return (
    <span style={{ ...styles.chip, color, borderColor: color }}>
      {icon} {label}
    </span>
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
  cardHeader: { display: "flex", alignItems: "center", gap: 14 },
  cardImage: {
    width: 60,
    height: 60,
    objectFit: "cover",
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
  },
  cardImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    background: colors.primaryDim,
    color: colors.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 26,
  },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: 700, color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  description: { fontSize: 14, color: colors.text, lineHeight: 1.5 },
  venueProofBlock: { display: "flex", flexDirection: "column", gap: 6 },
  venueProofLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: 600,
  },
  venueProofThumb: {
    maxWidth: 240,
    maxHeight: 160,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    objectFit: "cover",
  },
  statRow: {
    display: "flex",
    gap: 24,
    padding: "12px 0",
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    flexWrap: "wrap",
  },
  stat: { display: "flex", flexDirection: "column", gap: 2 },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: { fontSize: 15, fontWeight: 700 },
  organizerBlock: { display: "flex", flexDirection: "column", gap: 10 },
  organizerHeader: { display: "flex", alignItems: "center", gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: "50%", objectFit: "cover" },
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
  },
  organizerName: {
    fontWeight: 700,
    color: colors.text,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  organizerMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  verifiedDot: { color: "#22c55e", fontSize: 13 },
  trustChipRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    fontSize: 11,
    fontWeight: 600,
    border: "1px solid",
    borderRadius: 999,
    padding: "3px 10px",
  },
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
    border: "1px solid",
    borderRadius: 6,
    padding: "3px 10px",
    textTransform: "capitalize",
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
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.text,
    margin: "0 0 8px",
  },
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
  modalActions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
  },
};
