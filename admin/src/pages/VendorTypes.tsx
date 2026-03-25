import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { VendorType } from "../types";
import Table, { Column } from "../components/ui/Table";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

export default function VendorTypes() {
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getVendorTypes();
      setVendorTypes(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.icon.trim()) {
      setFormError("Both name and icon are required.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await adminApi.createVendorType({ name: form.name.trim(), icon: form.icon.trim() });
      setForm({ name: "", icon: "" });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to add vendor type.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteVendorType(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const columns: Column<VendorType>[] = [
    {
      key: "name",
      header: "Type Name",
      render: (t) => <span style={{ fontWeight: 600 }}>{t.name}</span>,
    },
    {
      key: "icon",
      header: "Icon",
      width: 160,
      render: (t) => <code style={iconCodeStyle}>{t.icon}</code>,
    },
    {
      key: "actions",
      header: "Actions",
      width: 100,
      render: (t) => (
        <Button variant="danger" size="sm" onClick={() => setConfirmId(t._id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageShell
        toolbar={
          <div style={formRow}>
            <input
              style={inputStyle}
              placeholder="Type name (e.g. Chefs)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={inputStyle}
              placeholder="Ionicons name (e.g. restaurant)"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button variant="primary" onClick={handleAdd} loading={adding}>
              Add Type
            </Button>
            {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
          </div>
        }
      >
        <div style={{ padding: "8px 16px 0", color: colors.textMuted, fontSize: 12 }}>
          Icon names come from the{" "}
          <a
            href="https://ionic.io/ionicons"
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.primary }}
          >
            Ionicons library
          </a>
          {" "}(e.g. <code style={iconCodeStyle}>restaurant</code>, <code style={iconCodeStyle}>musical-notes</code>).
        </div>
        <Table
          columns={columns}
          data={vendorTypes}
          keyExtractor={(t) => t._id}
          loading={loading}
          emptyMessage="No vendor types found. Add one above."
        />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Vendor Type"
        message="Are you sure you want to delete this vendor type? Existing vendors referencing this type will lose their type reference."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
        loading={!!deletingId}
      />
    </>
  );
}

const formRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  background: "#1f1f2e",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  minWidth: 180,
};

const iconCodeStyle: React.CSSProperties = {
  background: "#1f1f2e",
  border: "1px solid #374151",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
  color: colors.primary,
};
