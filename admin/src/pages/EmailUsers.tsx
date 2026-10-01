import React, { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { AdminEmailBroadcast, EmailAudience } from "../types";
import { colors } from "../constants/colors";

const SUBJECT_MAX = 150;
const BODY_MAX = 10000;
const CTA_LABEL_MAX = 40;
/** Refresh history this often while something is still going out. */
const POLL_MS = 15000;

const STATUS_LABEL: Record<AdminEmailBroadcast["status"], string> = {
  queued: "Queued",
  sending: "Sending",
  paused_daily_cap: "Paused — daily limit reached, resumes tomorrow",
  done: "Done",
  cancelled: "Cancelled",
};

const isRunning = (b: AdminEmailBroadcast) =>
  b.status === "queued" || b.status === "sending" || b.status === "paused_daily_cap";

/**
 * Email every user (or every vendor). The server sends gradually under a daily
 * cap — see jobs/emailBroadcast.job.js — so this page shows progress rather
 * than a single "sent".
 */
export default function EmailUsers() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<EmailAudience>("all");
  const [testTo, setTestTo] = useState("");

  const [broadcasts, setBroadcasts] = useState<AdminEmailBroadcast[]>([]);
  const [sentToday, setSentToday] = useState(0);
  const [dailyCap, setDailyCap] = useState(0);
  const [loading, setLoading] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reach, setReach] = useState<number | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.getEmailBroadcasts();
      setBroadcasts(res.data.broadcasts);
      setSentToday(res.data.sentToday);
      setDailyCap(res.data.dailyCap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const anyRunning = broadcasts.some(isRunning);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  const draft = () => ({
    subject: subject.trim(),
    body: body.trim(),
    ...(ctaLabel.trim() && ctaUrl.trim() ? { ctaLabel: ctaLabel.trim(), ctaUrl: ctaUrl.trim() } : {}),
  });

  const ctaHalfFilled = !!ctaLabel.trim() !== !!ctaUrl.trim();
  const canSend = !!subject.trim() && !!body.trim() && !ctaHalfFilled;

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminApi.sendTestEmailBroadcast({ ...draft(), to: testTo.trim() });
      setResult(res.data.message);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Couldn't send the test email");
    } finally {
      setTesting(false);
    }
  };

  const openConfirm = async () => {
    setConfirming(true);
    setReach(null);
    setReachError(null);
    try {
      const res = await adminApi.previewEmailBroadcast({ audience });
      setReach(res.data.recipientCount);
    } catch (err: any) {
      setReachError(err?.response?.data?.message || "Couldn't count the recipients");
    }
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await adminApi.createEmailBroadcast({ ...draft(), audience });
      setResult(`${res.data.message} It goes out gradually — progress is shown below.`);
      setSubject("");
      setBody("");
      setCtaLabel("");
      setCtaUrl("");
      setConfirming(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to queue the email");
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const cancel = async (b: AdminEmailBroadcast) => {
    if (!window.confirm(`Stop sending "${b.subject}"? Emails already sent can't be recalled.`)) return;
    try {
      await adminApi.cancelEmailBroadcast(b._id);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Couldn't cancel");
    }
  };

  const daysNeeded = reach && dailyCap ? Math.ceil(reach / dailyCap) : 1;

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <h1 style={styles.title}>Email Users</h1>
        <p style={styles.subtitle}>
          Send an email to every OurCityvibe user, or to vendors only. It goes out from
          hello@ourcityvibe.com a little at a time — up to {dailyCap || "…"} a day, so password resets
          and ticket emails keep working — and every email has a one-click unsubscribe. People who
          unsubscribed are skipped automatically.
        </p>
        {!loading && (
          <p style={styles.quota}>
            Broadcast emails sent today: <strong>{sentToday}</strong> / {dailyCap}
          </p>
        )}
      </div>

      {result && (
        <div style={styles.resultBanner}>
          {result}
          <button style={styles.resultClose} onClick={() => setResult(null)}>
            ×
          </button>
        </div>
      )}
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.card}>
        <label style={styles.label}>
          Subject
          <span style={styles.counter}>
            {subject.length}/{SUBJECT_MAX}
          </span>
        </label>
        <input
          style={styles.input}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. What's on this weekend 🎉"
          maxLength={SUBJECT_MAX}
        />

        <label style={styles.label}>
          Message
          <span style={styles.counter}>
            {body.length}/{BODY_MAX}
          </span>
        </label>
        <textarea
          style={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Write your message. Leave an empty line between paragraphs.\n\nEach email starts with \"Hi <their username>,\" automatically."}
          rows={10}
          maxLength={BODY_MAX}
        />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Button text (optional)</label>
            <input
              style={styles.input}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="e.g. Open OurCityvibe"
              maxLength={CTA_LABEL_MAX}
            />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>Button link (optional)</label>
            <input
              style={styles.input}
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://www.ourcityvibe.com/events"
            />
          </div>
        </div>
        {ctaHalfFilled && <div style={styles.hint}>Fill in both the button text and link, or leave both empty.</div>}

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Send to</label>
            <select
              style={styles.input}
              value={audience}
              onChange={(e) => setAudience(e.target.value as EmailAudience)}
            >
              <option value="all">Everyone</option>
              <option value="vendors">Vendors / business accounts only</option>
            </select>
          </div>
        </div>

        <div style={styles.testBox}>
          <label style={{ ...styles.label, marginTop: 0 }}>Send yourself a test first</label>
          <div style={styles.row}>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="your@email.com"
              type="email"
            />
            <button
              style={{
                ...styles.btn,
                ...styles.btnCancel,
                ...(!canSend || !testTo.trim() || testing ? styles.btnDisabled : {}),
              }}
              disabled={!canSend || !testTo.trim() || testing}
              onClick={sendTest}
            >
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
        </div>

        <div style={styles.actionBtns}>
          <button
            style={{ ...styles.btn, ...styles.btnSend, ...(!canSend ? styles.btnDisabled : {}) }}
            disabled={!canSend}
            onClick={openConfirm}
          >
            Review & send
          </button>
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Sent emails</h2>
      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : broadcasts.length === 0 ? (
        <div style={styles.empty}>No emails sent yet.</div>
      ) : (
        <div style={styles.cardGrid}>
          {broadcasts.map((b) => {
            const processed = b.sent + b.failed + b.skipped;
            const pct = b.total ? Math.min(100, Math.round((processed / b.total) * 100)) : 0;
            return (
              <div key={b._id} style={styles.historyCard}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderText}>
                    <div style={styles.cardTitle}>{b.subject}</div>
                    <div style={styles.cardBody}>
                      {b.body.length > 160 ? `${b.body.slice(0, 160)}…` : b.body}
                    </div>
                  </div>
                  <span style={styles.statusBadge}>{STATUS_LABEL[b.status]}</span>
                </div>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                </div>
                <div style={styles.cardMeta}>
                  {new Date(b.createdAt).toLocaleString()} by {b.sentBy} · {b.audienceSummary} ·{" "}
                  <strong style={{ color: colors.text }}>{b.sent}</strong> sent of {b.total}
                  {b.skipped ? ` · ${b.skipped} skipped (unsubscribed or no longer eligible)` : ""}
                  {b.failed ? ` · ${b.failed} failed` : ""}
                </div>
                {isRunning(b) && (
                  <div>
                    <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={() => cancel(b)}>
                      Cancel sending
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirming && (
        <div style={styles.modalOverlay} onClick={() => !sending && setConfirming(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              Email {audience === "all" ? "everyone" : "all vendors"}?
            </h3>
            <p style={styles.modalDesc}>
              Once sending starts, emails that have gone out can't be recalled. Read it once more —
              and send yourself a test first if you haven't.
            </p>
            <div style={styles.previewCard}>
              <div style={styles.previewTitle}>{subject}</div>
              <div style={styles.previewBody}>
                {body.length > 400 ? `${body.slice(0, 400)}…` : body}
              </div>
            </div>
            <div style={styles.reachBox}>
              {reachError ? (
                <span style={{ color: "#ef4444" }}>{reachError}</span>
              ) : reach === null ? (
                <span>Counting recipients…</span>
              ) : (
                <>
                  <strong style={{ color: colors.text }}>
                    {reach} {reach === 1 ? "person" : "people"}
                  </strong>{" "}
                  will get this email.
                  <div style={styles.reachHint}>
                    {daysNeeded > 1
                      ? `At up to ${dailyCap} a day, this will take about ${daysNeeded} days to finish.`
                      : "It should finish going out within a couple of hours."}
                  </div>
                </>
              )}
            </div>
            <div style={styles.modalActions}>
              <button style={{ ...styles.btn, ...styles.btnCancel }} onClick={() => setConfirming(false)} disabled={sending}>
                Back
              </button>
              <button
                style={{
                  ...styles.btn,
                  ...styles.btnSend,
                  ...(!reach || sending ? styles.btnDisabled : {}),
                }}
                onClick={send}
                disabled={!reach || sending}
              >
                {sending ? "Queuing…" : reach ? `Send to ${reach}` : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: "32px 28px", maxWidth: 1000 },
  pageHeader: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: colors.text, margin: 0 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4, maxWidth: 760, lineHeight: 1.55 },
  quota: { fontSize: 13, color: colors.textMuted, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: colors.text, margin: "32px 0 14px" },
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
  resultClose: { background: "transparent", border: "none", color: colors.textMuted, fontSize: 20, cursor: "pointer", lineHeight: 1 },
  errorBanner: {
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    fontWeight: 600,
    color: colors.textMuted,
    marginTop: 12,
    marginBottom: 6,
  },
  counter: { fontWeight: 400, fontSize: 12 },
  hint: { fontSize: 12, color: "#f59e0b", marginTop: 4 },
  input: {
    width: "100%",
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    fontSize: 14,
    boxSizing: "border-box",
  },
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
    lineHeight: 1.5,
  },
  row: { display: "flex", gap: 14, alignItems: "flex-end" },
  testBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 10,
    background: colors.bg,
    border: `1px dashed ${colors.border}`,
  },
  actionBtns: { display: "flex", gap: 8, marginTop: 20 },
  btn: { padding: "9px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" },
  btnSend: { background: colors.primary, color: "#fff" },
  btnCancel: { background: colors.border, color: colors.text },
  btnDanger: { background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", padding: "6px 14px", fontSize: 13 },
  btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  empty: { textAlign: "center", padding: "40px 0", color: colors.textMuted, fontSize: 15 },
  cardGrid: { display: "flex", flexDirection: "column", gap: 12 },
  historyCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardHeader: { display: "flex", alignItems: "flex-start", gap: 14 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: colors.text },
  cardBody: { fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-line" },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "3px 10px",
    flexShrink: 0,
    color: colors.textMuted,
    maxWidth: 220,
    textAlign: "right",
  },
  progressTrack: { height: 6, borderRadius: 999, background: colors.bg, overflow: "hidden" },
  progressFill: { height: "100%", background: colors.primary, borderRadius: 999, transition: "width 0.4s" },
  previewCard: { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14 },
  previewTitle: { fontSize: 14, fontWeight: 700, color: colors.text },
  previewBody: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-line", maxHeight: 180, overflow: "auto" },
  reachBox: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 8,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    fontSize: 13,
    color: colors.textMuted,
  },
  reachHint: { marginTop: 4, fontSize: 12, color: colors.textMuted },
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
    width: 500,
    maxWidth: "90vw",
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: colors.text, margin: "0 0 8px" },
  modalDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 14, lineHeight: 1.6 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
};
