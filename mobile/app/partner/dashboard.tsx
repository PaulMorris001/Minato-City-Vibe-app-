import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Mock data (swap for API later) ───────────────────────────────────────
const MOCK = {
  referralCode: "ADA2026",
  referralLink: "https://ourcityvibe.com/join?ref=ADA2026",
  organizersReferred: 3,
  activeOrganizers: 2,
  feesThisMonth: 1250,
  commissionThisMonth: 125, // 10%
  commissionPending: 125,
  commissionPaidLifetime: 340,
  nextPayoutDate: "2026-10-01",
  windows: [
    {
      id: "1",
      organizerName: "Chioma Events",
      city: "Lagos",
      startDate: "2026-08-12",
      endDate: "2027-08-12",
      status: "open" as const,
      feesLifetime: 4200,
      commissionLifetime: 420,
      eventsHosted: 5,
    },
    {
      id: "2",
      organizerName: "Lagos Nights Co",
      city: "Lagos",
      startDate: "2026-09-01",
      endDate: "2027-09-01",
      status: "open" as const,
      feesLifetime: 800,
      commissionLifetime: 80,
      eventsHosted: 2,
    },
    {
      id: "3",
      organizerName: "Abuja Social",
      city: "Abuja",
      startDate: "2025-09-20",
      endDate: "2026-09-20",
      status: "closed" as const,
      feesLifetime: 2100,
      commissionLifetime: 210,
      eventsHosted: 4,
    },
  ],
};

function formatMoney(n: number, currency: "USD" | "NGN" = "USD") {
  if (currency === "NGN") return `₦${n.toLocaleString()}`;
  return `$${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export default function PartnerDashboard() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Host on OurCityVibe — use my partner link: ${MOCK.referralLink}`,
        url: MOCK.referralLink,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textBright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Partner Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark || "#1a0f3d"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroEyebrow}>This month’s commission</Text>
          <Text style={styles.heroValue}>
            {formatMoney(MOCK.commissionThisMonth)}
          </Text>
          <Text style={styles.heroSub}>
            10% of {formatMoney(MOCK.feesThisMonth)} platform fees from your organizers
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                Pending {formatMoney(MOCK.commissionPending)}
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                Next payout {formatDate(MOCK.nextPayoutDate)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick stats */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Organizers referred"
            value={String(MOCK.organizersReferred)}
            hint={`${MOCK.activeOrganizers} active`}
          />
          <StatCard
            label="Paid lifetime"
            value={formatMoney(MOCK.commissionPaidLifetime)}
            hint="All-time commission"
          />
        </View>

        {/* Referral link */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your partner referral link</Text>
          <Text style={styles.codeValue}>{MOCK.referralCode}</Text>
          <Text style={styles.codeHint}>
            Share with organizers. When they host paid events, you earn 10% of
            platform fees for 12 months from their first paid event — plus normal points.
          </Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share link</Text>
          </TouchableOpacity>
        </View>

        {/* How commission works */}
        <Text style={styles.sectionTitle}>How you earn</Text>
        <View style={styles.howCard}>
          <Text style={styles.howStep}>1. Organizer joins with your link</Text>
          <Text style={styles.howStep}>2. They host their first paid event</Text>
          <Text style={styles.howStep}>3. 12-month window opens from that date</Text>
          <Text style={styles.howStep}>4. You get 10% of platform fees, paid monthly</Text>
        </View>

        {/* Commission windows */}
        <Text style={styles.sectionTitle}>Your organizers</Text>
        {MOCK.windows.map((w) => {
          const isOpen = w.status === "open";
          return (
            <View key={w.id} style={styles.windowCard}>
              <View style={styles.windowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.windowName}>{w.organizerName}</Text>
                  <Text style={styles.windowMeta}>
                    {w.city} · {w.eventsHosted} events · {formatDate(w.startDate)} →{" "}
                    {formatDate(w.endDate)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    isOpen ? styles.statusOpen : styles.statusClosed,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                    ]}
                  >
                    {isOpen ? "Open" : "Ended"}
                  </Text>
                </View>
              </View>
              <View style={styles.windowStats}>
                <View>
                  <Text style={styles.windowStatLabel}>Fees generated</Text>
                  <Text style={styles.windowStatValue}>
                    {formatMoney(w.feesLifetime)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.windowStatLabel}>Your 10%</Text>
                  <Text style={[styles.windowStatValue, { color: colors.primary }]}>
                    {formatMoney(w.commissionLifetime)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Cross-link to points */}
        <TouchableOpacity
          style={styles.pointsLink}
          onPress={() => router.push("/rewards" as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="gift-outline" size={18} color={colors.primary} />
          <Text style={styles.pointsLinkText}>
            You also earn points on Invite & Earn
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.backgroundDeep,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerTitle: {
      fontFamily: Fonts.bold,
      fontSize: 18,
      color: c.textBright,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    hero: {
      borderRadius: 20,
      padding: 22,
      marginBottom: 14,
    },
    heroEyebrow: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.8)",
      marginBottom: 4,
    },
    heroValue: {
      fontFamily: Fonts.bold,
      fontSize: 40,
      color: "#fff",
      letterSpacing: -1,
    },
    heroSub: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: "rgba(255,255,255,0.75)",
      marginTop: 6,
      lineHeight: 18,
    },
    heroRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    heroPill: {
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    heroPillText: {
      fontFamily: Fonts.semiBold,
      fontSize: 12,
      color: "#fff",
    },
    statsGrid: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    statLabel: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textDim,
      marginBottom: 4,
    },
    statValue: {
      fontFamily: Fonts.bold,
      fontSize: 20,
      color: c.textBright,
    },
    statHint: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: c.textDim,
      marginTop: 4,
    },
    codeCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 18,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    codeLabel: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      marginBottom: 6,
    },
    codeValue: {
      fontFamily: Fonts.bold,
      fontSize: 26,
      color: c.textBright,
      letterSpacing: 2,
      marginBottom: 8,
    },
    codeHint: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textDim,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 14,
    },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    shareBtnText: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: "#fff",
    },
    sectionTitle: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: c.textBright,
      marginBottom: 12,
    },
    howCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    howStep: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textDim,
      lineHeight: 20,
    },
    windowCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    windowTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 12,
    },
    windowName: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: c.textBright,
    },
    windowMeta: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textDim,
      marginTop: 3,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    statusOpen: {
      backgroundColor: "rgba(34,197,94,0.15)",
    },
    statusClosed: {
      backgroundColor: "rgba(148,163,184,0.2)",
    },
    statusText: {
      fontFamily: Fonts.bold,
      fontSize: 11,
    },
    statusTextOpen: {
      color: "#22c55e",
    },
    statusTextClosed: {
      color: c.textDim,
    },
    windowStats: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    windowStatLabel: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: c.textDim,
      marginBottom: 2,
    },
    windowStatValue: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: c.textBright,
    },
    pointsLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 8,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pointsLinkText: {
      flex: 1,
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: c.textBright,
    },
  });