import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api/admin";
import type { AdminRaffleEntry, AdminRaffleCampaign } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import StatCard from "../components/ui/StatCard";
import Modal from "../components/ui/Modal";
import { colors } from "../constants/colors";

// 1 -> "1st", 2 -> "2nd", 11 -> "11th", ...
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// <input type="date"> works in whole days; the campaign window is stored as
// instants. Anchor the start to the first moment of the day and the end to the
// last so a deadline of "Sep 30" includes all of Sep 30.
const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const startInstant = (day: string) => `${day}T00:00:00.000Z`;
const endInstant = (day: string) => `${day}T23:59:59.999Z`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function Raffle() {
  const [campaigns, setCampaigns] = useState<AdminRaffleCampaign[]>([]);
  const [campaign, setCampaign] = useState<AdminRaffleCampaign | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<AdminRaffleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // First fetch has settled — gate the whole page on this so the campaign
  // panel and stats never flash with empty/placeholder data before the real
  // campaign is known.
  const [hydrated, setHydrated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Winner assignment awaiting confirmation; null rank means "clear".
  const [pending, setPending] = useState<{ entry: AdminRaffleEntry; rank: number | null } | null>(null);
  const [working, setWorking] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);

  // Serialized copy of the last data we rendered. A refetch that comes back
  // identical is dropped entirely — no setState, so no re-render / table
  // reflow. Nothing on screen "refreshes" unless something actually changed.
  const lastSnapshot = useRef("");
  // First mount has kicked off — later loads (campaign switch, manual refresh,
  // post-action reloads) run silently so the table doesn't blank each time.
  const didInit = useRef(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setErr(null);
      try {
        const [entriesRes, campaignsRes] = await Promise.all([
          adminApi.getRaffleEntries(selectedId || undefined),
          adminApi.getRaffleCampaigns(),
        ]);
        const snapshot = JSON.stringify({
          entries: entriesRes.data.entries,
          campaign: entriesRes.data.campaign,
          campaigns: campaignsRes.data.campaigns,
        });
        if (snapshot !== lastSnapshot.current) {
          lastSnapshot.current = snapshot;
          setEntries(entriesRes.data.entries);
          setCampaign(entriesRes.data.campaign);
          setCampaigns(campaignsRes.data.campaigns);
          if (!selectedId && entriesRes.data.campaign?._id) {
            setSelectedId(entriesRes.data.campaign._id);
          }
        }
        setHydrated(true);
      } catch (e: any) {
        setErr(e?.response?.data?.message || "Couldn't load the raffle. Check the connection and retry.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    load({ silent: didInit.current });
    didInit.current = true;
  }, [load]);

  const applyPending = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      await adminApi.setRaffleWinner(pending.entry.eventId, pending.rank);
      setPending(null);
      load({ silent: true });
    } finally {
      setWorking(false);
    }
  };

  const endCampaign = async () => {
    if (!campaign?._id) return;
    setWorking(true);
    try {
      await adminApi.endRaffleCampaign(campaign._id);
      setEndConfirm(false);
      load({ silent: true });
    } finally {
      setWorking(false);
    }
  };

  const ended = campaign
    ? campaign.status === "ended" || Date.now() > new Date(campaign.endDate).getTime()
    : false;
  const daysLeft = campaign
    ? Math.max(0, Math.ceil((new Date(campaign.endDate).getTime() - Date.now()) / 86_400_000))
    : 0;
  const hasActive = campaigns.some((c) => c.status === "active");
  const prizes = campaign?.prizes?.length ? campaign.prizes : [];
  const prizeCount = prizes.length || 3;
  const rewardFor = (rank: number) => prizes.find((p) => p.rank === rank)?.reward;

  const totals = useMemo(() => {
    const rsvps = entries.reduce((sum, e) => sum + e.verifiedRsvps, 0);
    const winners = entries.filter((e) => e.winnerRank != null).length;
    return { rsvps, winners };
  }, [entries]);

  const columns: Column<AdminRaffleEntry>[] = [
    {
      key: "rank",
      header: "Place",
      width: 70,
      render: (e) =>
        e.winnerRank ? (
          <Badge variant="primary">{ordinal(e.winnerRank)}</Badge>
        ) : (
          <span style={{ color: colors.textDim }}>—</span>
        ),
    },
    {
      key: "host",
      header: "Host",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600 }}>@{e.host?.username || "unknown"}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>{e.host?.email}</div>
        </div>
      ),
    },
    {
      key: "event",
      header: "Event",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600 }}>{e.title}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {formatDate(e.date)} · entered {formatDate(e.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: "rsvps",
      header: "Verified RSVPs",
      width: 120,
      render: (e) => <span style={{ fontWeight: 600 }}>{e.verifiedRsvps}</span>,
    },
    {
      key: "invites",
      header: "Invites",
      width: 90,
      render: (e) => <span style={{ color: colors.textMuted }}>{e.totalInvites}</span>,
    },
    {
      key: "score",
      header: "Score",
      width: 80,
      render: (e) => <Badge variant="info">{e.eligibilityScore}</Badge>,
    },
    {
      key: "actions",
      header: "Assign place",
      width: Math.max(220, prizeCount * 52 + 80),
      render: (e) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Array.from({ length: prizeCount }, (_, i) => i + 1).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={e.winnerRank === r ? "primary" : "secondary"}
              title={rewardFor(r) || undefined}
              onClick={() => e.winnerRank !== r && setPending({ entry: e, rank: r })}
            >
              {ordinal(r)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={e.winnerRank == null}
            onClick={() => setPending({ entry: e, rank: null })}
          >
            Clear
          </Button>
        </div>
      ),
    },
  ];

  // Hold the page until the first fetch resolves — the campaign panel's fields
  // are seeded from the fetched campaign, so rendering earlier would show the
  // wrong state (empty "new campaign" form) for a frame.
  if (!hydrated) {
    return (
      <div style={styles.loading}>
        {err ? (
          <>
            <span>{err}</span>
            <Button variant="secondary" size="sm" onClick={() => load()}>
              Retry
            </Button>
          </>
        ) : (
          "Loading raffle…"
        )}
      </div>
    );
  }

  return (
    <>
      <PageShell
        toolbar={
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 13, color: colors.textMuted }}>Campaign</label>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
                style={styles.select}
              >
                {campaigns.length === 0 && <option value="">(none configured)</option>}
                {campaigns.map((c) => (
                  <option key={c._id ?? "synthetic"} value={c._id ?? ""}>
                    {c.name} · {c.status}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" size="sm" onClick={() => load({ silent: true })}>
              Refresh
            </Button>
          </>
        }
      >
        <CampaignPanel
          campaign={campaign}
          hasActive={hasActive}
          onSaved={(c) => {
            setSelectedId(c._id);
            load({ silent: true });
          }}
          onError={setErr}
          onEndClick={() => setEndConfirm(true)}
        />

        {err && <div style={{ ...styles.panelRow, color: colors.error }}>{err}</div>}

        <div style={styles.stats}>
          <StatCard label="Entries" value={entries.length} icon="🎂" />
          <StatCard label="Verified RSVPs" value={totals.rsvps} icon="✅" accent={colors.success} />
          <StatCard
            label="Winners picked"
            value={`${totals.winners} / ${prizeCount}`}
            icon="🏆"
            accent={colors.warning}
          />
          <StatCard
            label={campaign ? `Ends ${formatDate(campaign.endDate)}` : "No campaign"}
            value={ended ? "Ended" : `${daysLeft}d left`}
            icon="⏳"
            accent={ended ? colors.textDim : colors.info}
          />
        </div>

        {!ended && !loading && entries.length > 0 && (
          <div style={styles.notice}>
            Campaign is still open — entries can still gain RSVPs. Winners are normally
            drawn after {campaign ? formatDate(campaign.endDate) : "the deadline"}.
          </div>
        )}

        <Table
          columns={columns}
          data={entries}
          keyExtractor={(e) => e.eventId}
          loading={loading}
          emptyMessage="No birthday-raffle events in this campaign window"
        />
      </PageShell>

      <Modal
        open={!!pending}
        title={
          pending?.rank == null
            ? "Clear this winner?"
            : `Set ${pending ? ordinal(pending.rank) : ""} place winner?`
        }
        onClose={() => setPending(null)}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" size="sm" onClick={() => setPending(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={applyPending} loading={working}>
              {pending?.rank == null ? "Clear" : "Confirm"}
            </Button>
          </div>
        }
      >
        {pending && (
          <p style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>
            {pending.rank == null ? (
              <>
                Remove <strong style={{ color: colors.text }}>{pending.entry.title}</strong> (@
                {pending.entry.host?.username}) from the winners list.
              </>
            ) : (
              <>
                Mark <strong style={{ color: colors.text }}>{pending.entry.title}</strong> (@
                {pending.entry.host?.username}) as the {ordinal(pending.rank)} place winner
                {rewardFor(pending.rank) ? ` — ${rewardFor(pending.rank)}` : ""}. Any entry in this
                campaign currently holding {ordinal(pending.rank)} place will be unset.
              </>
            )}
          </p>
        )}
      </Modal>

      <Modal
        open={endConfirm}
        title="End this campaign?"
        onClose={() => setEndConfirm(false)}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" size="sm" onClick={() => setEndConfirm(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={endCampaign} loading={working}>
              End campaign
            </Button>
          </div>
        }
      >
        <p style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          New birthday events can no longer enter until you create the next campaign. Entries
          and any winners already picked stay as they are.
        </p>
      </Modal>
    </>
  );
}

/** Current-campaign detail + inline date editing, or the "new campaign" form. */
function CampaignPanel({
  campaign,
  hasActive,
  onSaved,
  onError,
  onEndClick,
}: {
  campaign: AdminRaffleCampaign | null;
  hasActive: boolean;
  onSaved: (c: AdminRaffleCampaign) => void;
  onError: (msg: string | null) => void;
  onEndClick: () => void;
}) {
  const real = !!campaign?._id;
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // One reward string per winner tier; array length = number of winners.
  const [rewards, setRewards] = useState<string[]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const campaignRewards = (c: AdminRaffleCampaign | null) =>
    c?.prizes?.length ? [...c.prizes].sort((a, b) => a.rank - b.rank).map((p) => p.reward) : ["", "", ""];

  // Reset the edit fields whenever the selected campaign changes.
  useEffect(() => {
    if (real && campaign) {
      setName(campaign.name);
      setStart(toDateInput(campaign.startDate));
      setEnd(toDateInput(campaign.endDate));
      setRewards(campaignRewards(campaign));
      setCreating(false);
    } else {
      setName("");
      setStart("");
      setEnd("");
      setRewards(["", "", ""]);
    }
  }, [campaign, real]);

  const setReward = (i: number, v: string) =>
    setRewards((prev) => prev.map((r, idx) => (idx === i ? v : r)));
  const addTier = () => setRewards((prev) => [...prev, ""]);
  const removeTier = (i: number) => setRewards((prev) => prev.filter((_, idx) => idx !== i));

  const rewardsDirty =
    real && campaign != null && JSON.stringify(rewards) !== JSON.stringify(campaignRewards(campaign));
  const dirty =
    real &&
    campaign != null &&
    (name !== campaign.name ||
      start !== toDateInput(campaign.startDate) ||
      end !== toDateInput(campaign.endDate) ||
      rewardsDirty);

  const prizesPayload = () => rewards.map((r) => ({ reward: r.trim() }));

  const save = async () => {
    onError(null);
    setSaving(true);
    try {
      const res = await adminApi.updateRaffleCampaign(campaign!._id as string, {
        name: name.trim(),
        startDate: startInstant(start),
        endDate: endInstant(end),
        prizes: prizesPayload(),
      });
      onSaved(res.data.campaign);
    } catch (e: any) {
      onError(e?.response?.data?.message || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    onError(null);
    setSaving(true);
    try {
      const res = await adminApi.createRaffleCampaign({
        name: name.trim(),
        startDate: startInstant(start),
        endDate: endInstant(end),
        prizes: prizesPayload(),
      });
      onSaved(res.data.campaign);
    } catch (e: any) {
      onError(e?.response?.data?.message || "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  };

  const showCreate = creating || !real;
  const canSubmit =
    !!name.trim() && !!start && !!end && rewards.length > 0 && rewards.every((r) => r.trim());

  return (
    <div style={styles.panel}>
      <div style={styles.panelHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 15 }}>
            {showCreate ? "New campaign" : campaign?.name}
          </strong>
          {real && !creating && (
            <Badge variant={campaign?.status === "active" ? "success" : "default"}>
              {campaign?.status}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {real && campaign?.status === "active" && !creating && (
            <Button variant="danger" size="sm" onClick={onEndClick}>
              End campaign
            </Button>
          )}
          {real && !creating && !hasActive && (
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              New campaign
            </Button>
          )}
          {creating && (
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {!real && !creating && (
        <div style={styles.panelRow}>
          No campaign configured — the raffle is running on the legacy hardcoded deadline
          {campaign ? ` (${formatDate(campaign.endDate)})` : ""}. Create one below to manage the
          dates from here (or run the <code>seedRaffleCampaign.mjs</code> script to import the
          legacy window as-is).
        </div>
      )}

      <div style={styles.fields}>
        <Field label="Name">
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Birthday Raffle — Winter 2026"
          />
        </Field>
        <Field label="Start date">
          <input
            type="date"
            style={styles.input}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="End date (deadline)">
          <input
            type="date"
            style={styles.input}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>

      <div style={styles.prizeBlock}>
        <div style={styles.prizeHead}>
          <span style={styles.fieldLabel}>
            Winners &amp; prizes · {rewards.length} winner{rewards.length === 1 ? "" : "s"}
          </span>
          <Button variant="secondary" size="sm" onClick={addTier}>
            + Add winner
          </Button>
        </div>
        {rewards.map((r, i) => (
          <div key={i} style={styles.prizeRow}>
            <span style={styles.prizeRank}>{ordinal(i + 1)}</span>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={r}
              onChange={(e) => setReward(i, e.target.value)}
              placeholder="e.g. ₦150,000 Cash + Premium Event Pass"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={rewards.length <= 1}
              onClick={() => removeTier(i)}
              title="Remove this winner"
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <div>
        {showCreate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={create}
            disabled={!canSubmit || hasActive}
            loading={saving}
          >
            {hasActive ? "End current first" : "Create campaign"}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={!dirty || !canSubmit}
            loading={saving}
          >
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
      <span
        style={{
          fontSize: 11,
          color: colors.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    background: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
  },
  input: {
    background: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 13,
  },
  panel: {
    padding: "16px",
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  panelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  panelRow: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 1.5,
  },
  fields: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prizeBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: 520,
  },
  prizeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  prizeRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  prizeRank: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.textMuted,
    width: 34,
    flexShrink: 0,
  },
  stats: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    padding: 16,
    borderBottom: `1px solid ${colors.border}`,
  },
  notice: {
    padding: "10px 14px",
    fontSize: 13,
    color: colors.textMuted,
    background: colors.infoDim,
    borderBottom: `1px solid ${colors.border}`,
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 48,
    fontSize: 14,
    color: colors.textMuted,
  },
};
