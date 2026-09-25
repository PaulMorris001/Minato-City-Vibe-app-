import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { formatMoney } from "@/constants/payments";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EmptyState from "@/components/shared/EmptyState";
import Skeleton from "@/components/shared/Skeleton";
import CreditCard from "@/components/shared/CreditCard";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface CreditTransaction {
  _id: string;
  type: "earned" | "spent" | "refunded" | "expired" | "adjusted";
  amount: number;
  currency: "NGN" | "USD";
  description: string;
  createdAt: string;
}

// "earned"/"refunded" put credit back on the balance; "spent"/"expired"/
// "adjusted" take it off — mirrors the sign rule in
// server/src/services/payments/coupon.service.js's ledger writes.
const TX_META: Record<
  CreditTransaction["type"],
  { icon: keyof typeof Ionicons.glyphMap; sign: "+" | "-" }
> = {
  earned: { icon: "trophy", sign: "+" },
  refunded: { icon: "return-up-back-outline", sign: "+" },
  spent: { icon: "cart-outline", sign: "-" },
  expired: { icon: "time-outline", sign: "-" },
  adjusted: { icon: "create-outline", sign: "-" },
};

// Keep in sync with Invite & Earn (rewards) screen
const POINTS_PER_USD = 100;
const NGN_PER_100_POINTS = 1500;

function formatTxDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * OurCityVibe credit wallet.
 * Credit can come from:
 *  - Birthday Raffle wins
 *  - Redeeming referral points (Invite & Earn) at 100 pts = $1 USD or ₦1,500 NGN
 * Spend at checkout per existing vendor/currency rules. Reached from profile
 * "Wallet & Rewards" and from the Rewards screen.
 */
export default function WalletRewards() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [couponBalanceNGN, setCouponBalanceNGN] = useState(0);
  const [couponBalanceUSD, setCouponBalanceUSD] = useState(0);
  // Which vendor each balance is locked to, if any — null means spendable at
  // any vendor (see server's couponVendorNGN/USD on User).
  const [vendorNGNName, setVendorNGNName] = useState<string | null>(null);
  const [vendorUSDName, setVendorUSDName] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  const load = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, historyRes] = await Promise.all([
        axios.get(`${BASE_URL}/profile`, { headers }),
        axios.get(`${BASE_URL}/wallet/credit-history`, { headers }).catch(() => null),
      ]);
      const userData = profileRes.data?.user;
      setCouponBalanceNGN(userData?.couponBalanceNGN || 0);
      setCouponBalanceUSD(userData?.couponBalanceUSD || 0);
      setVendorNGNName(
        userData?.couponVendorNGN
          ? userData.couponVendorNGN.businessName || userData.couponVendorNGN.username
          : null
      );
      setVendorUSDName(
        userData?.couponVendorUSD
          ? userData.couponVendorUSD.businessName || userData.couponVendorUSD.username
          : null
      );
      if (historyRes) setTransactions(historyRes.data?.transactions || []);
    } catch {
      // Leave whatever was last loaded (or the 0 default) rather than
      // blocking the screen on a transient network error.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const hasCredit = couponBalanceNGN > 0 || couponBalanceUSD > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton />
        <Text style={styles.headerTitle}>Wallet & Rewards</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Skeleton height={180} borderRadius={20} />
        ) : hasCredit ? (
          <View style={{ gap: 14 }}>
            {couponBalanceNGN > 0 && (
              <CreditCard amount={couponBalanceNGN} currency="NGN" vendorName={vendorNGNName || undefined} />
            )}
            {couponBalanceUSD > 0 && (
              <CreditCard
                amount={couponBalanceUSD}
                currency="USD"
                entranceDelay={120}
                vendorName={vendorUSDName || undefined}
              />
            )}
          </View>
        ) : (
          <EmptyState
            icon="wallet-outline"
            title="No credit yet"
            subtitle="Win the Birthday Raffle or redeem referral points from Invite & Earn."
            actionLabel="See the Birthday Raffle"
            onAction={() => router.push("/birthday-raffle" as any)}
          />
        )}

        {/* Always offer a path to earn points (even when user already has credit) */}
        {!loading && (
          <TouchableOpacity
            style={styles.pointsLink}
            onPress={() => router.push("/rewards" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="gift-outline" size={18} color={colors.primary} />
            <Text style={styles.pointsLinkText}>Invite & Earn points</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {!loading && hasCredit && (
          <Text style={styles.hint}>
            {vendorNGNName || vendorUSDName
              ? "Each balance is redeemable only at the vendor shown on its card. Unused credit expires 30 days after it was last touched."
              : "Spend it at checkout with any vendor pricing in that currency. Unused credit expires 30 days after it was last touched."}
          </Text>
        )}

        {!loading && (
          <>
            <Text style={styles.historyTitle}>History</Text>
            {transactions.length === 0 ? (
              <Text style={styles.historyEmpty}>No credit activity yet.</Text>
            ) : (
              <View style={styles.historyList}>
                {transactions.map((tx) => {
                  const meta = TX_META[tx.type];
                  const isCredit = meta.sign === "+";
                  return (
                    <View key={tx._id} style={styles.historyRow}>
                      <View
                        style={[
                          styles.historyIconWrap,
                          { backgroundColor: isCredit ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.12)" },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={16}
                          color={isCredit ? colors.success : colors.error}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.historyDescription} numberOfLines={1}>
                          {tx.description}
                        </Text>
                        <Text style={styles.historyDate}>{formatTxDate(tx.createdAt)}</Text>
                      </View>
                      <Text style={[styles.historyAmount, { color: isCredit ? colors.success : colors.error }]}>
                        {meta.sign}
                        {formatMoney(tx.amount, tx.currency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {!loading && (
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>How credit works</Text>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                1 credit = 1 unit of its own currency — ₦1 in Nigeria, $1 elsewhere.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Earn credit from the Birthday Raffle, or redeem referral points:
                {" "}{POINTS_PER_USD} points = $1 USD or ₦{NGN_PER_100_POINTS.toLocaleString()} NGN.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Raffle credit may be locked to a vendor per currency; points-redeemed credit
                follows the same spend rules once issued.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Unused credit expires 30 days after it was last earned or spent from.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: 16,
      paddingHorizontal: 16,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    content: { padding: 16, paddingBottom: 40 },

    pointsLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pointsLinkText: {
      flex: 1,
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: c.text,
    },

    hint: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
      marginTop: 12,
    },

    historyTitle: {
      fontSize: 15,
      fontFamily: Fonts.bold,
      color: c.text,
      marginTop: 28,
      marginBottom: 10,
    },
    historyEmpty: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textMuted,
    },
    historyList: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    historyIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    historyDescription: { fontSize: 13.5, fontFamily: Fonts.medium, color: c.text },
    historyDate: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.textMuted, marginTop: 2 },
    historyAmount: { fontSize: 14, fontFamily: Fonts.bold },

    infoSection: {
      marginTop: 24,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 10,
    },
    infoTitle: { fontSize: 14, fontFamily: Fonts.bold, color: c.text, marginBottom: 2 },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    infoText: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 19 },
  });