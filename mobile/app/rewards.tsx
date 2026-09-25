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

// ── Mock data (replace with real API later) ──────────────────────────────
const MOCK = {
  pointsBalance: 150,
  pendingPoints: 50,
  referralCode: "ADA2026",
  referralLink: "https://ourcityvibe.com/join?ref=ADA2026",
  referrals: [
    { id: "1", name: "Tolu A.", role: "User", status: "approved" as const, points: 50 },
    { id: "2", name: "Chioma K.", role: "Organizer", status: "pending" as const, points: 50 },
    { id: "3", name: "Emeka O.", role: "User", status: "approved" as const, points: 50 },
  ],
};

// Pilot rates — keep in sync with Wallet copy
const POINTS_PER_USD = 100;
const POINTS_PER_NGN_CREDIT = 100; // 100 pts → ₦1,500
const NGN_PER_100_POINTS = 1500;

function StatusBadge({ status }: { status: "pending" | "approved" }) {
  const styles = useThemedStyles(createStyles);
  const isApproved = status === "approved";
  return (
    <View style={[styles.badge, isApproved ? styles.badgeApproved : styles.badgePending]}>
      <Text style={[styles.badgeText, isApproved ? styles.badgeTextApproved : styles.badgeTextPending]}>
        {isApproved ? "Approved" : "Pending"}
      </Text>
    </View>
  );
}

export default function RewardsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const availablePoints = MOCK.pointsBalance;
  const canRedeem = availablePoints >= POINTS_PER_USD;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on OurCityVibe and discover events in your city! Use my link: ${MOCK.referralLink}`,
        url: MOCK.referralLink,
      });
    } catch {}
  };

  const handleRedeem = () => {
    if (!canRedeem) return;
    // For now navigate to Wallet. Later this can open a convert sheet first.
    router.push("/wallet-rewards" as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textBright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite & Earn</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Points balance card */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark || "#1a0f3d"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Your Points</Text>
          <Text style={styles.balanceValue}>{availablePoints}</Text>
          {MOCK.pendingPoints > 0 && (
            <Text style={styles.pendingText}>
              +{MOCK.pendingPoints} pending
            </Text>
          )}
          <Text style={styles.balanceHint}>
            {POINTS_PER_USD} points = $1 USD · or ₦{NGN_PER_100_POINTS.toLocaleString()} NGN
          </Text>

          <TouchableOpacity
            style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled]}
            onPress={handleRedeem}
            activeOpacity={0.85}
            disabled={!canRedeem}
          >
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.redeemBtnText}>
              {canRedeem ? "Redeem points for credit" : `Need ${POINTS_PER_USD} pts to redeem`}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Link to Wallet */}
        <TouchableOpacity
          style={styles.walletLink}
          onPress={() => router.push("/wallet-rewards" as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          <Text style={styles.walletLinkText}>View Wallet & Credits</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {/* Referral code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          <Text style={styles.codeValue}>{MOCK.referralCode}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share link</Text>
          </TouchableOpacity>
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.howCard}>
          <Text style={styles.howStep}>1. Share your link or code</Text>
          <Text style={styles.howStep}>2. Friend signs up & verifies</Text>
          <Text style={styles.howStep}>3. You earn points when they qualify</Text>
          <Text style={styles.howStep}>
            4. Redeem points for credit ({POINTS_PER_USD} pts = $1 or ₦{NGN_PER_100_POINTS.toLocaleString()})
          </Text>
        </View>

        {/* Referrals list */}
        <Text style={styles.sectionTitle}>Your referrals</Text>
        {MOCK.referrals.map((r) => (
          <View key={r.id} style={styles.referralRow}>
            <View style={styles.referralLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{r.name.charAt(0)}</Text>
              </View>
              <View>
                <Text style={styles.referralName}>{r.name}</Text>
                <Text style={styles.referralRole}>{r.role}</Text>
              </View>
            </View>
            <View style={styles.referralRight}>
              <StatusBadge status={r.status} />
              <Text style={styles.referralPoints}>+{r.points} pts</Text>
            </View>
          </View>
        ))}
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
    balanceCard: {
      borderRadius: 20,
      padding: 24,
      marginBottom: 12,
    },
    balanceLabel: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.8)",
      marginBottom: 4,
    },
    balanceValue: {
      fontFamily: Fonts.bold,
      fontSize: 42,
      color: "#fff",
      letterSpacing: -1,
    },
    pendingText: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.75)",
      marginTop: 4,
    },
    balanceHint: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: "rgba(255,255,255,0.65)",
      marginTop: 8,
    },
    redeemBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 16,
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      alignSelf: "flex-start",
    },
    redeemBtnDisabled: {
      opacity: 0.45,
    },
    redeemBtnText: {
      fontFamily: Fonts.bold,
      fontSize: 13,
      color: "#fff",
    },
    walletLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    walletLinkText: {
      flex: 1,
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: c.textBright,
    },
    codeCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
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
      fontSize: 28,
      color: c.textBright,
      letterSpacing: 2,
      marginBottom: 16,
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
      marginBottom: 24,
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
    referralRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    referralLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primaryFaded,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: c.primary,
    },
    referralName: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: c.textBright,
    },
    referralRole: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textDim,
      marginTop: 2,
    },
    referralRight: {
      alignItems: "flex-end",
      gap: 4,
    },
    referralPoints: {
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: c.textDim,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeApproved: {
      backgroundColor: "rgba(34,197,94,0.15)",
    },
    badgePending: {
      backgroundColor: "rgba(234,179,8,0.15)",
    },
    badgeText: {
      fontFamily: Fonts.bold,
      fontSize: 11,
    },
    badgeTextApproved: {
      color: "#22c55e",
    },
    badgeTextPending: {
      color: "#eab308",
    },
  });