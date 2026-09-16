import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api/admin";
import type { AdminRaffleEntry, AdminRaffleCampaign, AdminVendor } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import StatCard from "../components/ui/StatCard";
import Modal, { ConfirmModal } from "../components/ui/Modal";
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
  const [deleteEntry, setDeleteEntry] = useState<AdminRaffleEntry | null>(null);
  const [deleteCampaignConfirm, setDeleteCampaignConfirm] = useState(false);

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

  const [drawConfirm, setDrawConfirm] = useState(false);
  const [drawResult, setDrawResult] = useState<string | null>(null);

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

  const removeEntry = async () => {
    if (!deleteEntry) return;
    setWorking(true);
    try {
      await adminApi.deleteRaffleEntry(deleteEntry.eventId, campaign?._id || undefined);
      setDeleteEntry(null);
      load({ silent: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to remove raffle entry");
    } finally {
      setWorking(false);
    }
  };

  const removeCampaign = async () => {
    if (!campaign?._id) return;
    setWorking(true);
    try {
      await adminApi.deleteRaffleCampaign(campaign._id);
      setDeleteCampaignConfirm(false);
      setSelectedId(null);
      lastSnapshot.current = "";
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to delete campaign");
      setDeleteCampaignConfirm(false);
    } finally {
      setWorking(false);
    }
  };

  const runDraw = async () => {
    if (!campaign?._id) return;
    setWorking(true);
    try {
      const res = await adminApi.drawRaffleWinners(campaign._id);
      const lines = res.data.winners
        .map((w) => `#${w.rank} — ${w.eventTitle}${w.username ? ` (${w.username})` : ""}, ${w.tickets} entries`)
        .join("\n");
      setDrawResult(
        `Drew ${res.data.winners.length} winner(s) from ${res.data.totalTickets} entries across ${res.data.totalEntries} events:\n${lines}`
      );
      setDrawConfirm(false);
      load({ silent: true });
    } catch (err: any) {
      setDrawResult(err?.response?.data?.message || "The draw could not be run.");
      setDrawConfirm(false);
    } finally {
      setWorking(false);
    }
  };

  const ended = campaign
    ? campaign.status === "ended" || Date.now() > new Date(campaign.endDate).getTime()
    : false;
  // "active" status only means admin hasn't ended it — the app also gates on
  // startDate (isCampaignOpen, server-side), so a campaign scheduled to start
  // later reads as active+not-ended here but ISN'T actually open yet. Surface
  // that distinctly so a future start date doesn't look indistinguishable
  // from "live right now".
  const notStarted =
    !!campaign && !ended && new Date(campaign.startDate).getTime() > Date.now();
  const daysLeft = campaign
    ? Math.max(0, Math.ceil((new Date(campaign.endDate).getTime() - Date.now()) / 86_400_000))
    : 0;
  const prizes = campaign?.prizes?.length ? campaign.prizes : [];
  const prizeCount = prizes.length || 3;
  // Both regional coupon values, since the admin picking a winner isn't
  // picking a country — the winner's own coupon amount is resolved
  // server-side at read time. There's no cash prize: the coupon amount IS
  // the reward, with an optional non-cash extra alongside it.
  const rewardFor = (rank: number) => {
    const p = prizes.find((p) => p.rank === rank);
    if (!p) return undefined;
    const amounts: string[] = [];
    if (p.couponNGN) amounts.push(`₦${p.couponNGN.toLocaleString()}`);
    if (p.couponUSD) amounts.push(`$${p.couponUSD.toLocaleString()}`);
    const coupon = amounts.length ? `${amounts.join(" / ")} credit` : undefined;
    if (coupon && p.extraPerk) return `${coupon} + ${p.extraPerk}`;
    return coupon || p.extraPerk || undefined;
  };

  const totals = useMemo(() => {
    const rsvps = entries.reduce((sum, e) => sum + e.verifiedRsvps, 0);
    const winners = entries.filter((e) => e.winnerRank != null).length;
    const eligible = entries.filter((e) => e.isEligible).length;
    return { rsvps, winners, eligible };
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
      key: "location",
      header: "Location",
      width: 130,
      // So the admin can sanity-check a winner's country before locking their
      // prize to a NGN- or USD-side vendor.
      render: (e) => {
        const loc = e.host?.location;
        const label = [loc?.city, loc?.state, loc?.country].filter(Boolean).join(", ");
        return label ? (
          <span style={{ fontSize: 13 }}>{label}</span>
        ) : (
          <span style={{ color: colors.textDim }}>Unknown</span>
        );
      },
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
      key: "eligible",
      header: "Eligible",
      width: 90,
      render: (e) =>
        e.isEligible ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <Badge variant="default">Not yet</Badge>
        ),
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
          <Button size="sm" variant="danger" onClick={() => setDeleteEntry(e)}>
            Remove
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
          onSaved={(c) => {
            setSelectedId(c._id);
            load({ silent: true });
          }}
          onError={setErr}
          onEndClick={() => setEndConfirm(true)}
          onDeleteClick={() => setDeleteCampaignConfirm(true)}
        />

        {err && <div style={{ ...styles.panelRow, color: colors.error }}>{err}</div>}

        <div style={styles.stats}>
          <StatCard label="Entries" value={entries.length} icon="🎂" />
          <StatCard label="Verified RSVPs" value={totals.rsvps} icon="✅" accent={colors.success} />
          <StatCard
            label={`Eligible (≥${campaign?.minReferrals ?? 6} RSVPs)`}
            value={`${totals.eligible} / ${entries.length}`}
            icon="🎯"
            accent={colors.info}
          />
          <StatCard
            label="Winners picked"
            value={`${totals.winners} / ${prizeCount}`}
            icon="🏆"
            accent={colors.warning}
          />
          <StatCard
            label={
              campaign
                ? notStarted
                  ? `Starts ${formatDate(campaign.startDate)}`
                  : `Ends ${formatDate(campaign.endDate)}`
                : "No campaign"
            }
            value={ended ? "Ended" : notStarted ? "Not open yet" : `${daysLeft}d left`}
            icon="⏳"
            accent={ended ? colors.textDim : notStarted ? colors.warning : colors.info}
          />
        </div>

        {notStarted && !loading && (
          <div style={styles.notice}>
            This campaign's start date ({formatDate(campaign!.startDate)}) hasn't arrived yet —
            "Create Birthday Event" stays disabled in the app and shows "Raffle Has Ended" until
            then. Set the start date to today (or earlier) if it should be live right now.
          </div>
        )}

        {!ended && !notStarted && !loading && entries.length > 0 && (
          <div style={styles.notice}>
            Campaign is still open — entries can still gain RSVPs. Winners are normally
            drawn after {campaign ? formatDate(campaign.endDate) : "the deadline"}, from
            entries with at least {campaign?.minReferrals ?? 6} verified RSVPs.
          </div>
        )}

        {/* The published official rules promise entrants a random draw weighted
            by their entry count, so the draw is run here rather than by picking
            winners out of the table by hand. */}
        {ended && !loading && entries.length > 0 && campaign?._id && (
          <div style={styles.notice}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 240 }}>
                This campaign has closed. Running the draw picks {prizeCount} winner
                {prizeCount === 1 ? "" : "s"} at random, weighted by each entry's ticket count
                (1 per event + 1 per verified RSVP), with one prize per entrant. It replaces any
                existing result and notifies the winners.
              </span>
              <Button variant="primary" size="sm" onClick={() => setDrawConfirm(true)}>
                {totals.winners > 0 ? "Re-run draw" : "Draw winners"}
              </Button>
            </div>
          </div>
        )}

        {drawResult && (
          <div style={{ ...styles.notice, whiteSpace: "pre-line" }}>
            {drawResult}
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setDrawResult(null)}>
                Dismiss
              </Button>
            </div>
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
          New birthday events can no longer enter until you create the next campaign, and the
          app's countdown and "Create Birthday Event" button update immediately to reflect that.
          Entries and any winners already picked stay as they are.
        </p>
      </Modal>

      <Modal
        open={drawConfirm}
        title="Run the random draw?"
        onClose={() => setDrawConfirm(false)}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" size="sm" onClick={() => setDrawConfirm(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={runDraw} loading={working}>
              Run draw
            </Button>
          </div>
        }
      >
        <p style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          This selects {prizeCount} winner{prizeCount === 1 ? "" : "s"} at random from{" "}
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}, weighted by ticket count,
          and notifies them in the app. Any winners already recorded for this campaign are
          replaced.
        </p>
      </Modal>

      <ConfirmModal
        open={!!deleteEntry}
        title="Remove raffle entry?"
        message={
          deleteEntry
            ? `This permanently removes ${deleteEntry.title} (@${deleteEntry.host?.username || "unknown"}) from the Birthday Raffle. The event itself will also be deleted.`
            : ""
        }
        onCancel={() => setDeleteEntry(null)}
        onConfirm={removeEntry}
        loading={working}
      />

      <ConfirmModal
        open={deleteCampaignConfirm}
        title="Delete this campaign?"
        message={
          campaign
            ? `Delete ${campaign.name}? Its unawarded entries will be kept, but the campaign window and settings will be permanently removed. Campaigns with winners cannot be deleted.`
            : ""
        }
        onCancel={() => setDeleteCampaignConfirm(false)}
        onConfirm={removeCampaign}
        loading={working}
      />
    </>
  );
}

/** Current-campaign detail + inline date editing, or the "new campaign" form. */
function CampaignPanel({
  campaign,
  onSaved,
  onError,
  onEndClick,
  onDeleteClick,
}: {
  campaign: AdminRaffleCampaign | null;
  onSaved: (c: AdminRaffleCampaign) => void;
  onError: (msg: string | null) => void;
  onEndClick: () => void;
  onDeleteClick: () => void;
}) {
  const real = !!campaign?._id;
  // Same "active status doesn't mean open yet" distinction as the parent's
  // `notStarted` — recomputed here since this component only gets `campaign`.
  const notStarted =
    !!campaign &&
    campaign.status === "active" &&
    new Date(campaign.startDate).getTime() > Date.now();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // One tier's coupon value per winner, plus an optional non-cash extra;
  // array length = number of winners. There is no cash prize — the coupon
  // amount IS the reward, so at least one of couponNGN/couponUSD must be
  // positive. Coupon fields are strings (controlled inputs) that default to
  // "0".
  type RewardRow = { couponNGN: string; couponUSD: string; extraPerk: string };
  const EMPTY_ROW: RewardRow = { couponNGN: "0", couponUSD: "0", extraPerk: "" };
  const [rewards, setRewards] = useState<RewardRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  // Verified RSVPs a host needs before they're prize-eligible.
  const [minReferrals, setMinReferrals] = useState("6");
  // The vendor each currency's credit is redeemable at — "" means "any
  // vendor" (no assignment). Holds the vendor's USER id (order.vendor / the
  // coupon lock both ref the user account, not the separate Vendor doc).
  const [vendorNGN, setVendorNGN] = useState("");
  const [vendorUSD, setVendorUSD] = useState("");
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // Fetched once — a plain dropdown is fine at this scale; picking a vendor
  // for a raffle happens a handful of times per campaign, not per request.
  useEffect(() => {
    adminApi
      .getVendors({ limit: 200 })
      .then((r) => setVendors(r.data.vendors))
      .catch(() => {});
  }, []);
  // Only vendors with a linked user account can actually be assigned — that
  // account is what order.vendor / the coupon lock point at, not the Vendor
  // profile doc itself.
  const vendorOptions = vendors.filter((v) => v.user?._id);

  const EMPTY_REWARDS = [{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }];
  const campaignRewards = (c: AdminRaffleCampaign | null): RewardRow[] =>
    c?.prizes?.length
      ? [...c.prizes]
          .sort((a, b) => a.rank - b.rank)
          .map((p) => ({
            couponNGN: String(p.couponNGN ?? 0),
            couponUSD: String(p.couponUSD ?? 0),
            extraPerk: p.extraPerk ?? "",
          }))
      : EMPTY_REWARDS;

  // Reset the edit fields whenever the selected campaign changes.
  useEffect(() => {
    if (real && campaign && !creating) {
      setName(campaign.name);
      setStart(toDateInput(campaign.startDate));
      setEnd(toDateInput(campaign.endDate));
      setRewards(campaignRewards(campaign));
      setMinReferrals(String(campaign.minReferrals ?? 6));
      setVendorNGN(campaign.vendorNGN?._id ?? "");
      setVendorUSD(campaign.vendorUSD?._id ?? "");
      setCreating(false);
    } else {
      setName("");
      setStart("");
      setEnd("");
      setRewards(EMPTY_REWARDS);
      setMinReferrals("6");
      setVendorNGN("");
      setVendorUSD("");
    }
  }, [campaign, real, creating]);

  const setReward = (i: number, field: keyof RewardRow, v: string) =>
    setRewards((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const addTier = () => setRewards((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeTier = (i: number) => setRewards((prev) => prev.filter((_, idx) => idx !== i));

  const rewardsDirty =
    real && campaign != null && JSON.stringify(rewards) !== JSON.stringify(campaignRewards(campaign));
  const dirty =
    real &&
    campaign != null &&
    (name !== campaign.name ||
      start !== toDateInput(campaign.startDate) ||
      end !== toDateInput(campaign.endDate) ||
      rewardsDirty ||
      minReferrals !== String(campaign.minReferrals ?? 6) ||
      vendorNGN !== (campaign.vendorNGN?._id ?? "") ||
      vendorUSD !== (campaign.vendorUSD?._id ?? ""));

  const prizesPayload = () =>
    rewards.map((r) => ({
      couponNGN: Number(r.couponNGN) || 0,
      couponUSD: Number(r.couponUSD) || 0,
      extraPerk: r.extraPerk.trim(),
    }));
  const minReferralsPayload = () => {
    const n = Number(minReferrals);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  const save = async () => {
    onError(null);
    setSaving(true);
    try {
      const res = await adminApi.updateRaffleCampaign(campaign!._id as string, {
        name: name.trim(),
        startDate: startInstant(start),
        endDate: endInstant(end),
        prizes: prizesPayload(),
        minReferrals: minReferralsPayload(),
        vendorNGN: vendorNGN || null,
        vendorUSD: vendorUSD || null,
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
        minReferrals: minReferralsPayload(),
        vendorNGN: vendorNGN || null,
        vendorUSD: vendorUSD || null,
      });
      onSaved(res.data.campaign);
    } catch (e: any) {
      onError(e?.response?.data?.message || "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  };

  const showCreate = creating || !real;
  const validCoupon = (v: string) => v.trim() === "" || (Number(v) >= 0 && Number.isFinite(Number(v)));
  const canSubmit =
    !!name.trim() &&
    !!start &&
    !!end &&
    minReferralsPayload() !== undefined &&
    rewards.length > 0 &&
    rewards.every(
      (r) =>
        validCoupon(r.couponNGN) &&
        validCoupon(r.couponUSD) &&
        ((Number(r.couponNGN) || 0) > 0 || (Number(r.couponUSD) || 0) > 0)
    );

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
          {real && !creating && notStarted && <Badge variant="warning">Not open yet</Badge>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {real && campaign?.status === "active" && !creating && (
            <Button variant="danger" size="sm" onClick={onEndClick}>
              End campaign
            </Button>
          )}
          {real && !creating && (
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              New campaign
            </Button>
          )}
          {real && !creating && (
            <Button variant="danger" size="sm" onClick={onDeleteClick}>
              Delete campaign
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
        <Field label="Min. referrals to qualify">
          <input
            type="number"
            min={0}
            step={1}
            style={{ ...styles.input, width: 90 }}
            value={minReferrals}
            onChange={(e) => setMinReferrals(e.target.value)}
          />
        </Field>
      </div>
      <div style={{ ...styles.panelRow, marginTop: -6 }}>
        A host needs at least this many verified RSVPs on their birthday event before
        they're eligible to win a prize — there's no ceiling, ranking is purely by highest
        verified RSVPs.
      </div>

      <div style={styles.fields}>
        <Field label="Naira vendor">
          <select
            style={{ ...styles.input, minWidth: 220 }}
            value={vendorNGN}
            onChange={(e) => setVendorNGN(e.target.value)}
          >
            <option value="">Any vendor</option>
            {vendorOptions.map((v) => (
              <option key={v.user!._id} value={v.user!._id}>
                {v.name || v.user?.username}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dollar vendor">
          <select
            style={{ ...styles.input, minWidth: 220 }}
            value={vendorUSD}
            onChange={(e) => setVendorUSD(e.target.value)}
          >
            <option value="">Any vendor</option>
            {vendorOptions.map((v) => (
              <option key={v.user!._id} value={v.user!._id}>
                {v.name || v.user?.username}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ ...styles.panelRow, marginTop: -6 }}>
        Naira winners' credit is redeemable only at the Naira vendor; Dollar winners' only at
        the Dollar vendor. Leave as "Any vendor" for credit spendable anywhere.
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
        <div style={styles.prizeColumnHeads}>
          <span style={{ ...styles.prizeRank, visibility: "hidden" }}>—</span>
          <span style={{ ...styles.fieldLabel, width: 110 }}>Credit ₦</span>
          <span style={{ ...styles.fieldLabel, width: 110 }}>Credit $</span>
          <span style={{ ...styles.fieldLabel, flex: 1 }}>Extra (optional)</span>
          <span style={{ width: 34, flexShrink: 0 }} />
        </div>
        {rewards.map((r, i) => (
          <div key={i} style={styles.prizeRow}>
            <span style={styles.prizeRank}>{ordinal(i + 1)}</span>
            <input
              type="number"
              min={0}
              style={{ ...styles.input, width: 110 }}
              value={r.couponNGN}
              onChange={(e) => setReward(i, "couponNGN", e.target.value)}
            />
            <input
              type="number"
              min={0}
              style={{ ...styles.input, width: 110 }}
              value={r.couponUSD}
              onChange={(e) => setReward(i, "couponUSD", e.target.value)}
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              value={r.extraPerk}
              onChange={(e) => setReward(i, "extraPerk", e.target.value)}
              placeholder="e.g. Premium Event Pass"
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
      <div style={{ ...styles.panelRow, marginTop: -8 }}>
        There's no cash prize — the amount above IS the reward, credited as OurCityVibe
        credit (1 credit = ₦1 / $1, no exchange rate between the two — see
        services/payments/coupon.service.js). Nigerian winners are credited in Naira,
        everyone else in Dollars, spendable at checkout with any vendor, and it expires if
        left unused for 30 days. A tier needs a value in Naira, Dollars, or both. "Extra" is
        an optional non-cash bonus (e.g. an event pass) shown alongside the credit.
      </div>

      <div>
        {showCreate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={create}
            disabled={!canSubmit}
            loading={saving}
          >
            Create campaign
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
    gap: 12,
    maxWidth: 760,
  },
  prizeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  prizeColumnHeads: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
