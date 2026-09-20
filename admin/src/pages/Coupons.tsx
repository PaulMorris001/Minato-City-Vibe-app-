import React, { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api/admin";
import type { AdminCouponTransaction } from "../types";
import Table, { Column } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import PageShell from "../components/ui/PageShell";
import StatCard from "../components/ui/StatCard";
import { colors } from "../constants/colors";

const LIMIT = 20;

const TYPE_VARIANT: Record<AdminCouponTransaction["type"], "success" | "error" | "warning" | "info" | "default"> = {
  earned: "success",
  spent: "info",
  refunded: "warning",
  expired: "error",
  adjusted: "default",
};

const money = (amount: number, currency: string) =>
  `${currency === "NGN" ? "₦" : "$"}${Number(amount).toLocaleString()}`;

/**
 * Read-only ledger of every OurCityVibe credit award, spend, refund and
 * expiry — the admin-visible counterpart to CouponTransaction, written by
 * services/payments/coupon.service.js on every balance change (raffle wins,
 * checkout spends, cancellation refunds, the 30-day expiry sweep).
 */
export default function Coupons() {
  const [transactions, setTransactions] = useState<AdminCouponTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getCouponTransactions({
        search: search || undefined,
        type: type || undefined,
        currency: currency || undefined,
        page,
        limit: LIMIT,
      });
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [search, type, currency, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const columns: Column<AdminCouponTransaction>[] = [
    {
      key: "user",
      header: "User",
      render: (t) => (
        <span>
          {t.user?.username || "—"}
          {t.user?.email ? <span style={{ color: colors.textDim }}> · {t.user.email}</span> : null}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: 100,
      render: (t) => <Badge variant={TYPE_VARIANT[t.type]}>{t.type}</Badge>,
    },
    {
      key: "amount",
      header: "Amount",
      width: 120,
      render: (t) => (
        <span style={{ fontWeight: 600, color: t.type === "spent" || t.type === "expired" ? colors.textMuted : colors.text }}>
          {t.type === "spent" || t.type === "expired" ? "-" : "+"}
          {money(t.amount, t.currency)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (t) => <span style={{ color: colors.textMuted }}>{t.description}</span>,
    },
    {
      key: "order",
      header: "Order",
      width: 140,
      render: (t) =>
        t.order ? (
          <span style={{ fontFamily: "monospace", fontSize: 12 }}>{t.order._id.slice(-8)}</span>
        ) : (
          <span style={{ color: colors.textDim }}>—</span>
        ),
    },
    {
      key: "createdAt",
      header: "When",
      width: 160,
      render: (t) => <span style={{ color: colors.textMuted }}>{formatDate(t.createdAt)}</span>,
    },
  ];

  return (
    <PageShell
      toolbar={
        <>
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            <StatCard label="Transactions" value={total} icon="💳" />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SearchInput value={search} onSearch={handleSearch} placeholder="Search username or email..." />
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              style={selectStyle}
            >
              <option value="">All types</option>
              <option value="earned">Earned</option>
              <option value="spent">Spent</option>
              <option value="refunded">Refunded</option>
              <option value="expired">Expired</option>
              <option value="adjusted">Adjusted</option>
            </select>
            <select
              value={currency}
              onChange={(e) => { setCurrency(e.target.value); setPage(1); }}
              style={selectStyle}
            >
              <option value="">All currencies</option>
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </>
      }
    >
      <Table
        columns={columns}
        data={transactions}
        keyExtractor={(t) => t._id}
        loading={loading}
        emptyMessage="No OurCityVibe credit activity yet."
      />
      <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
    </PageShell>
  );
}

const selectStyle: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: colors.text,
};
