import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Fonts } from "@/constants/fonts";
import { ensureAuth } from "@/utils/requireAuth";

// ── Mock campaign data (replace with API later) ────────────────────────────
const CAMPAIGN = {
  title: "Birthday Raffle Campaign",
  subtitle: "Create a birthday event, invite friends, and win prizes",
  deadline: "September 30, 2026",
  daysLeft: 42,
  prizes: [
    { place: "1st", reward: "₦150,000 Cash + Premium Event Pass", icon: "trophy" as const },
    { place: "2nd", reward: "₦75,000 Cash", icon: "medal" as const },
    { place: "3rd", reward: "₦40,000 Cash", icon: "ribbon" as const },
  ],
  rules: [
    "Create a birthday event on CityVibe during the campaign period.",
    "Share your unique tracking link with friends.",
    "Only unique, verified RSVPs count toward eligibility.",
    "Base entry for creating the event + points for each verified RSVP.",
    "Winners are selected randomly from eligible entries by admin.",
  ],
};

export default function BirthdayRaffleScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Mock status — later this will come from an API
  const [hasBirthdayEvent, setHasBirthdayEvent] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate checking if the user already has a qualifying birthday event
    const checkStatus = async () => {
      try {
        // TODO: Replace with real API call
        // const token = await SecureStore.getItemAsync("token");
        // const res = await fetch(...);
        // setHasBirthdayEvent(data.hasQualifyingEvent);

        // Mock: assume user does NOT have one yet
        setHasBirthdayEvent(false);
      } catch {
        setHasBirthdayEvent(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, []);

  const handlePrimaryCTA = async () => {
    if (!(await ensureAuth("join the birthday raffle"))) return;

    if (hasBirthdayEvent) {
      // User already has a qualifying event → go to status page
      router.push("/birthday-raffle/status" as any);
    } else {
      // No event yet → open create event flow
      // For now we go back and let the existing CreateEventModal handle it,
      // or you can navigate to a dedicated create screen later.
      router.back();
      // Optional: you can also emit an event or use a global state to open the modal
    }
  };

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
        <Text style={styles.headerTitle}>Birthday Raffle</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#2D1B69", colors.backgroundDeep]}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="gift" size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>LIMITED TIME</Text>
          </View>

          <Text style={styles.heroTitle}>{CAMPAIGN.title}</Text>
          <Text style={styles.heroSubtitle}>{CAMPAIGN.subtitle}</Text>

          <View style={styles.deadlineRow}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.deadlineText}>
              Ends {CAMPAIGN.deadline} · {CAMPAIGN.daysLeft} days left
            </Text>
          </View>
        </LinearGradient>

        {/* Prizes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prizes</Text>
          {CAMPAIGN.prizes.map((prize) => (
            <View key={prize.place} style={styles.prizeCard}>
              <View style={styles.prizeIconWrap}>
                <Ionicons name={prize.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.prizeContent}>
                <Text style={styles.prizePlace}>{prize.place} Place</Text>
                <Text style={styles.prizeReward}>{prize.reward}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Rules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          {CAMPAIGN.rules.map((rule, index) => (
            <View key={index} style={styles.ruleRow}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={handlePrimaryCTA}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>
              {loading
                ? "Checking..."
                : hasBirthdayEvent
                ? "View My Raffle Status"
                : "Create Birthday Event & Enter"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          By participating you agree to the campaign rules. Winners will be
          contacted via the app.
        </Text>
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
      marginBottom: 28,
      overflow: "hidden",
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: "rgba(0,0,0,0.35)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginBottom: 16,
    },
    heroBadgeText: {
      fontFamily: Fonts.bold,
      fontSize: 11,
      color: "#fff",
      letterSpacing: 0.6,
    },
    heroTitle: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 28,
      color: "#fff",
      letterSpacing: -0.6,
      lineHeight: 34,
      marginBottom: 8,
    },
    heroSubtitle: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: "rgba(255,255,255,0.8)",
      lineHeight: 22,
      marginBottom: 18,
    },
    deadlineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    deadlineText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13,
      color: "rgba(255,255,255,0.85)",
    },
    section: {
      marginBottom: 28,
    },
    sectionTitle: {
      fontFamily: Fonts.bold,
      fontSize: 18,
      color: c.textBright,
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    prizeCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
    },
    prizeIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primaryFaded,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    prizeContent: {
      flex: 1,
    },
    prizePlace: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: c.textBright,
      marginBottom: 2,
    },
    prizeReward: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
    },
    ruleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 14,
      gap: 12,
    },
    ruleNumber: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primaryFaded,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    ruleNumberText: {
      fontFamily: Fonts.bold,
      fontSize: 13,
      color: c.primary,
    },
    ruleText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textDim,
      lineHeight: 21,
    },
    ctaButton: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 16,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    ctaGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      paddingHorizontal: 24,
    },
    ctaText: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: "#fff",
    },
    footerNote: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textFaint,
      textAlign: "center",
      lineHeight: 18,
    },
  });