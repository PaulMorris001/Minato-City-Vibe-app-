import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Fonts } from "@/constants/fonts";

// ── Mock data (replace with real API later) ────────────────────────────────
const MOCK_STATUS = {
  eventTitle: "Tolu's Birthday Bash",
  eventDate: "2026-09-12",
  trackingLink: "https://cityvibe.app/e/bday-tolu-9x4k",
  trackingCode: "bday-tolu-9x4k",
  verifiedRsvps: 7,
  totalInvites: 18,
  eligibilityScore: 8, // base 1 + 7 verified RSVPs
  isEligible: true,
  status: "active" as "active" | "eligible" | "ineligible" | "winner",
  daysLeft: 42,
  campaignDeadline: "September 30, 2026",
};

export default function RaffleStatusScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(MOCK_STATUS.trackingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Error", "Could not copy link");
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I'm hosting my birthday on CityVibe! Join me: ${MOCK_STATUS.trackingLink}`,
        url: MOCK_STATUS.trackingLink, // iOS
        title: "Join my birthday event",
      });
    } catch {
      // user cancelled
    }
  };

  const progressPercent = Math.min(
    (MOCK_STATUS.verifiedRsvps / 10) * 100, // example target of 10 for full bar
    100
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textBright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Raffle Status</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* Status Hero */}
        <LinearGradient
          colors={
            MOCK_STATUS.isEligible
              ? ["#2D1B69", colors.primaryDark || "#1a0f3d"]
              : [colors.card, colors.cardAlt]
          }
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statusBadge}>
            <Ionicons
              name={MOCK_STATUS.isEligible ? "checkmark-circle" : "time"}
              size={14}
              color="#fff"
            />
            <Text style={styles.statusBadgeText}>
              {MOCK_STATUS.isEligible ? "ELIGIBLE" : "IN PROGRESS"}
            </Text>
          </View>

          <Text style={styles.heroTitle}>{MOCK_STATUS.eventTitle}</Text>
          <Text style={styles.heroDate}>
            {new Date(MOCK_STATUS.eventDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Eligibility Score</Text>
            <Text style={styles.scoreValue}>{MOCK_STATUS.eligibilityScore}</Text>
          </View>
        </LinearGradient>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{MOCK_STATUS.verifiedRsvps}</Text>
            <Text style={styles.statLabel}>Verified RSVPs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{MOCK_STATUS.totalInvites}</Text>
            <Text style={styles.statLabel}>Total Invites</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{MOCK_STATUS.daysLeft}</Text>
            <Text style={styles.statLabel}>Days Left</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Progress</Text>
            <Text style={styles.progressText}>
              {MOCK_STATUS.verifiedRsvps} / 10 verified
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
          <Text style={styles.progressHint}>
            Get more verified RSVPs to increase your chances
          </Text>
        </View>

        {/* Tracking Link */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Tracking Link</Text>
          <Text style={styles.sectionSubtitle}>
            Share this link so RSVPs are counted toward the raffle
          </Text>

          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={1}>
              {MOCK_STATUS.trackingLink}
            </Text>
          </View>

          <View style={styles.linkActions}>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleCopyLink}
              activeOpacity={0.8}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.linkButtonText}>
                {copied ? "Copied!" : "Copy Link"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.linkButton, styles.shareButton]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={[styles.linkButtonText, { color: "#fff" }]}>
                Share
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tips to boost your entry</Text>
          {[
            "Share the link in WhatsApp groups and Instagram stories",
            "Only unique verified accounts count",
            "Remind friends to actually RSVP (not just click)",
            "The more verified RSVPs, the higher your score",
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={16} color={colors.primary} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* Deadline note */}
        <View style={styles.deadlineNote}>
          <Ionicons name="time-outline" size={16} color={colors.textDim} />
          <Text style={styles.deadlineNoteText}>
            Campaign ends {MOCK_STATUS.campaignDeadline}
          </Text>
        </View>
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
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontFamily: Fonts.bold,
      fontSize: 17,
      color: c.textBright,
    },
    scrollContent: {
      paddingHorizontal: 20,
    },
    hero: {
      borderRadius: 24,
      padding: 24,
      marginBottom: 20,
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: "rgba(0,0,0,0.3)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginBottom: 14,
    },
    statusBadgeText: {
      fontFamily: Fonts.bold,
      fontSize: 11,
      color: "#fff",
      letterSpacing: 0.6,
    },
    heroTitle: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 24,
      color: "#fff",
      marginBottom: 6,
    },
    heroDate: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: "rgba(255,255,255,0.8)",
      marginBottom: 20,
    },
    scoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    scoreLabel: {
      fontFamily: Fonts.medium,
      fontSize: 14,
      color: "rgba(255,255,255,0.85)",
    },
    scoreValue: {
      fontFamily: Fonts.bold,
      fontSize: 22,
      color: "#fff",
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 28,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
    },
    statNumber: {
      fontFamily: Fonts.bold,
      fontSize: 22,
      color: c.textBright,
      marginBottom: 4,
    },
    statLabel: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: c.textDim,
      textAlign: "center",
    },
    section: {
      marginBottom: 28,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    sectionTitle: {
      fontFamily: Fonts.bold,
      fontSize: 17,
      color: c.textBright,
      marginBottom: 6,
    },
    sectionSubtitle: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      marginBottom: 14,
      lineHeight: 19,
    },
    progressText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13,
      color: c.primary,
    },
    progressTrack: {
      height: 8,
      backgroundColor: c.cardAlt,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: {
      height: "100%",
      backgroundColor: c.primary,
      borderRadius: 4,
    },
    progressHint: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textFaint,
    },
    linkBox: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
      marginBottom: 12,
    },
    linkText: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: c.textBright,
    },
    linkActions: {
      flexDirection: "row",
      gap: 10,
    },
    linkButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: c.primaryFaded,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primaryBorder || "rgba(168,85,247,0.3)",
    },
    shareButton: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    linkButtonText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: c.primary,
    },
    tipRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 12,
    },
    tipText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textDim,
      lineHeight: 20,
    },
    deadlineNote: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 8,
    },
    deadlineNoteText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textFaint,
    },
  });