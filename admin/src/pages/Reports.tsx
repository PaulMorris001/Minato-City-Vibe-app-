import React, { useCallback, useEffect, useState } from "react";
import { adminApi, AdminReport } from "../api/admin";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import Modal, { ConfirmModal } from "../components/ui/Modal";
import { colors } from "../constants/colors";

const LIMIT = 15;

type StatusFilter = "open" | "resolved" | "dismissed" | "all";

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate speech",
  sexual: "Sexual content",
  violence: "Violence",
  blocked: "Blocked by user",
  other: "Other",
};

const STATUS_VARIANT: Record<string, "success" | "primary" | "default"> = {
  open: "primary",
  resolved: "success",
  dismissed: "default",
};

export default function Reports() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminReport | null>(null);
  const [target, setTarget] = useState<any>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "dismiss" | "remove_content" | "ban_user";
    report: AdminReport;
  } | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getReports({ status, page, limit: LIMIT });
      setReports(res.data.reports);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (report: AdminReport) => {
    setSelected(report);
    setTarget(null);
    setTargetLoading(true);
    try {
      const res = await adminApi.getReportTarget(report._id);
      setTarget(res.data.target);
    } finally {
      setTargetLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      await adminApi.resolveReport(confirm.report._id, confirm.action);
      setConfirm(null);
      setSelected(null);
      load();
    } finally {
      setWorking(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const columns: Column<AdminReport>[] = [
    {
      key: "created",
      header: "Reported",
      width: 130,
      render: (r) => (
        <span style={{ color: colors.textMuted, fontSize: 13 }}>{formatDate(r.createdAt)}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: 90,
      render: (r) => <Badge variant="default">{r.targetType}</Badge>,
    },
    {
      key: "reporter",
      header: "Reporter",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>@{r.reporter?.username || "unknown"}</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {r.reporter?.email}
          </div>
        </div>
      ),
    },
    {
      key: "target",
      header: "Target user",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>@{r.targetUser?.username || "unknown"}</div>
          {r.targetUser?.isBanned ? (
            <Badge variant="error">Banned</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      width: 150,
      render: (r) => <span>{REASON_LABEL[r.reason] || r.reason}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] || "default"}>{r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 90,
      render: (r) => (
        <Button variant="secondary" size="sm" onClick={() => openDetail(r)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageShell
        toolbar={
          <div style={{ display: "flex", gap: 8 }}>
            {(["open", "resolved", "dismissed", "all"] as StatusFilter[]).map((s) => (
              <Button
                key={s}
                variant={status === s ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        }
      >
        <Table
          columns={columns}
          data={reports}
          keyExtractor={(r) => r._id}
          loading={loading}
        />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </PageShell>

      <Modal
        open={!!selected}
        title={selected ? `Report on ${selected.targetType}` : ""}
        onClose={() => {
          setSelected(null);
          setTarget(null);
        }}
        footer={
          selected && selected.status === "open" ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirm({ action: "dismiss", report: selected })}
              >
                Dismiss
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirm({ action: "remove_content", report: selected })}
              >
                Remove content
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirm({ action: "ban_user", report: selected })}
              >
                Ban user
              </Button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Section label="Reason">
              {REASON_LABEL[selected.reason] || selected.reason}
            </Section>
            {selected.details ? (
              <Section label="Details">
                <span style={{ whiteSpace: "pre-wrap" }}>{selected.details}</span>
              </Section>
            ) : null}
            <Section label="Reporter">
              @{selected.reporter?.username} ({selected.reporter?.email})
            </Section>
            <Section label="Target user">
              @{selected.targetUser?.username} ({selected.targetUser?.email})
              {selected.targetUser?.isBanned ? " — already banned" : ""}
            </Section>
            <Section label="Submitted">{formatDate(selected.createdAt)}</Section>
            <hr style={{ border: 0, borderTop: `1px solid ${colors.border}` }} />
            <Section label={`Reported ${selected.targetType}`}>
              {targetLoading ? (
                <span style={{ color: colors.textMuted }}>Loading…</span>
              ) : !target ? (
                <span style={{ color: colors.textMuted }}>
                  (Content no longer exists)
                </span>
              ) : (
                <TargetPreview type={selected.targetType} target={target} />
              )}
            </Section>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={!!confirm}
        title={
          confirm?.action === "ban_user"
            ? "Ban this user?"
            : confirm?.action === "remove_content"
            ? "Remove this content?"
            : "Dismiss this report?"
        }
        message={
          confirm?.action === "ban_user"
            ? "This user will be permanently banned and logged out. All their events and guides will be deactivated."
            : confirm?.action === "remove_content"
            ? "This content will be deactivated and removed from public feeds."
            : "Mark this report as dismissed with no action."
        }
        onConfirm={handleResolve}
        onCancel={() => setConfirm(null)}
        loading={working}
      />
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: colors.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: colors.text }}>{children}</div>
    </div>
  );
}

function TargetPreview({ type, target }: { type: string; target: any }) {
  if (type === "user") {
    return (
      <div>
        <div style={{ fontWeight: 600 }}>@{target.username}</div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>{target.email}</div>
      </div>
    );
  }
  if (type === "event") {
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{target.title}</div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>
          {target.location} · {new Date(target.date).toLocaleDateString()}
        </div>
        {target.description ? (
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
            {target.description}
          </div>
        ) : null}
      </div>
    );
  }
  if (type === "guide") {
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{target.title}</div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>
          {target.city}, {target.cityState} · {target.topic}
        </div>
        {target.description ? (
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
            {target.description}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}
