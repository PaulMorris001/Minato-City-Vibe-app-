import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { createEventShareLink } from "@/utils/shareLinks";
import { useCountdown } from "@/hooks/useCountdown";

interface RaffleStatus {
  eventTitle: string;
  eventDate: string;
  trackingLink: string;
  verifiedRsvps: number;
  totalInvites: number;
  eligibilityScore: number;
  isEligible: boolean;
  status: "active" | "eligible" | "ineligible" | "winner";
  campaignDeadlineMs: number;
}

export default function RaffleStatusScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<RaffleStatus | null>(null);
  const countdown = useCountdown(status?.campaignDeadlineMs ?? null);

  const loadStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/raffle/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.hasQualifyingEvent) {
        setStatus({
          eventTitle: data.eventTitle,
          eventDate: data.eventDate,
          // Same helper every other share flow in the app uses — the
          // server sends back the slug/shareToken/id, not a built URL.
          trackingLink: createEventShareLink(data.trackingCode),
          verifiedRsvps: data.verifiedRsvps,
          totalInvites: data.totalInvites,
          eligibilityScore: data.eligibilityScore,
          isEligible: data.isEligible,
          status: data.status,
          campaignDeadlineMs: new Date(data.campaignDeadline).getTime(),
        });
      } else if (!status) {
        // No qualifying event on the very first load (or the fetch failed) —
        // nothing to show here. A failed refresh on a later focus just keeps
        // whatever's already on screen instead of bouncing them out.
        router.replace("/birthday-raffle" as any);
      }
    } catch {
      if (!status) router.replace("/birthday-raffle" as any);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetches every time this screen gains focus — not just on mount — so a
  // friend accepting or undoing an RSVP while the host is elsewhere in the
  // app shows up the moment they come back to check their raffle status.
  useFocusEffect(
    React.useCallback(() => {
      loadStatus();
    }, [])
  );

  const handleCopyLink = async () => {
    if (!status) return;
    try {
      await Clipboard.setStringAsync(status.trackingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Error", "Could not copy link");
    }
  };

  const handleShare = async () => {
    if (!status) return;
    try {
      await Share.share({
        message: `I'm hosting my birthday on CityVibe! Join me: ${status.trackingLink}`,
        url: status.trackingLink, // iOS
        title: "Join my birthday event",
      });
    } catch {
      // user cancelled
    }
  };

  if (loading || !status) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const progressPercent = Math.min(
    (status.verifiedRsvps / 10) * 100, // example target of 10 for full bar
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
            status.isEligible
              ? ["#2D1B69", colors.primaryDark || "#1a0f3d"]
              : [colors.card, colors.cardAlt]
          }
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statusBadge}>
            <Ionicons
              name={status.isEligible ? "checkmark-circle" : "time"}
              size={14}
              color="#fff"
            />
            <Text style={styles.statusBadgeText}>
              {status.isEligible ? "ELIGIBLE" : "IN PROGRESS"}
            </Text>
          </View>

          <Text style={styles.heroTitle}>{status.eventTitle}</Text>
          <Text style={styles.heroDate}>
            {new Date(status.eventDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Eligibility Score</Text>
            <Text style={styles.scoreValue}>{status.eligibilityScore}</Text>
          </View>
        </LinearGradient>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{status.verifiedRsvps}</Text>
            <Text style={styles.statLabel}>Verified RSVPs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{status.totalInvites}</Text>
            <Text style={styles.statLabel}>Total Invites</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{countdown?.days ?? "—"}</Text>
            <Text style={styles.statLabel}>Days Left</Text>
          </View>
        </View>

        {/* Live countdown — ticks every second, see hooks/useCountdown. */}
        {countdown && (
          <View style={styles.countdownRow}>
            {[
              { label: "Days", value: countdown.days },
              { label: "Hrs", value: countdown.hours },
              { label: "Min", value: countdown.minutes },
              { label: "Sec", value: countdown.seconds },
            ].map((unit, i) => (
              <React.Fragment key={unit.label}>
                {i > 0 && <Text style={styles.countdownColon}>:</Text>}
                <View style={styles.countdownUnit}>
                  <Text style={styles.countdownValue}>{String(unit.value).padStart(2, "0")}</Text>
                  <Text style={styles.countdownLabel}>{unit.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Progress</Text>
            <Text style={styles.progressText}>
              {status.verifiedRsvps} / 10 verified
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
              {status.trackingLink}
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
            Campaign ends{" "}
            {new Date(status.campaignDeadlineMs).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
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
    loadingContainer: {
      alignItems: "center",
      justifyContent: "center",
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
    countdownRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: -16,
      marginBottom: 28,
      gap: 6,
    },
    countdownUnit: {
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 8,
      minWidth: 42,
      borderWidth: 1,
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
    },
    countdownValue: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: c.textBright,
      fontVariant: ["tabular-nums"],
    },
    countdownLabel: {
      fontFamily: Fonts.medium,
      fontSize: 9,
      color: c.textDim,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginTop: 1,
    },
    countdownColon: {
      fontFamily: Fonts.bold,
      fontSize: 15,
      color: c.textFaint,
      marginTop: -10,
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