import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Fonts } from "@/constants/fonts";
import { ensureAuth } from "@/utils/requireAuth";
import { BASE_URL } from "@/constants/constants";
import { useCountdown } from "@/hooks/useCountdown";

// Prizes and rules are static marketing copy — safe to hardcode. The deadline
// below is only a pre-fetch seed so the countdown ticks immediately (guests
// included, since /raffle/status needs auth). The real deadline is the active
// campaign's endDate, managed in the admin dashboard; a logged-in user's
// /raffle/status fetch overwrites this with that value. Keep it roughly current
// so guests don't see a wildly stale countdown, but it no longer has to match
// the server exactly.
const CAMPAIGN_DEADLINE_MS = new Date("2026-09-30T23:59:59.999Z").getTime();

type PrizeRow = { place: string; reward: string; icon: "trophy" | "medal" | "ribbon" };

const PRIZE_ICONS: PrizeRow["icon"][] = ["trophy", "medal", "ribbon"];
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
// Server sends [{ rank, reward }] for the active campaign; fall back to the
// static copy below until that resolves (and for guests, who can't fetch it).
const toPrizeRows = (prizes: { rank: number; reward: string }[]): PrizeRow[] =>
  [...prizes]
    .sort((a, b) => a.rank - b.rank)
    .map((p, i) => ({ place: ordinal(p.rank), reward: p.reward, icon: PRIZE_ICONS[i] ?? "ribbon" }));

const CAMPAIGN = {
  title: "Birthday Raffle Campaign",
  subtitle: "Create a birthday event, invite friends, and win prizes",
  prizes: [
    { place: "1st", reward: "₦150,000 Cash + Premium Event Pass", icon: "trophy" as const },
    { place: "2nd", reward: "₦75,000 Cash", icon: "medal" as const },
    { place: "3rd", reward: "₦40,000 Cash", icon: "ribbon" as const },
  ] as PrizeRow[],
  // Plain-language summary only. The binding text is the Official Rules screen
  // (app/birthday-raffle/rules.tsx) — keep these two consistent.
  rules: [
    "Create a birthday event on CityVibe during the campaign period.",
    "Share your unique tracking link with friends.",
    "Only unique, verified RSVPs count — one per account.",
    "Your event gets 1 entry, plus 1 more for every verified RSVP.",
    // Index 4 — rewritten in the component with the campaign's real
    // minReferrals once /raffle/status resolves; this is the guest/offline
    // fallback copy.
    "You need a minimum number of verified RSVPs to be prize-eligible.",
    "Winners are drawn at random from eligible entries after the campaign closes.",
  ],
};

// Guest/offline fallback until /raffle/status resolves with the real value.
const DEFAULT_MIN_REFERRALS = 6;

export default function BirthdayRaffleScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [hasBirthdayEvent, setHasBirthdayEvent] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  // Seeded from the client-side constant so the countdown ticks immediately
  // (guests included); overwritten by the server's own value below for a
  // logged-in user, which is the one that actually gates eligibility.
  const [deadlineMs, setDeadlineMs] = useState(CAMPAIGN_DEADLINE_MS);
  const [prizes, setPrizes] = useState<PrizeRow[]>(CAMPAIGN.prizes);
  // Verified RSVPs needed to be prize-eligible — set from the active
  // campaign; the current admin default is 6.
  const [minReferrals, setMinReferrals] = useState(DEFAULT_MIN_REFERRALS);
  // Whether the active campaign is still taking new entries. Defaults to true
  // so a guest (who never fetches — see checkStatus) still sees the normal
  // "join" CTA; a logged-in user gets the real value the moment it resolves.
  const [campaignOpen, setCampaignOpen] = useState(true);
  // The admin-given campaign name — shown as the hero title once it resolves.
  const [campaignName, setCampaignName] = useState(CAMPAIGN.title);
  const countdown = useCountdown(deadlineMs);

  // Only the very first check shows the full-page spinner (see the `loading`
  // gate below) — a refocus refetch updates state quietly so returning to
  // this screen doesn't flash a spinner over content that's still valid.
  const hasLoadedOnceRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        setHasBirthdayEvent(false);
        return;
      }
      const res = await fetch(`${BASE_URL}/raffle/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setHasBirthdayEvent(!!data.hasQualifyingEvent);
        if (data.campaignDeadline) setDeadlineMs(new Date(data.campaignDeadline).getTime());
        if (Array.isArray(data.prizes) && data.prizes.length) setPrizes(toPrizeRows(data.prizes));
        if (typeof data.minReferrals === "number") setMinReferrals(data.minReferrals);
        if (typeof data.campaignOpen === "boolean") setCampaignOpen(data.campaignOpen);
        if (data.campaignName) setCampaignName(data.campaignName);
      } else {
        setHasBirthdayEvent(false);
      }
    } catch {
      setHasBirthdayEvent(false);
    } finally {
      setLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, []);

  // Re-check every time this screen gains focus, not just on first mount — an
  // admin ending or starting a campaign while this screen sat open (or
  // cached) in the stack used to leave it showing stale state (e.g. still
  // "Raffle Has Ended" after a brand-new campaign went active) until the app
  // was fully reloaded.
  useFocusEffect(
    useCallback(() => {
      checkStatus();
    }, [checkStatus])
  );

  const deadlineLabel = new Date(deadlineMs).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Index 4 is rewritten with the real campaign threshold once it resolves —
  // see that rule's own comment in CAMPAIGN.rules for why it's this index.
  const rules = CAMPAIGN.rules.map((rule, index) =>
    index === 4
      ? `You need at least ${minReferrals} verified RSVP${minReferrals === 1 ? "" : "s"} to be prize-eligible.`
      : rule
  );

const handlePrimaryCTA = async () => {
  // Belt-and-suspenders — the button is disabled in this state, but a stray
  // tap mid-transition shouldn't be able to reach the create flow either.
  if (!hasBirthdayEvent && !campaignOpen) return;
  if (!(await ensureAuth("join the birthday raffle"))) return;

  if (hasBirthdayEvent) {
    // User already has a qualifying event → go to status page
    router.push("/birthday-raffle/status" as any);
  } else {
    // No event yet → go to Home and open CreateEventModal with birthday flag.
    // Must be the "home" screen specifically, not the bare "(tabs)" group —
    // that's just the folder name, not a navigable route, and Home is the
    // only screen reading `openCreate` (see its useLocalSearchParams effect).
    router.replace("/(tabs)/home?openCreate=birthday" as any);
  }
};

  // Server-authoritative — reflects an admin ending the campaign early just as
  // much as it reaching its natural deadline (see isCampaignOpen).
  const ended = !campaignOpen;
  // Someone who already has a qualifying event can always check its status,
  // ended campaign or not — only a fresh entry is blocked.
  const ctaDisabled = !hasBirthdayEvent && ended;

  // Wait for the real status before showing anything. Without this, a
  // logged-in user briefly saw the guest/offline fallback copy (default
  // prizes, generic rules, the seed deadline) flash and then jump to their
  // real values the moment the fetch resolved.
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
          colors={[colors.primary, colors.primaryDark]}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroBadge}>
            <Ionicons name={ended ? "time-outline" : "gift"} size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>{ended ? "CAMPAIGN ENDED" : "LIMITED TIME"}</Text>
          </View>

          <Text style={styles.heroTitle}>{campaignName}</Text>
          <Text style={styles.heroSubtitle}>{CAMPAIGN.subtitle}</Text>

          {ended ? (
            <View style={styles.endedRow}>
              <Ionicons name="alert-circle-outline" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.endedText}>
                This batch of the raffle has ended — entries closed {deadlineLabel}.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.deadlineRow}>
                <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.deadlineText}>Ends {deadlineLabel}</Text>
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
            </>
          )}
        </LinearGradient>

        {/* Prizes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prizes</Text>
          {prizes.map((prize) => (
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
          {rules.map((rule, index) => (
            <View key={index} style={styles.ruleRow}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Primary CTA — disabled only for someone with no entry once the
            campaign's closed; an existing entry can still check its status. */}
        <TouchableOpacity
          style={[styles.ctaButton, ctaDisabled && styles.ctaButtonDisabled]}
          activeOpacity={ctaDisabled ? 1 : 0.85}
          onPress={handlePrimaryCTA}
          disabled={ctaDisabled}
        >
          <LinearGradient
            colors={ctaDisabled ? [colors.textFaint, colors.textMuted] : [colors.primary, colors.primaryDark]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>
              {hasBirthdayEvent
                ? "View My Raffle Status"
                : ended
                ? "Raffle Has Ended"
                : "Create Birthday Event & Enter"}
            </Text>
            {!ctaDisabled && <Ionicons name="arrow-forward" size={18} color="#fff" />}
          </LinearGradient>
        </TouchableOpacity>

        {/* Guideline 5.3.2: the official rules must be reachable from the
            promotion itself, and Apple's non-involvement stated plainly. */}
        <TouchableOpacity
          style={styles.rulesLink}
          activeOpacity={0.7}
          onPress={() => router.push("/birthday-raffle/rules" as any)}
        >
          <Ionicons name="document-text-outline" size={16} color={colors.primaryLight} />
          <Text style={styles.rulesLinkText}>Read the official rules</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
        </TouchableOpacity>

        {ctaDisabled && (
          <Text style={styles.footerNote}>
            This batch of the Birthday Raffle is closed to new entries. Keep an eye out —
            we'll announce the next one in the app.
          </Text>
        )}

        <Text style={styles.footerNote}>
          No purchase necessary. Open to entrants aged 18 and over; void where prohibited.
          By entering you agree to the official rules. Winners are contacted in the app and
          by email.
        </Text>
        <Text style={styles.footerNote}>
          Apple is not a sponsor of this promotion and is not involved with it in any manner.
        </Text>

        {/* Not a link — no verified handle to point at yet. Swap in real
            social URLs here (and make this row a TouchableOpacity/Linking.openURL
            per platform) once they exist. */}
        <View style={styles.socialRow}>
          <Ionicons name="megaphone-outline" size={15} color={colors.textFaint} />
          <Text style={styles.socialText}>
            Follow <Text style={styles.socialHandle}>OurCityVibe</Text> on social media for
            raffle draw updates and winner announcements.
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
    endedRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: "rgba(0,0,0,0.2)",
      borderRadius: 12,
      padding: 12,
    },
    endedText: {
      flex: 1,
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.9)",
      lineHeight: 18,
    },
    countdownRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 14,
      gap: 6,
    },
    countdownUnit: {
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.25)",
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 8,
      minWidth: 42,
    },
    countdownValue: {
      fontFamily: Fonts.bold,
      fontSize: 17,
      color: "#fff",
      fontVariant: ["tabular-nums"],
    },
    countdownLabel: {
      fontFamily: Fonts.medium,
      fontSize: 9,
      color: "rgba(255,255,255,0.7)",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginTop: 1,
    },
    countdownColon: {
      fontFamily: Fonts.bold,
      fontSize: 16,
      color: "rgba(255,255,255,0.5)",
      marginTop: -10,
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
    ctaButtonDisabled: {
      shadowOpacity: 0,
      elevation: 0,
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
      marginTop: 10,
    },
    rulesLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.primaryFaded,
      borderWidth: 1,
      borderColor: c.primaryBorder,
    },
    rulesLinkText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13,
      color: c.primaryLight,
    },
    socialRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: 6,
      marginTop: 14,
      paddingHorizontal: 8,
    },
    socialText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textFaint,
      textAlign: "center",
      lineHeight: 18,
    },
    socialHandle: {
      fontFamily: Fonts.semiBold,
      color: c.textDim,
    },
  });