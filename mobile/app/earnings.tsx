/**
 * Earnings & payouts.
 *
 * The answer to "I sold something — where is my money?". Before this screen, a
 * seller had nowhere to look: the only money surface in the app was the vendor
 * dashboard's tile, which counted bookings only, so guide and ticket sellers saw
 * zero however much they'd earned.
 *
 * Reachable from both stacks (Settings → Earnings, the vendor dashboard, My
 * Guides, and every payout notification), so it deliberately lives at the top
 * level rather than inside (tabs) or (vendor).
 *
 * The most important number here is "In hold window": ticket money is held until
 * after the event, so a seller looking the day after a sale sees earnings that
 * are real, theirs, and simply not released yet. That is usually the honest
 * answer, and its absence is what made sales look like they had vanished.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { EarningsHero, StatCard } from "@/components/shared/EarningsHero";
import { VN, VNF } from "@/components/vendor/vendorTheme";
import {
  formatMoney,
  payoutOnboardingRoute,
  payoutUnavailableMessage,
} from "@/constants/payments";

type PayoutStatus =
  | "held"
  | "awaiting_approval"
  | "processing"
  | "paid"
  | "failed"
  | "rejected"
  | "unavailable";

interface EarningsSummary {
  currency: string;
  payoutRail: "paystack" | "stripe" | null;
  payoutSupported: boolean;
  payoutOnboarded: boolean;
  country: string | null;
  totals: {
    lifetimeGross: number;
    lifetimeNet: number;
    pendingApproval: number;
    paidOut: number;
    failed: number;
    inHoldWindow: number;
  };
  bySource: { ticket: number; guide: number; booking: number; order: number };
  thisMonthNet: number;
  lastMonthNet: number;
  dailyNet: number[];
  salesCount: number;
}

interface Sale {
  id: string;
  type: "ticket" | "guide" | "booking" | "order";
  title: string;
  subtitle: string | null;
  buyerName: string | null;
  gross: number;
  net: number;
  currency: string;
  soldAt: string;
  payoutStatus: PayoutStatus;
}

interface PayoutRow {
  id: string;
  relatedType: string;
  amount: number;
  currency: string;
  status: Exclude<PayoutStatus, "held" | "unavailable">;
  createdAt: string;
  rejectedReason: string | null;
}

/** Seller-facing wording. Never surface the raw internal status strings. */
const STATUS_LABEL: Record<PayoutStatus, string> = {
  held: "Held until after the event",
  awaiting_approval: "Being processed",
  processing: "Sending",
  paid: "Paid out",
  failed: "Needs attention",
  rejected: "On hold",
  unavailable: "No payout method",
};

const STATUS_TONE: Record<PayoutStatus, string> = {
  held: VN.amber,
  awaiting_approval: VN.cyan,
  processing: VN.cyan,
  paid: VN.green,
  failed: VN.pink,
  rejected: VN.pink,
  unavailable: VN.amber,
};

const SALE_ICON: Record<Sale["type"], keyof typeof Ionicons.glyphMap> = {
  ticket: "ticket",
  guide: "book",
  booking: "calendar",
  order: "receipt",
};

function relativeDate(iso: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function EarningsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const authedGet = useCallback(async (path: string) => {
    const token = await SecureStore.getItemAsync("token");
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${path} failed`);
    return res.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const [summaryData, salesData, payoutData] = await Promise.all([
        authedGet("/earnings/summary"),
        authedGet("/earnings/sales?limit=20"),
        authedGet("/earnings/payouts?limit=20"),
      ]);
      setSummary(summaryData);
      setSales(salesData.sales || []);
      setNextCursor(salesData.nextCursor ?? null);
      setPayouts(payoutData.payouts || []);
    } catch (error) {
      console.error("Load earnings error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authedGet]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMoreSales = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await authedGet(`/earnings/sales?limit=20&cursor=${nextCursor}`);
      setSales((prev) => [...prev, ...(data.sales || [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      console.error("Load more sales error:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Earnings</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const currency = summary?.currency;
  const totals = summary?.totals;
  const payoutRoute = payoutOnboardingRoute(summary?.country || undefined);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <EarningsHero
          net={summary?.thisMonthNet ?? 0}
          previousNet={summary?.lastMonthNet ?? 0}
          daily={summary?.dailyNet}
          currency={currency}
        />

        {/* Payout rail state. Three cases, and only one of them has a CTA —
            a seller in an unsupported country has nothing to act on. */}
        {summary && !summary.payoutSupported ? (
          <View style={[styles.banner, { borderColor: VN.amber + "55" }]}>
            <Ionicons name="information-circle" size={18} color={VN.amber} />
            <Text style={styles.bannerText}>
              {payoutUnavailableMessage(summary.country || undefined)}
            </Text>
          </View>
        ) : summary && !summary.payoutOnboarded ? (
          <TouchableOpacity
            style={[styles.banner, { borderColor: VN.pink + "55" }]}
            onPress={() => payoutRoute && router.push(payoutRoute as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="alert-circle" size={18} color={VN.pink} />
            <Text style={styles.bannerText}>
              Finish your payout setup so we can send you your money.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.banner, { borderColor: VN.green + "44" }]}>
            <Ionicons name="checkmark-circle" size={18} color={VN.green} />
            <Text style={styles.bannerText}>
              Payouts are set up. Earnings are released after review.
            </Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          <StatCard
            icon="time"
            accent={VN.cyan}
            label="Being processed"
            value={formatMoney(totals?.pendingApproval ?? 0, currency)}
            sub="on its way to you"
          />
          <StatCard
            icon="cash"
            accent={VN.green}
            label="Paid out"
            value={formatMoney(totals?.paidOut ?? 0, currency)}
            sub="all time"
          />
          <StatCard
            icon="lock-closed"
            accent={VN.amber}
            label="In hold window"
            value={formatMoney(totals?.inHoldWindow ?? 0, currency)}
            sub="released after the event"
          />
          <StatCard
            icon="trending-up"
            accent={VN.purpleSoft}
            label="Lifetime"
            value={formatMoney(totals?.lifetimeNet ?? 0, currency)}
            sub={`${summary?.salesCount ?? 0} sales`}
          />
        </View>

        {/* Payouts */}
        <Text style={styles.sectionTitle}>Payouts</Text>
        {payouts.length === 0 ? (
          <Text style={styles.emptyText}>
            No payouts yet. They appear here once a sale is ready for release.
          </Text>
        ) : (
          payouts.map((payout) => (
            <View key={payout.id} style={styles.row}>
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: STATUS_TONE[payout.status] + "22" },
                ]}
              >
                <Ionicons name="cash-outline" size={16} color={STATUS_TONE[payout.status]} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>
                  {formatMoney(payout.amount, payout.currency)}
                </Text>
                <Text style={styles.rowSub}>
                  {relativeDate(payout.createdAt)} ·{" "}
                  <Text style={{ color: STATUS_TONE[payout.status] }}>
                    {STATUS_LABEL[payout.status]}
                  </Text>
                </Text>
                {payout.rejectedReason ? (
                  <Text style={styles.rowNote}>{payout.rejectedReason}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        {/* Sales */}
        <Text style={styles.sectionTitle}>Recent sales</Text>
        {sales.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing sold yet. Your ticket, guide, booking and order sales all show up here.
          </Text>
        ) : (
          <>
            {sales.map((sale) => (
              <View key={sale.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: colors.primaryFaded }]}>
                  <Ionicons name={SALE_ICON[sale.type]} size={16} color={colors.primaryLight} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {sale.title}
                  </Text>
                  <Text style={styles.rowSub}>
                    {sale.buyerName ? `${sale.buyerName} · ` : ""}
                    {relativeDate(sale.soldAt)} ·{" "}
                    <Text style={{ color: STATUS_TONE[sale.payoutStatus] }}>
                      {STATUS_LABEL[sale.payoutStatus]}
                    </Text>
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{formatMoney(sale.net, sale.currency)}</Text>
              </View>
            ))}
            {nextCursor ? (
              <TouchableOpacity style={styles.loadMore} onPress={loadMoreSales} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: { width: 40 },
    headerTitle: {
      fontFamily: VNF.heading,
      fontSize: 20,
      color: c.textBright,
      letterSpacing: -0.4,
    },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 48, gap: 16 },

    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: c.cardGlass,
    },
    bannerText: { flex: 1, fontFamily: VNF.medium, fontSize: 12.5, color: c.textBright, lineHeight: 18 },

    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

    sectionTitle: {
      fontFamily: VNF.heading,
      fontSize: 18,
      color: c.textBright,
      letterSpacing: -0.4,
      marginTop: 8,
    },
    emptyText: {
      fontFamily: VNF.medium,
      fontSize: 13,
      color: c.textFaint,
      lineHeight: 19,
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: { fontFamily: VNF.semibold, fontSize: 14, color: c.textBright },
    rowSub: { fontFamily: VNF.medium, fontSize: 11.5, color: c.textFaint },
    rowNote: { fontFamily: VNF.medium, fontSize: 11, color: c.textMuted, marginTop: 2 },
    rowAmount: { fontFamily: VNF.bold, fontSize: 14, color: c.textBright },

    loadMore: { paddingVertical: 14, alignItems: "center" },
    loadMoreText: { fontFamily: VNF.bold, fontSize: 13, color: c.primaryLight },
  });
