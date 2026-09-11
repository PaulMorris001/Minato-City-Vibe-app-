import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import type { AdminAnnouncement, AdminUser, AnnouncementGroup, City } from "../types";
import { colors } from "../constants/colors";

const TITLE_MAX = 80;
const BODY_MAX = 240;

type Audience = "all" | "targeted";
type StateTarget = { country: string; state: string };
type CityTarget = { country: string; state: string; city: string };

const unique = <T,>(items: T[]) => [...new Set(items)];
const targetLabel = (announcement: AdminAnnouncement) =>
  announcement.audience === "all"
    ? "Everyone"
    : announcement.audience === "city"
      ? announcement.city || "City"
      : announcement.targets?.summary || "Selected audience";

/**
 * Broadcast a push + in-app notification to the user base.
 *
 * Every recipient gets a durable in-app notification as well as the push, so
 * someone whose push token is stale still finds the message in the app.
 */
export default function Announcements() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [groups, setGroups] = useState<AnnouncementGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<StateTarget[]>([]);
  const [targetCities, setTargetCities] = useState<CityTarget[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);
  const [deepLink, setDeepLink] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Real reach, fetched when the confirm modal opens. Location coverage is
  // patchy and stored values are inconsistent, so a target that reads as broad
  // can match almost nobody — and a send can't be recalled.
  const [reach, setReach] = useState<{ recipientCount: number; pushedCount: number; summary: string } | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [announcementRes, cityRes, groupRes] = await Promise.all([
        adminApi.getAnnouncements(), adminApi.getCities(), adminApi.getAnnouncementGroups(),
      ]);
      setAnnouncements(announcementRes.data.announcements);
      setCities(cityRes.data);
      setGroups(groupRes.data.groups);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    title.length <= TITLE_MAX &&
    body.length <= BODY_MAX &&
    (audience === "all" || countries.length + states.length + targetCities.length + groupIds.length + selectedUsers.length > 0);

  const searchUsers = async () => {
    const term = userSearch.trim();
    if (!term) return setUsers([]);
    const res = await adminApi.getUsers({ search: term, limit: 10 });
    setUsers(res.data.users.filter((user) => !selectedUsers.some((selected) => selected._id === user._id)));
  };

  const addUser = (user: AdminUser) => {
    setSelectedUsers((current) => [...current, user]);
    setUsers((current) => current.filter((candidate) => candidate._id !== user._id));
  };

  const audiencePayload = () => ({
    audience,
    ...(audience === "targeted"
      ? {
          targets: {
            countries, states, cities: targetCities,
            userIds: selectedUsers.map((user) => user._id), groupIds,
          },
        }
      : {}),
  });

  const openConfirm = async () => {
    setConfirming(true);
    setReach(null);
    setReachError(null);
    try {
      const res = await adminApi.previewAnnouncementAudience(audiencePayload());
      setReach(res.data);
    } catch (err: any) {
      setReachError(err?.response?.data?.message || "Couldn't work out the audience");
    }
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await adminApi.sendAnnouncement({
        title: title.trim(),
        body: body.trim(),
        ...audiencePayload(),
        ...(deepLink.trim() ? { deepLink: deepLink.trim() } : {}),
      });
      setResult(res.data.message);
      setTitle("");
      setBody("");
      setDeepLink("");
      setCountries([]); setStates([]); setTargetCities([]); setGroupIds([]); setSelectedUsers([]); setUsers([]); setUserSearch("");
      setConfirming(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to send announcement");
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.title}>Announcements</h1>
          <p style={styles.subtitle}>
            Send a push notification to everyone, or build an audience from countries, states,
            cities, group chats and individual users.
            Recipients also get it in their in-app notifications list, so it isn't lost if the push
            doesn't land.
          </p>
        </div>
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
          Title
          <span style={styles.counter}>
            {title.length}/{TITLE_MAX}
          </span>
        </label>
        <input
          style={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. New this week in Lagos 🎉"
          maxLength={TITLE_MAX}
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
          placeholder="Keep it short — this shows on a lock screen."
          rows={3}
          maxLength={BODY_MAX}
        />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Audience</label>
            <select
              style={styles.input}
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              <option value="all">Everyone</option>
              <option value="targeted">Selected audience</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Deep link (optional)</label>
            <input
              style={styles.input}
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              placeholder="/event/abc123"
            />
          </div>
        </div>

        {audience === "targeted" && (
          <div style={styles.targets}>
            <div style={styles.targetHint}>Choose one or more recipients below. Selections are combined and a person is only notified once.</div>
            <div style={styles.targetGrid}>
              <div>
                <label style={styles.label}>Countries</label>
                <select multiple style={styles.multiSelect} value={countries} onChange={(e) => setCountries([...e.currentTarget.selectedOptions].map((o) => o.value))}>
                  {unique(cities.map((city) => city.country || "United States")).sort().map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>States</label>
                <select multiple style={styles.multiSelect} value={states.map((state) => `${state.country}|${state.state}`)} onChange={(e) => setStates([...e.currentTarget.selectedOptions].map((o) => { const [country, state] = o.value.split("|"); return { country, state }; }))}>
                  {unique(cities.map((city) => `${city.country || "United States"}|${city.state}`)).sort().map((value) => <option key={value} value={value}>{value.replace("|", " — ")}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Cities</label>
                <select multiple style={styles.multiSelect} value={targetCities.map((city) => `${city.country}|${city.state}|${city.city}`)} onChange={(e) => setTargetCities([...e.currentTarget.selectedOptions].map((o) => { const [country, state, city] = o.value.split("|"); return { country, state, city }; }))}>
                  {cities.slice().sort((a, b) => `${a.country}${a.state}${a.name}`.localeCompare(`${b.country}${b.state}${b.name}`)).map((city) => { const country = city.country || "United States"; const value = `${country}|${city.state}|${city.name}`; return <option key={city._id} value={value}>{city.name} — {city.state}, {country}</option>; })}
                </select>
              </div>
              <div>
                <label style={styles.label}>Groups</label>
                <select multiple style={styles.multiSelect} value={groupIds} onChange={(e) => setGroupIds([...e.currentTarget.selectedOptions].map((o) => o.value))}>
                  {groups.map((group) => <option key={group._id} value={group._id}>{group.name} ({group.memberCount})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={styles.label}>Individual users</label>
              <div style={styles.userSearch}><input style={styles.input} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchUsers(); } }} placeholder="Search by username or email" /><button style={{ ...styles.btn, ...styles.btnCancel }} onClick={searchUsers} type="button">Search</button></div>
              {users.map((user) => <button key={user._id} type="button" style={styles.userOption} onClick={() => addUser(user)}>{user.username} · {user.email}</button>)}
              {selectedUsers.length > 0 && <div style={styles.chips}>{selectedUsers.map((user) => <button key={user._id} type="button" style={styles.chip} onClick={() => setSelectedUsers((current) => current.filter((selected) => selected._id !== user._id))}>{user.username} ×</button>)}</div>}
            </div>
          </div>
        )}

        <div style={styles.preview}>
          <div style={styles.previewLabel}>Preview</div>
          <div style={styles.previewCard}>
            <div style={styles.previewTitle}>{title || "Title"}</div>
            <div style={styles.previewBody}>{body || "Your message goes here."}</div>
          </div>
        </div>

        <div style={styles.actionBtns}>
          <button
            style={{ ...styles.btn, ...styles.btnSend, ...(canSend ? {} : styles.btnDisabled) }}
            onClick={openConfirm}
            disabled={!canSend || sending}
          >
            {sending ? "Sending..." : "Send announcement"}
          </button>
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Recent sends</h2>
      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : announcements.length === 0 ? (
        <div style={styles.empty}>Nothing sent yet.</div>
      ) : (
        <div style={styles.cardGrid}>
          {announcements.map((a) => (
            <div key={a._id} style={styles.historyCard}>
              <div style={styles.cardHeader}>
                <div style={styles.cardHeaderText}>
                  <div style={styles.cardTitle}>{a.title}</div>
                  <div style={styles.cardBody}>{a.body}</div>
                </div>
                <span style={styles.statusBadge}>
                  {targetLabel(a)}
                </span>
              </div>
              <div style={styles.cardMeta}>
                {new Date(a.createdAt).toLocaleString()}
                {a.sentBy ? ` by ${a.sentBy}` : ""} · {a.recipientCount} recipient
                {a.recipientCount === 1 ? "" : "s"} · {a.pushedCount} with a push token
                {a.deepLink ? ` · → ${a.deepLink}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <div style={styles.modalOverlay} onClick={() => setConfirming(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Send this to {audience === "all" ? "everyone" : "the selected audience"}?</h3>
            <p style={styles.modalDesc}>
              This notifies every matching account at once and can't be recalled. Read it once more
              before you send.
            </p>
            <div style={styles.previewCard}>
              <div style={styles.previewTitle}>{title}</div>
              <div style={styles.previewBody}>{body}</div>
            </div>

            <div style={styles.reachBox}>
              {reachError ? (
                <span style={{ color: "#ef4444" }}>{reachError}</span>
              ) : !reach ? (
                <span>Working out who this reaches…</span>
              ) : (
                <>
                  <strong style={{ color: colors.text }}>
                    {reach.recipientCount} account{reach.recipientCount === 1 ? "" : "s"}
                  </strong>{" "}
                  — {reach.summary}
                  <div style={styles.reachHint}>
                    {reach.pushedCount} of them can receive a push right now; the rest get it in
                    the app the next time they open it.
                  </div>
                </>
              )}
            </div>

            <div style={styles.modalActions}>
              <button
                style={{ ...styles.btn, ...styles.btnCancel }}
                onClick={() => setConfirming(false)}
              >
                Back
              </button>
              <button
                style={{
                  ...styles.btn,
                  ...styles.btnSend,
                  ...(!reach || sending ? { opacity: 0.45, cursor: "not-allowed" } : {}),
                }}
                onClick={handleSend}
                disabled={sending || !reach}
              >
                {sending ? "Sending..." : reach ? `Send to ${reach.recipientCount}` : "Send it"}
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
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4, maxWidth: 720 },
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
  resultClose: {
    background: "transparent",
    border: "none",
    color: colors.textMuted,
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
  },
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
  },
  row: { display: "flex", gap: 14, alignItems: "flex-end" },
  targets: { marginTop: 18, paddingTop: 4 },
  targetHint: { fontSize: 13, color: colors.textMuted, lineHeight: 1.45, marginBottom: 10 },
  targetGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  multiSelect: {
    width: "100%", minHeight: 112, background: colors.bg, border: `1px solid ${colors.border}`,
    borderRadius: 8, padding: 6, color: colors.text, fontSize: 13, boxSizing: "border-box",
  },
  userSearch: { display: "flex", gap: 8 },
  userOption: { display: "block", width: "100%", textAlign: "left", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "8px 10px", color: colors.text, cursor: "pointer", marginTop: 6, fontSize: 13 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { background: "rgba(99, 102, 241, 0.14)", border: `1px solid ${colors.border}`, borderRadius: 999, padding: "5px 9px", color: colors.text, cursor: "pointer", fontSize: 12 },
  preview: { marginTop: 18 },
  previewLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: 600,
    marginBottom: 6,
  },
  previewCard: {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 14,
  },
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
  previewTitle: { fontSize: 14, fontWeight: 700, color: colors.text },
  previewBody: { fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 1.5 },
  actionBtns: { display: "flex", gap: 8, marginTop: 20 },
  btn: {
    padding: "9px 20px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  btnSend: { background: colors.primary, color: "#fff" },
  btnCancel: { background: colors.border, color: colors.text },
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
    gap: 8,
  },
  cardHeader: { display: "flex", alignItems: "flex-start", gap: 14 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: colors.text },
  cardBody: { fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 1.5 },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "3px 10px",
    flexShrink: 0,
    color: colors.textMuted,
  },
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
  modalDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 14, lineHeight: 1.6 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
};
