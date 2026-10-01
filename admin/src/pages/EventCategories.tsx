import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { EventCategory } from "../types";
import Table, { Column } from "../components/ui/Table";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

export default function EventCategories() {
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", emoji: "" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEventCategories();
      setCategories(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setFormError("A name is required.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await adminApi.createEventCategory({ name: form.name.trim(), emoji: form.emoji.trim() });
      setForm({ name: "", emoji: "" });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to add category.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteEventCategory(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const columns: Column<EventCategory>[] = [
    {
      key: "name",
      header: "Category",
      render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span>,
    },
    {
      key: "emoji",
      header: "Emoji",
      width: 100,
      render: (c) => <span style={{ fontSize: 18 }}>{c.emoji || "—"}</span>,
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
              placeholder="Category name (e.g. Music)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={{ ...inputStyle, minWidth: 90, width: 90 }}
              placeholder="🎵"
              value={form.emoji}
              onChange={(e) => setForm({ ...form, emoji: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button variant="primary" onClick={handleAdd} loading={adding}>
              Add Category
            </Button>
            {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
          </div>
        }
      >
        <div style={{ padding: "8px 16px 0", color: colors.textMuted, fontSize: 12 }}>
          These are the categories a host can pick when creating an event, and the filters people
          browse events by in the app and on the website. Picking one is optional for hosts. The
          emoji is optional. Deleting a category doesn't touch events already tagged with it.
        </div>
        <Table
          columns={columns}
          data={categories}
          keyExtractor={(c) => c._id}
          loading={loading}
          emptyMessage="No event categories yet. Add one above."
        />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Event Category"
        message="Are you sure you want to delete this category? Events already tagged with it keep it, but it disappears from the filters and hosts can no longer pick it."
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
