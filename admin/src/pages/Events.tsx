import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import type { AdminEvent, EventSignups } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import Modal, { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

const LIMIT = 10;

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: colors.textMuted,
  marginBottom: 8,
};

const venueRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 8,
  background: colors.surfaceHover,
};

export default function Events() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Guest list for one event, opened from the Attendees action. Held here
  // rather than fetched with the table: it's per-event and rarely needed.
  const [signups, setSignups] = useState<EventSignups | null>(null);
  const [signupsFor, setSignupsFor] = useState<AdminEvent | null>(null);
  const [signupsLoading, setSignupsLoading] = useState(false);
  const [signupsError, setSignupsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEvents({ search, page, limit: LIMIT });
      setEvents(res.data.events);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteEvent(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (id: string) => {
    await adminApi.toggleEventActive(id);
    load();
  };

  const openSignups = async (event: AdminEvent) => {
    setSignupsFor(event);
    setSignups(null);
    setSignupsError("");
    setSignupsLoading(true);
    try {
      const res = await adminApi.getEventSignups(event._id);
      setSignups(res.data);
    } catch {
      setSignupsError("Couldn't load the guest list for this event.");
    } finally {
      setSignupsLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const columns: Column<AdminEvent>[] = [
    {
      key: "title",
      header: "Event",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600 }}>{e.title}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {e.location}
            {e.additionalLocations?.length ? ` +${e.additionalLocations.length} more` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      width: 110,
      render: (e) => <span style={{ color: colors.textMuted }}>{formatDate(e.date)}</span>,
    },
    {
      key: "createdBy",
      header: "Created By",
      width: 130,
      render: (e) => <span style={{ color: colors.textMuted }}>{e.createdBy?.username || "—"}</span>,
    },
    {
      key: "type",
      header: "Type",
      width: 110,
      render: (e) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Badge variant={e.isPublic ? "info" : "default"}>{e.isPublic ? "Public" : "Private"}</Badge>
          {e.isPaid && <Badge variant="warning">Paid</Badge>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      render: (e) => <Badge variant={e.isActive ? "success" : "error"}>{e.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      width: 240,
      render: (e) => (
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => openSignups(e)}>
            Attendees
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleToggle(e._id)}>
            {e.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmId(e._id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageShell
        toolbar={
          <SearchInput value={search} onSearch={handleSearch} placeholder="Search events..." />
        }
      >
        <Table columns={columns} data={events} keyExtractor={(e) => e._id} loading={loading} emptyMessage="No events found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </PageShell>

      <Modal
        open={!!signupsFor}
        title={signupsFor ? `Who's coming — ${signupsFor.title}` : ""}
        onClose={() => setSignupsFor(null)}
      >
        {signupsLoading && <div style={{ color: colors.textMuted }}>Loading…</div>}
        {!!signupsError && <div style={{ color: colors.error }}>{signupsError}</div>}
        {signups && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>
              {signups.total} going · {signups.ticketsIssued} ticket
              {signups.ticketsIssued === 1 ? "" : "s"} issued · {signups.attendedCount} checked in
            </div>

            {/* Per-venue headcount — the answer to "who is going where". Absent
                for a single-venue event, which has nothing to split. */}
            {signups.venues.length > 0 && (
              <div>
                <div style={sectionLabel}>By location</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {signups.venues.map((v) => (
                    <div key={v.index} style={venueRow}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {v.city || v.location || `Location ${v.index + 1}`}
                        </div>
                        {!!v.address && (
                          <div style={{ fontSize: 12, color: colors.textDim }}>{v.address}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Badge variant="info">{v.total} going</Badge>
                        {v.ticketCount > 0 && (
                          <Badge variant="warning">{v.ticketCount} tickets</Badge>
                        )}
                        {v.attendedCount > 0 && (
                          <Badge variant="success">{v.attendedCount} in</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {signups.unspecifiedVenue.total > 0 && (
                    <div style={venueRow}>
                      <div>
                        <div style={{ fontWeight: 600 }}>No location picked</div>
                        <div style={{ fontSize: 12, color: colors.textDim }}>
                          Joined from a surface with no picker, or before the event had
                          several locations.
                        </div>
                      </div>
                      <Badge variant="default">{signups.unspecifiedVenue.total} going</Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <div style={sectionLabel}>Guest list</div>
              {signups.attendees.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 13 }}>
                  Nobody has signed up yet.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  {signups.attendees.map((a) => (
                    <div key={a.userId} style={venueRow}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {a.username || "Member"}
                          {a.isGuest && (
                            <span style={{ color: colors.textDim, fontWeight: 400 }}> · guest</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: colors.textDim }}>
                          {a.type === "ticket"
                            ? `${a.ticketCount} ticket${a.ticketCount === 1 ? "" : "s"}${
                                a.tiers.length ? ` · ${a.tiers.join(", ")}` : ""
                              }`
                            : "RSVP"}
                          {signups.venues.length > 0 &&
                            ` · ${
                              a.locations.length
                                ? a.locations
                                    .map(
                                      (l) =>
                                        `${l.city || l.name || "Location"}${
                                          l.count > 1 ? ` ×${l.count}` : ""
                                        }`
                                    )
                                    .join(", ")
                                : "location not picked"
                            }`}
                        </div>
                      </div>
                      {a.checkedIn && <Badge variant="success">Checked in</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Event"
        message="Are you sure you want to permanently delete this event?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
        loading={!!deletingId}
      />
    </>
  );
}
