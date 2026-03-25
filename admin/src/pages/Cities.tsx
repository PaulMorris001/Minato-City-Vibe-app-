import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { City } from "../types";
import Table, { Column } from "../components/ui/Table";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

export default function Cities() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", state: "" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getCities();
      setCities(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.state.trim()) {
      setFormError("Both name and state are required.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await adminApi.createCity({ name: form.name.trim(), state: form.state.trim() });
      setForm({ name: "", state: "" });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to add city.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteCity(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const columns: Column<City>[] = [
    {
      key: "name",
      header: "City Name",
      render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span>,
    },
    {
      key: "state",
      header: "State",
      width: 160,
      render: (c) => <span style={{ color: colors.textMuted }}>{c.state}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: 100,
      render: (c) => (
        <Button variant="danger" size="sm" onClick={() => setConfirmId(c._id)}>
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
              placeholder="City name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={inputStyle}
              placeholder="State"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button variant="primary" onClick={handleAdd} loading={adding}>
              Add City
            </Button>
            {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
          </div>
        }
      >
        <Table
          columns={columns}
          data={cities}
          keyExtractor={(c) => c._id}
          loading={loading}
          emptyMessage="No cities found. Add one above."
        />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete City"
        message="Are you sure you want to delete this city? Existing vendors referencing this city will lose their city reference."
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
  minWidth: 160,
};
