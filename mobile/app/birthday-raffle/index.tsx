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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Fonts } from "@/constants/fonts";
import { ensureAuth } from "@/utils/requireAuth";
import { BASE_URL } from "@/constants/constants";
import { useCountdown } from "@/hooks/useCountdown";
import { formatMoney } from "@/constants/payments";
import RaffleWinnerPopup, { type RaffleStatusLike } from "@/components/shared/RaffleWinnerPopup";

// Prizes and rules are static marketing copy — safe to hardcode. The deadline
// below is only a pre-fetch seed so the countdown ticks immediately (guests
// included, since /raffle/status needs auth). The real deadline is the active
// campaign's endDate, managed in the admin dashboard; a logged-in user's
// /raffle/status fetch overwrites this with that value. Keep it roughly current
// so guests don't see a wildly stale countdown, but it no longer has to match
// the server exactly.
const CAMPAIGN_DEADLINE_MS = new Date("2026-09-30T23:59:59.999Z").getTime();

type PrizeRow = {
  place: string;
  icon: "trophy" | "medal" | "ribbon";
  couponAmount: number;
  couponCurrency: "NGN" | "USD";
  extraPerk: string;
};

const PRIZE_ICONS: PrizeRow["icon"][] = ["trophy", "medal", "ribbon"];
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
// Server sends [{ rank, couponAmount, couponCurrency, extraPerk }] for the
// active campaign, already localized to the requesting user's country —
// Nigerian viewers get NGN, everyone else gets USD. There is no cash prize,
// the coupon amount IS the reward, and 1 coupon = 1 unit of its own currency
// (no NGN/USD conversion). Fall back to the static copy below until that
// resolves (and for guests, who can't fetch it — defaults to NGN, same as
// this screen always showed pre-login).
const toPrizeRows = (
  prizes: { rank: number; couponAmount?: number; couponCurrency?: "NGN" | "USD"; extraPerk?: string }[]
): PrizeRow[] =>
  [...prizes]
    .sort((a, b) => a.rank - b.rank)
    .map((p, i) => ({
      place: ordinal(p.rank),
      icon: PRIZE_ICONS[i] ?? "ribbon",
      couponAmount: p.couponAmount || 0,
      couponCurrency: p.couponCurrency || "NGN",
      extraPerk: p.extraPerk || "",
    }));

const CAMPAIGN = {
  title: "Birthday Raffle Campaign",
  subtitle: "Create a birthday event, invite friends, and win prizes",
  prizes: [
    { place: "1st", icon: "trophy" as const, couponAmount: 150000, couponCurrency: "NGN" as const, extraPerk: "Premium Event Pass" },
    { place: "2nd", icon: "medal" as const, couponAmount: 75000, couponCurrency: "NGN" as const, extraPerk: "" },
    { place: "3rd", icon: "ribbon" as const, couponAmount: 40000, couponCurrency: "NGN" as const, extraPerk: "" },
  ] as PrizeRow[],
  // Plain-language summary only. The binding text is the Official Rules screen
  // (app/birthday-raffle/rules.tsx) — keep these two consistent.
  rules: [
    "Create a birthday event on CityVibe during the campaign period.",
    "Share your unique tracking link with friends.",
    "Only unique, verified RSVPs count — one per account.",
    "There's no limit — every verified RSVP improves your standing.",
    // Index 4 — rewritten in the component with the campaign's real
    // minReferrals once /raffle/status resolves; this is the guest/offline
    // fallback copy.
    "You need a minimum number of verified RSVPs to be prize-eligible.",
    "Winners are the eligible entries with the most verified RSVPs — highest engagement wins, not a random draw.",
  ],
};

// Guest/offline fallback until /raffle/status resolves with the real value.
const DEFAULT_MIN_REFERRALS = 6;

const genericPrizeRows = (): PrizeRow[] =>
  CAMPAIGN.prizes.map((prize) => ({ ...prize, couponAmount: 0, extraPerk: "" }));

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
  const [hasActiveCampaign, setHasActiveCampaign] = useState(false);
  const [campaignStartMs, setCampaignStartMs] = useState(0);
  // The admin-given campaign name — shown as the hero title once it resolves.
  const [campaignName, setCampaignName] = useState(CAMPAIGN.title);
  const countdown = useCountdown(deadlineMs);

  // Raw /raffle/status payload, handed to <RaffleWinnerPopup> as-is — it owns
  // its own "have they seen this?" bookkeeping, see that component.
  const [statusData, setStatusData] = useState<RaffleStatusLike | null>(null);

  // Only the very first check shows the full-page spinner (see the `loading`
  // gate below) — a refocus refetch updates state quietly so returning to
  // this screen doesn't flash a spinner over content that's still valid.
  const hasLoadedOnceRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const publicRes = await fetch(`${BASE_URL}/raffle/public`);
      const publicData = await publicRes.json();
      if (publicRes.ok && publicData.active) {
        setHasActiveCampaign(true);
        setCampaignOpen(true);
        if (publicData.campaignDeadline) setDeadlineMs(new Date(publicData.campaignDeadline).getTime());
        if (Array.isArray(publicData.prizes) && publicData.prizes.length) {
          // Guests see that prizes exist, but never see a currency amount.
          setPrizes(genericPrizeRows());
        }
        if (publicData.campaignName) setCampaignName(publicData.campaignName);
      } else {
        setHasActiveCampaign(false);
        setCampaignOpen(false);
        setPrizes(genericPrizeRows());
      }

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
        setHasActiveCampaign(!!data.campaignOpen);
        if (data.campaignStartsAt) setCampaignStartMs(new Date(data.campaignStartsAt).getTime());
        if (data.campaignDeadline) setDeadlineMs(new Date(data.campaignDeadline).getTime());
        if (data.campaignOpen && Array.isArray(data.prizes) && data.prizes.length) {
          setPrizes(toPrizeRows(data.prizes));
        } else if (!data.campaignOpen) {
          setPrizes(genericPrizeRows());
        }
        if (typeof data.minReferrals === "number") setMinReferrals(data.minReferrals);
        if (typeof data.campaignOpen === "boolean") setCampaignOpen(data.campaignOpen);
        if (data.campaignName) setCampaignName(data.campaignName);
        setStatusData(data);
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
  if (!(await ensureAuth("join the birthday raffle"))) return;

  if (hasBirthdayEvent) {
    // User already has a qualifying event → go to status page
    router.push("/birthday-raffle/status" as any);
  } else {
    // No event yet → go to Home, which pushes /create-event with the flag.
    // Must be the "home" screen specifically, not the bare "(tabs)" group —
    // that's just the folder name, not a navigable route, and Home is the
    // only screen reading `openCreate` (see its useLocalSearchParams effect).
    router.replace("/(tabs)/home?openCreate=birthday" as any);
  }
};

  // Whether *this month's* batch specifically has closed — server-
  // authoritative, reflects an admin ending it early just as much as it
  // reaching its natural deadline (see isCampaignOpen). Purely informational
  // now: a birthday dated for next month (or up to 6 months out) can always
  // be registered regardless, so this no longer disables the CTA.
  const upcoming = !campaignOpen && campaignStartMs > Date.now();
  const ended = !campaignOpen && !upcoming;
  const campaignStartLabel = new Date(campaignStartMs).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  // A permanent "you won" sign on this page too — not just the one-time
  // popup — for a winner who lands here (rather than /status) on a later
  // visit.
  const isWinner = statusData?.status === "winner" && !!statusData?.winnerRank;
  const winningTier = isWinner
    ? statusData?.prizes?.find((p) => p.rank === statusData?.winnerRank)
    : undefined;

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
          colors={isWinner ? ["#2D1B69", "#B8860B"] : [colors.primary, colors.primaryDark]}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[styles.heroBadge, isWinner && styles.winnerBadge]}>
            <Ionicons
              name={
                isWinner
                  ? "trophy"
                  : upcoming
                  ? "calendar-outline"
                  : ended
                  ? "time-outline"
                  : "gift"
              }
              size={14}
              color={isWinner ? "#3D2900" : "#fff"}
            />
            <Text style={[styles.heroBadgeText, isWinner && styles.winnerBadgeText]}>
              {isWinner
                ? `${ordinal(statusData!.winnerRank!)} PLACE WINNER`
                : upcoming
                ? "NEXT CAMPAIGN"
                : ended
                ? "CAMPAIGN ENDED"
                : "LIMITED TIME"}
            </Text>
          </View>

          {isWinner && (
            <Text style={styles.winnerPrizeLine}>
              🎉{" "}
              {winningTier?.couponAmount
                ? `${formatMoney(winningTier.couponAmount, winningTier.couponCurrency || "NGN")} OurCityVibe credit`
                : "You won a prize"}
              {winningTier?.extraPerk ? ` + ${winningTier.extraPerk}` : ""} — check your Wallet & Rewards
            </Text>
          )}

          <Text style={styles.heroTitle}>{campaignName}</Text>
          <Text style={styles.heroSubtitle}>{CAMPAIGN.subtitle}</Text>

          {upcoming ? (
            <View style={styles.endedRow}>
              <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.endedText}>
                The next raffle starts {campaignStartLabel}. You can create your birthday event
                now and participate in that campaign.
              </Text>
            </View>
          ) : ended ? (
            <View style={styles.endedRow}>
              <Ionicons name="alert-circle-outline" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.endedText}>
                This month&apos;s batch closed {deadlineLabel}. You can still register a
                future birthday below.
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

        {!hasBirthdayEvent && (
          <View style={styles.futureBirthdayNote}>
            <View style={styles.futureBirthdayIcon}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.futureBirthdayCopy}>
              <Text style={styles.futureBirthdayTitle}>Birthday coming up later?</Text>
              <Text style={styles.futureBirthdayText}>
                You can still create your birthday event up to 6 months ahead. It will wait for
                your birthday month&apos;s raffle automatically.
              </Text>
            </View>
          </View>
        )}

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
                {/* Localized to the viewer's own country server-side — a
                    Nigerian sees Naira, everyone else sees Dollars, never
                    both. 1 coupon = 1 unit of that currency, so the amount IS
                    the worth. */}
                <Text style={styles.prizeReward}>
                  {hasActiveCampaign && prize.couponAmount > 0
                    ? `${formatMoney(prize.couponAmount, prize.couponCurrency)} OurCityVibe credit`
                    : "Prizes"}
                </Text>
                {!!prize.extraPerk && (
                  <Text style={styles.prizeCoupon}>+ {prize.extraPerk}</Text>
                )}
                {prize.couponAmount > 0 && (
                  <Text style={styles.prizeHint}>
                    Spend it at checkout with{" "}
                    {statusData?.vendor
                      ? statusData.vendor.businessName || `@${statusData.vendor.username}`
                      : "any vendor"}{" "}
                    — expires if unused for 30 days
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Redeem-at vendor — only present when the campaign assigned one for
            this viewer's currency; a campaign with none leaves credit
            spendable at any vendor, so there's nothing to link to. Needs
            `vendorId` specifically (the vendor's separate listing doc), not
            `_id` (their user account) — /vendor-details looks up by the
            former. */}
        {!!statusData?.vendor?.vendorId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Redeem your credit at</Text>
            <TouchableOpacity
              style={styles.vendorCard}
              activeOpacity={0.85}
              onPress={() => router.push(`/vendor-details/${statusData.vendor!.vendorId}` as any)}
            >
              <View style={styles.vendorAvatarWrap}>
                {statusData.vendor.businessPicture || statusData.vendor.profilePicture ? (
                  <Image
                    source={{ uri: statusData.vendor.businessPicture || statusData.vendor.profilePicture }}
                    style={styles.vendorAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="storefront" size={22} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.vendorName} numberOfLines={1}>
                  {statusData.vendor.businessName || statusData.vendor.username}
                </Text>
                <Text style={styles.vendorHint}>Tap to view this vendor</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
        )}

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

        {/* Primary CTA — always live. A birthday any time this month enters
            the current batch; a birthday up to 6 months out just registers
            and waits ("pending") for its own month's batch to open — see
            birthdayRaffleDateError on the server — so there's no longer a
            state where this button has nothing useful to do. */}
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={handlePrimaryCTA}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>
              {hasBirthdayEvent ? "View My Raffle Status" : "Create Birthday Event & Enter"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
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

        {ended && !hasBirthdayEvent && (
          <Text style={styles.footerNote}>
            This month&apos;s batch is closed to new entries, but you can still register a
            birthday for an upcoming month (up to 6 months ahead) — it will enter that
            month&apos;s batch automatically once it opens.
          </Text>
        )}

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

      <RaffleWinnerPopup data={statusData} />
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
    winnerBadge: {
      backgroundColor: "#F5B700",
    },
    winnerBadgeText: {
      color: "#3D2900",
    },
    winnerPrizeLine: {
      fontFamily: Fonts.semiBold,
      fontSize: 13,
      color: "#FFE8A3",
      marginBottom: 10,
      lineHeight: 18,
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
    futureBirthdayNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      backgroundColor: c.primaryFaded,
      borderRadius: 16,
      padding: 14,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: c.primaryBorder || "rgba(168,85,247,0.3)",
    },
    futureBirthdayIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
    },
    futureBirthdayCopy: {
      flex: 1,
    },
    futureBirthdayTitle: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: c.textBright,
      marginBottom: 4,
    },
    futureBirthdayText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      lineHeight: 19,
      color: c.textMuted,
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
    vendorCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
    },
    vendorAvatarWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primaryFaded,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    vendorAvatar: { width: 44, height: 44 },
    vendorName: { fontFamily: Fonts.bold, fontSize: 15, color: c.textBright },
    vendorHint: { fontFamily: Fonts.regular, fontSize: 12, color: c.textDim, marginTop: 2 },
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
      fontFamily: Fonts.bold,
      fontSize: 15,
      color: c.primaryLight,
      marginTop: 1,
    },
    prizeCoupon: {
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: c.primary,
      marginTop: 3,
    },
    prizeHint: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: c.textFaint,
      marginTop: 2,
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