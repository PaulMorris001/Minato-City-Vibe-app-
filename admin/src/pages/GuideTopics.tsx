import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { GuideTopic } from "../types";
import Table, { Column } from "../components/ui/Table";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

export default function GuideTopics() {
  const [topics, setTopics] = useState<GuideTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", emoji: "" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getGuideTopics();
      setTopics(res.data);
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
      await adminApi.createGuideTopic({ name: form.name.trim(), emoji: form.emoji.trim() });
      setForm({ name: "", emoji: "" });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to add topic.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteGuideTopic(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const columns: Column<GuideTopic>[] = [
    {
      key: "name",
      header: "Topic",
      render: (t) => <span style={{ fontWeight: 600 }}>{t.name}</span>,
    },
    {
      key: "emoji",
      header: "Emoji",
      width: 100,
      render: (t) => <span style={{ fontSize: 18 }}>{t.emoji || "—"}</span>,
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
              placeholder="Topic name (e.g. Travel guide)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={{ ...inputStyle, minWidth: 90, width: 90 }}
              placeholder="🧭"
              value={form.emoji}
              onChange={(e) => setForm({ ...form, emoji: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button variant="primary" onClick={handleAdd} loading={adding}>
              Add Topic
            </Button>
            {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
          </div>
        }
      >
        <div style={{ padding: "8px 16px 0", color: colors.textMuted, fontSize: 12 }}>
          These are the topics a host can pick when publishing a guide — shown to clients as-is,
          in this list's own order. The emoji is optional; guides show a generic pin icon without
          one. Deleting a topic doesn't touch guides already tagged with it.
        </div>
        <Table
          columns={columns}
          data={topics}
          keyExtractor={(t) => t._id}
          loading={loading}
          emptyMessage="No guide topics found. Add one above."
        />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Guide Topic"
        message="Are you sure you want to delete this topic? Existing guides tagged with it keep showing it, but hosts can no longer pick it for new or edited guides."
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
