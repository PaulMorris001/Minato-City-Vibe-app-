import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import type { AdminVendor } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

const LIMIT = 20;

export default function Vendors() {
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getVendors({ search, page, limit: LIMIT });
      setVendors(res.data.vendors);
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
      await adminApi.deleteVendor(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const handleVerify = async (id: string) => {
    await adminApi.toggleVendorVerified(id);
    load();
  };

  const columns: Column<AdminVendor>[] = [
    {
      key: "business",
      header: "Business",
      render: (v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {v.images && v.images[0] ? (
            <img src={v.images[0]} style={avatarStyle} alt="" />
          ) : (
            <div style={avatarPlaceholderStyle}>{v.name[0]?.toUpperCase()}</div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{v.name}</div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              {v.user ? v.user.email : "Seeded vendor"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "city",
      header: "City",
      width: 120,
      render: (v) => <span style={{ color: colors.textMuted }}>{v.city?.name || "—"}</span>,
    },
    {
      key: "type",
      header: "Type",
      width: 140,
      render: (v) => v.vendorType?.name
        ? <Badge variant="primary">{v.vendorType.name}</Badge>
        : <span style={{ color: colors.textDim }}>—</span>,
    },
    {
      key: "rating",
      header: "Rating",
      width: 80,
      render: (v) => <span style={{ color: colors.textMuted }}>★ {v.rating?.toFixed(1) ?? "—"}</span>,
    },
    {
      key: "verified",
      header: "Verified",
      width: 100,
      render: (v) => (
        <Badge variant={v.verified ? "success" : "default"}>
          {v.verified ? "✓ Verified" : "Unverified"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 160,
      render: (v) => (
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => handleVerify(v._id)}>
            {v.verified ? "Unverify" : "Verify"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmId(v._id)}>
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
          <SearchInput value={search} onSearch={handleSearch} placeholder="Search vendors..." />
        }
      >
        <Table columns={columns} data={vendors} keyExtractor={(v) => v._id} loading={loading} emptyMessage="No vendors found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Vendor"
        message="Are you sure you want to permanently delete this vendor? This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
        loading={!!deletingId}
      />
    </>
  );
}

const avatarStyle: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", objectFit: "cover" };
const avatarPlaceholderStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%",
  background: colors.primaryDim, color: colors.primary,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 13, fontWeight: 700,
};
