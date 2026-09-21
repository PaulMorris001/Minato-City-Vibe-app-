import React, { useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { AdminCatalogueCategory } from "../types";
import Table, { Column } from "../components/ui/Table";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

export default function CatalogueCategories() {
  const [categories, setCategories] = useState<AdminCatalogueCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", kind: "service" as "product" | "service", images: "" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", kind: "service" as "product" | "service", images: "", isActive: true });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getCatalogueCategories();
      setCategories(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.kind) {
      setFormError("Name and kind are required.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await adminApi.createCatalogueCategory({
        name: form.name.trim(),
        description: form.description.trim(),
        kind: form.kind,
        images: form.images ? form.images.split(",").map(s => s.trim()).filter(Boolean) : [],
      });
      setForm({ name: "", description: "", kind: "service", images: "" });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to add category.");
    } finally {
      setAdding(false);
    }
  };

  const handleEditClick = (cat: AdminCatalogueCategory) => {
    setEditingId(cat._id);
    setEditForm({
      name: cat.name,
      description: cat.description || "",
      kind: cat.kind,
      images: cat.images?.join(", ") || "",
      isActive: cat.isActive,
    });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editForm.name.trim() || !editForm.kind) {
      setFormError("Name and kind are required.");
      return;
    }
    setSavingEdit(true);
    try {
      await adminApi.updateCatalogueCategory(id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        kind: editForm.kind,
        images: editForm.images ? editForm.images.split(",").map(s => s.trim()).filter(Boolean) : [],
        isActive: editForm.isActive,
      });
      setEditingId(null);
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to update category.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteCatalogueCategory(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const columns: Column<AdminCatalogueCategory>[] = [
    {
      key: "name",
      header: "Category Name",
      render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span>,
    },
    {
      key: "kind",
      header: "Kind",
      width: 100,
      render: (c) => (
        <span style={kindBadgeStyle(c.kind)}>
          {c.kind}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (c) => <span style={{ color: colors.textMuted, fontSize: 13 }}>{c.description || "—"}</span>,
    },
    {
      key: "isActive",
      header: "Active",
      width: 80,
      render: (c) => (
        <span style={{ color: c.isActive ? colors.success : colors.error }}>
          {c.isActive ? "✓ Yes" : "✗ No"}
        </span>
      ),
    },
    {
      key: "images",
      header: "Images",
      width: 100,
      render: (c) => <span style={{ color: colors.textMuted, fontSize: 12 }}>{c.images?.length || 0}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: 160,
      render: (c) => (
        <div style={{ display: "flex", gap: 6 }}>
          {editingId === c._id ? (
            <>
              <Button variant="primary" size="sm" onClick={() => handleSaveEdit(c._id)} loading={savingEdit}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => handleEditClick(c)}>
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmId(c._id)}>
                Delete
              </Button>
            </>
          )}
        </div>
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
              placeholder="Category name (e.g. Catering)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={{ ...inputStyle, minWidth: 200 }}
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <select
              style={selectStyle}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "product" | "service" })}
            >
              <option value="service">Service</option>
              <option value="product">Product</option>
            </select>
            <input
              style={{ ...inputStyle, minWidth: 200 }}
              placeholder="Image URLs (comma-separated, optional)"
              value={form.images}
              onChange={(e) => setForm({ ...form, images: e.target.value })}
            />
            <Button variant="primary" onClick={handleAdd} loading={adding}>
              Add Category
            </Button>
            {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
          </div>
        }
      >
        {editingId && (
          <div style={editRowStyle}>
            <input
              style={inputStyle}
              placeholder="Category name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <input
              style={{ ...inputStyle, minWidth: 200 }}
              placeholder="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
            <select
              style={selectStyle}
              value={editForm.kind}
              onChange={(e) => setEditForm({ ...editForm, kind: e.target.value as "product" | "service" })}
            >
              <option value="service">Service</option>
              <option value="product">Product</option>
            </select>
            <input
              style={{ ...inputStyle, minWidth: 200 }}
              placeholder="Image URLs (comma-separated)"
              value={editForm.images}
              onChange={(e) => setEditForm({ ...editForm, images: e.target.value })}
            />
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>
        )}
        <Table
          columns={columns}
          data={categories}
          keyExtractor={(c) => c._id}
          loading={loading}
          emptyMessage="No catalogue categories found. Add one above."
        />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Category"
        message="Are you sure you want to delete this category? This cannot be undone. Categories in use by vendors cannot be deleted."
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
  marginBottom: 8,
};

const editRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "8px 16px 0",
  background: "#1f1f2e",
  borderRadius: 8,
  marginBottom: 8,
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

const selectStyle: React.CSSProperties = {
  background: "#1f1f2e",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#fff",
  fontSize: 13,
};

const kindBadgeStyle = (kind: string): React.CSSProperties => ({
  background: kind === "service" ? colors.primaryDim : colors.warningDim,
  color: kind === "service" ? colors.primary : colors.warning,
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "capitalize",
  display: "inline-block",
});