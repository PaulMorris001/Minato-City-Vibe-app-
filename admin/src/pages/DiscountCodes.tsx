import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../api/admin";
import type { AdminDiscountCode, AdminEvent } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

const LIMIT = 10;
const CODE_REGEX = /^[A-Z0-9-]{3,24}$/;

const emptyForm = {
  eventId: "",
  eventTitle: "",
  code: "",
  type: "percent" as "percent" | "fixed",
  value: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
};

export default function DiscountCodes() {
  const [codes, setCodes] = useState<AdminDiscountCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  // Event picker (debounced search dropdown)
  const [eventSearch, setEventSearch] = useState("");
  const [eventResults, setEventResults] = useState<AdminEvent[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getDiscountCodes({ search, page, limit: LIMIT });
      setCodes(res.data.codes);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (form.eventId || !eventSearch.trim()) {
      setEventResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await adminApi.getEvents({ search: eventSearch.trim(), limit: 10 });
        setEventResults(res.data.events);
      } catch {
        // ignore — picker search is best-effort
      }
    }, 300);
    return () => clearTimeout(t);
  }, [eventSearch, form.eventId]);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const selectEvent = (ev: AdminEvent) => {
    setForm((f) => ({ ...f, eventId: ev._id, eventTitle: ev.title }));
    setEventSearch("");
    setEventResults([]);
    setPickerOpen(false);
  };

  const clearEvent = () => setForm((f) => ({ ...f, eventId: "", eventTitle: "" }));

  const handleAdd = async () => {
    // Client-side validation mirroring the server rules.
    const code = form.code.trim().toUpperCase();
    const value = Number(form.value);
    if (!form.eventId) { setFormError("Select an event."); return; }
    if (!CODE_REGEX.test(code)) { setFormError("Code must be 3-24 characters: A-Z, 0-9, dashes."); return; }
    if (form.type === "percent" && (!Number.isFinite(value) || value < 1 || value > 100)) {
      setFormError("Percent value must be between 1 and 100.");
      return;
    }
    if (form.type === "fixed" && (!Number.isFinite(value) || value <= 0)) {
      setFormError("Fixed value must be greater than 0.");
      return;
    }
    if (form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt)) {
      setFormError("Start must be before end.");
      return;
    }
    const maxRedemptions = form.maxRedemptions ? Number(form.maxRedemptions) : null;
    if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
      setFormError("Max redemptions must be a whole number of at least 1.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await adminApi.createDiscountCode({
        eventId: form.eventId,
        code,
        type: form.type,
        value,
        ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
        ...(form.endsAt ? { endsAt: new Date(form.endsAt).toISOString() } : {}),
        ...(maxRedemptions !== null ? { maxRedemptions } : {}),
      });
      setForm(emptyForm);
      setEventSearch("");
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Failed to create discount code.");
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id: string) => {
    await adminApi.toggleDiscountCode(id);
    load();
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      await adminApi.deleteDiscountCode(confirmId);
      setConfirmId(null);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const formatDiscount = (c: AdminDiscountCode) => {
    if (c.type === "percent") return `${c.value}%`;
    const currency = c.event?.currency;
    if (!currency) return String(c.value);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(c.value);
    } catch {
      return `${c.value} ${currency}`;
    }
  };

  // Active / Admin off / Creator off / Expired / Exhausted — derived client-side.
  const deriveStatus = (c: AdminDiscountCode): { label: string; variant: "success" | "error" | "warning" | "info" | "default" } => {
    if (!c.isActive) return { label: "Admin off", variant: "error" };
    if (c.disabledByCreator) return { label: "Creator off", variant: "warning" };
    if (c.endsAt && new Date(c.endsAt) < new Date()) return { label: "Expired", variant: "default" };
    if (c.maxRedemptions != null && c.redemptionCount >= c.maxRedemptions) return { label: "Exhausted", variant: "info" };
    return { label: "Active", variant: "success" };
  };

  const columns: Column<AdminDiscountCode>[] = [
    {
      key: "code",
      header: "Code",
      width: 140,
      render: (c) => <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{c.code}</span>,
    },
    {
      key: "event",
      header: "Event",
      render: (c) => <span>{c.event?.title || "—"}</span>,
    },
    {
      key: "discount",
      header: "Discount",
      width: 100,
      render: (c) => <span style={{ fontWeight: 600 }}>{formatDiscount(c)}</span>,
    },
    {
      key: "window",
      header: "Window",
      width: 190,
      render: (c) =>
        !c.startsAt && !c.endsAt ? (
          <span style={{ color: colors.textDim }}>—</span>
        ) : (
          <span style={{ color: colors.textMuted }}>
            {c.startsAt ? formatDate(c.startsAt) : "—"} → {c.endsAt ? formatDate(c.endsAt) : "—"}
          </span>
        ),
    },
    {
      key: "uses",
      header: "Uses",
      width: 80,
      render: (c) => (
        <span style={{ color: colors.textMuted }}>
          {c.redemptionCount}/{c.maxRedemptions ?? "∞"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 100,
      render: (c) => {
        const { label, variant } = deriveStatus(c);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      width: 170,
      render: (c) => (
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => handleToggle(c._id)}>
            {c.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={c.redemptionCount > 0}
            title={c.redemptionCount > 0 ? "Codes with redemptions cannot be deleted" : undefined}
            onClick={() => setConfirmId(c._id)}
          >
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
          <div style={toolbarCol}>
            <div style={formRow}>
              <div style={pickerWrap}>
                {form.eventId ? (
                  <div style={selectedEvent}>
                    <span style={selectedEventTitle}>{form.eventTitle}</span>
                    <button style={clearBtn} onClick={clearEvent} title="Clear event">✕</button>
                  </div>
                ) : (
                  <>
                    <input
                      style={{ ...inputStyle, width: "100%" }}
                      placeholder="Search event..."
                      value={eventSearch}
                      onChange={(e) => { setEventSearch(e.target.value); setPickerOpen(true); }}
                      onFocus={() => setPickerOpen(true)}
                      onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                    />
                    {pickerOpen && eventResults.length > 0 && (
                      <div style={dropdown}>
                        {eventResults.map((ev) => (
                          <button key={ev._id} style={dropdownItem} onMouseDown={() => selectEvent(ev)}>
                            <span style={{ fontWeight: 600 }}>{ev.title}</span>
                            <span style={{ color: colors.textDim, fontSize: 11 }}>{formatDate(ev.date)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <input
                style={{ ...inputStyle, minWidth: 120, textTransform: "uppercase" }}
                placeholder="Code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <select
                style={{ ...inputStyle, minWidth: 100 }}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
              <input
                style={{ ...inputStyle, minWidth: 90 }}
                type="number"
                placeholder={form.type === "percent" ? "1-100" : "Amount"}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <input
                style={{ ...inputStyle, minWidth: 180, colorScheme: "dark" }}
                type="datetime-local"
                title="Starts (optional)"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
              <input
                style={{ ...inputStyle, minWidth: 180, colorScheme: "dark" }}
                type="datetime-local"
                title="Ends (optional)"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
              <input
                style={{ ...inputStyle, minWidth: 100 }}
                type="number"
                placeholder="unlimited"
                title="Max redemptions (optional)"
                value={form.maxRedemptions}
                onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button variant="primary" onClick={handleAdd} loading={adding}>
                Add Code
              </Button>
              {formError && <span style={{ color: colors.error, fontSize: 13 }}>{formError}</span>}
            </div>
            <SearchInput value={search} onSearch={handleSearch} placeholder="Search codes..." />
          </div>
        }
      >
        <Table
          columns={columns}
          data={codes}
          keyExtractor={(c) => c._id}
          loading={loading}
          emptyMessage="No discount codes found. Add one above."
        />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </PageShell>

      <ConfirmModal
        open={!!confirmId}
        title="Delete Discount Code"
        message="Are you sure you want to permanently delete this discount code? Only codes with no redemptions can be deleted."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
        loading={!!deletingId}
      />
    </>
  );
}

const toolbarCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "100%",
};

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

const pickerWrap: React.CSSProperties = {
  position: "relative",
  minWidth: 220,
};

const selectedEvent: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: colors.primaryDim,
  border: `1px solid ${colors.primary}`,
  borderRadius: 8,
  padding: "8px 12px",
  color: colors.text,
  fontSize: 13,
};

const selectedEventTitle: React.CSSProperties = {
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const clearBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: colors.textMuted,
  cursor: "pointer",
  fontSize: 12,
  padding: "0 2px",
};

const dropdown: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: 4,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  maxHeight: 260,
  overflowY: "auto",
  zIndex: 100,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const dropdownItem: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  background: "none",
  border: "none",
  borderBottom: `1px solid ${colors.border}`,
  padding: "8px 12px",
  color: colors.text,
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
};
