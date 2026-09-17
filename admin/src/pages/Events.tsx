import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import type { AdminEvent } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

const LIMIT = 10;

export default function Events() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
      width: 160,
      render: (e) => (
        <div style={{ display: "flex", gap: 6 }}>
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
