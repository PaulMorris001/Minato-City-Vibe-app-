import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { VendorStats } from "@/libs/interfaces";
import { isChecklistSnoozed, snoozeChecklist } from "@/utils/setupChecklist";
import { vendorDisplayName } from "@/utils/displayName";
import VendorEventInvites from "./VendorEventInvites";
import {
  VN,
  VNF,
  VN_CTA_GRADIENT,
  coverGradient,
  categoryEmoji,
} from "./vendorTheme";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import MediaTile from "@/components/shared/MediaTile";
import { EarningsHero, StatCard } from "@/components/shared/EarningsHero";
import { useRouter } from "expo-router";
import { BASE_URL } from "@/constants/constants";
import {
  formatMoney,
  payoutCountryKnown,
  payoutProviderForCountry,
  payoutOnboardingRoute,
  PAYOUT_STATUS_ENDPOINTS,
} from "@/constants/payments";

/** The slice of /earnings/summary this dashboard renders. */
interface EarningsSummary {
  currency: string;
  thisMonthNet: number;
  lastMonthNet: number;
  dailyNet: number[];
}
interface DashboardTabProps {
  stats: VendorStats | null;
  // True while the parent's /vendor/stats call is still in flight. Folded into
  // this tab's own loader so the whole screen appears in one step.
  statsLoading?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onGoToServices?: () => void;
}

const ACCENTS: Record<string, string> = {
  Chefs: VN.amber,
  "Food and Restaurants": VN.pink,
  Restaurants: VN.pink,
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardTab({
  stats,
  statsLoading,
  onRefresh,
  refreshing,
  onGoToServices,
}: DashboardTabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // Business name first — the vendor-side greeting reads as the storefront,
  // not the person behind it. Falls back to their personal name/username for
  // an account that hasn't set a business name yet.
  const [greetingName, setGreetingName] = useState("");
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);

  // Backs the "Complete your setup" checklist. Kept separate from `stats`
  // (which comes from /vendor/stats and knows nothing about verification or
  // payouts) and from the cached SecureStore "user" (which can be stale after
  // an edit in Settings or Account) — a fresh /profile fetch is what Account
  // tab itself trusts for the same fields, so the checklist matches it.
  const [profileMeta, setProfileMeta] = useState<{
    id: string;
    verified: boolean;
    businessPicture: string;
    country: string;
  } | null>(null);
  const [payoutOnboardingComplete, setPayoutOnboardingComplete] = useState(false);
  const [payoutSupported, setPayoutSupported] = useState(true);
  // Everything the dashboard needs (earnings currency + figures, the profile
  // fields the checklist reads, and the payout-status check that depends on
  // them) is loaded together and held behind one gate — otherwise the hero
  // flashes a default-currency figure before /earnings/summary lands and the
  // "Complete your setup" card pops in a beat after the rest of the screen.
  const [loading, setLoading] = useState(true);
  // Manual "no thanks" — separate from completion, and temporary (see
  // isChecklistSnoozed): it comes back after a week to remind them. Keyed per
  // user so it can't leak into a different account that later logs in on
  // this device, and per-screen (vendorDashboard vs the client profile
  // checklist) since the same person can want one and not the other.
  const [dismissed, setDismissed] = useState(false);
  const dismissKey = profileMeta ? `setupChecklistDismissed:vendorDashboard:${profileMeta.id}` : null;

  const dismissChecklist = () => {
    setDismissed(true);
    if (dismissKey) snoozeChecklist(dismissKey);
  };

  useEffect(() => {
    (async () => {
      try {
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          setGreetingName(vendorDisplayName(u));
        }
      } catch {}
    })();
  }, []);

  // One coordinated load so the screen paints once, complete and correct.
  //  - /earnings/summary drives the hero's figures AND its currency (without it
  //    the hero would show a default-currency amount first, then swap).
  //  - /profile supplies the verification / business-photo / country fields the
  //    "Complete your setup" checklist reads (same source Account tab trusts).
  //  - the payout-status check keys off that country, so it runs after profile,
  //    not in parallel — no rail for the country means there's nothing to check.
  // Its snoozed state is resolved here too so the checklist doesn't flash in.
  const loadDashboard = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [earningsRes, profileRes] = await Promise.all([
        fetch(`${BASE_URL}/earnings/summary`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${BASE_URL}/profile`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (earningsRes) setEarnings(earningsRes);

      const u = profileRes?.user;
      const meta = u
        ? {
            id: u._id,
            verified: !!u.verified,
            businessPicture: u.businessPicture || "",
            country: u.location?.country || "",
          }
        : null;
      setProfileMeta(meta);
      if (meta) {
        setDismissed(
          await isChecklistSnoozed(
            `setupChecklistDismissed:vendorDashboard:${meta.id}`
          )
        );
      }

      const provider = meta ? payoutProviderForCountry(meta.country) : null;
      if (meta && provider) {
        setPayoutSupported(true);
        try {
          const res = await fetch(`${BASE_URL}${PAYOUT_STATUS_ENDPOINTS[provider]}`, { headers });
          if (res.ok) setPayoutOnboardingComplete((await res.json()).onboardingComplete ?? false);
        } catch {
          // Non-critical — leave the payout item unchecked.
        }
      } else {
        setPayoutSupported(false);
        setPayoutOnboardingComplete(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Pull-to-refresh: refetch in place, without dropping back to the loader.
  useEffect(() => {
    if (refreshing) loadDashboard();
  }, [refreshing, loadDashboard]);

  const earningsThis = earnings?.thisMonthNet ?? 0;
  const earningsLast = earnings?.lastMonthNet ?? 0;
  const hasBookings = (stats?.bookingsThisMonth ?? 0) > 0 || earningsThis > 0;

  const categories = stats?.servicesByCategory ?? [];

  // "Complete your setup" checklist. Only built once profileMeta has loaded —
  // showing default-false items before that would flash "not verified" at an
  // already-verified vendor. A payout rail this country doesn't have is
  // dropped rather than shown as permanently incomplete (see the effect
  // above); the card itself disappears once every remaining item is done.
  const countryKnown = payoutCountryKnown(profileMeta?.country);
  const checklist = profileMeta
    ? [
        {
          key: "verify",
          label: "Verify your account",
          icon: "shield-checkmark-outline" as const,
          done: profileMeta.verified,
          onPress: () => router.push("/verify-account" as any),
        },
        !countryKnown || payoutSupported
          ? {
              key: "payout",
              label: !countryKnown
                ? "Set your location for payouts"
                : payoutOnboardingComplete
                  ? "Payouts active"
                  : "Set up payouts",
              icon: "cash-outline" as const,
              done: countryKnown && payoutOnboardingComplete,
              // Straight to the actual add-payment screen once we know which
              // rail applies; an unknown country has no rail to send them to
              // yet, so that one case still goes to Settings' own
              // "Use my current location" control.
              onPress: () =>
                router.push((countryKnown ? payoutOnboardingRoute(profileMeta.country) : "/settings") as any),
            }
          : null,
        {
          key: "photo",
          label: "Add a business photo",
          icon: "camera-outline" as const,
          done: !!profileMeta.businessPicture,
          onPress: () => router.push("/vendor-account" as any),
        },
        {
          key: "service",
          label: "Add your first service",
          icon: "briefcase-outline" as const,
          done: (stats?.totalServices ?? 0) > 0,
          onPress: onGoToServices,
        },
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const checklistDone = checklist.filter((i) => i.done).length;
  const showChecklist = !dismissed && checklist.length > 0 && checklistDone < checklist.length;

  // One loader for the whole screen: parent's stats fetch and this tab's own
  // fetches run in parallel and the dashboard is revealed only once they're all
  // in, so it appears complete rather than filling in piece by piece.
  if (loading || statsLoading) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      // Content scrolls under the floating native tab bar on iOS; the system
      // inset keeps the last item reachable above it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Aurora glow */}
      <View pointerEvents="none" style={styles.aurora} />

      {/* Greeting */}
      <View style={styles.section}>
        <Text style={styles.kicker}>{greeting()}</Text>
        <Text style={styles.greetingHeadline}>
          Welcome back, <Text style={styles.greetingName}>{greetingName || "vendor"}</Text>
        </Text>
      </View>

      {/* "Complete your setup" checklist — auto-hides once every item (that
          applies to this vendor) is done. */}
      {showChecklist && (
        <View style={styles.sectionH}>
          <View style={styles.setupCard}>
            <View style={styles.setupHeaderRow}>
              <Text style={styles.setupTitle}>Complete your setup</Text>
              <View style={styles.setupHeaderRight}>
                <Text style={styles.setupCount}>{checklistDone}/{checklist.length}</Text>
                <TouchableOpacity
                  onPress={dismissChecklist}
                  hitSlop={8}
                  accessibilityLabel="Dismiss setup checklist"
                >
                  <Ionicons name="close" size={16} color={colors.textDim} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.setupTileGrid}
            >
              {checklist.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.setupTile, item.done && styles.setupTileDone]}
                  activeOpacity={0.8}
                  onPress={item.onPress}
                  disabled={item.done || !item.onPress}
                >
                  <View style={[styles.setupTileIcon, item.done && styles.setupCheckDone]}>
                    <Ionicons
                      name={item.done ? "checkmark" : item.icon}
                      size={16}
                      color={item.done ? VN.green : colors.textBright}
                    />
                  </View>
                  <Text style={styles.setupTileLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Pending event invitations */}
      <VendorEventInvites />

      {/* Earnings hero. Sourced from /earnings/summary — which counts tickets,
          guides, bookings AND orders — rather than /vendor/stats, whose
          earnings figures only ever counted bookings. Tapping through opens the
          full breakdown. */}
      <View style={styles.sectionH}>
        <EarningsHero
          net={earningsThis}
          previousNet={earningsLast}
          daily={earnings?.dailyNet}
          currency={earnings?.currency}
          onPress={() => router.push("/earnings" as any)}
        />
      </View>

      {/* Stats grid */}
      <View style={styles.sectionH}>
        <View style={styles.statsGrid}>
          <StatCard
            icon="briefcase"
            accent={VN.purpleSoft}
            label="Total services"
            value={stats?.totalServices ?? 0}
            sub={`${stats?.activeServices ?? 0} active`}
          />
          <StatCard
            icon="calendar"
            accent={VN.pink}
            label="Bookings"
            value={stats?.bookingsThisMonth ?? 0}
            sub={hasBookings ? "this month" : "no bookings yet"}
          />
          <StatCard
            icon="star"
            accent={VN.amber}
            label="Rating"
            value={(stats?.rating ?? 0).toFixed(1)}
            sub={`${stats?.ratingCount ?? 0} reviews`}
          />
          <StatCard
            icon="cash-outline"
            accent={VN.green}
            label="Avg. price"
            value={formatMoney(Number(stats?.averagePrice ?? 0), earnings?.currency)}
            sub="per service"
          />
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.sectionH}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }} onPress={onGoToServices}>
            <LinearGradient
              colors={VN_CTA_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>New service</Text>
            </LinearGradient>
          </TouchableOpacity>
          {/* Opens the real payouts list. This used to go to the account tab,
              which has bank setup and no payouts at all. */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.glassBtn}
            onPress={() => router.push("/earnings" as any)}
          >
            <Ionicons name="cash-outline" size={16} color={colors.textBright} />
            <Text style={styles.glassBtnText}>View payouts</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* By category */}
      {categories.length > 0 && (
        <View style={styles.sectionH}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>By category</Text>
            <TouchableOpacity onPress={onGoToServices}>
              <Text style={styles.actionLink}>Manage</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 8 }}>
            {categories.map((c) => {
              const accent = ACCENTS[c.category] || VN.purple;
              return (
                <TouchableOpacity key={c.category} style={styles.catRow} activeOpacity={0.8} onPress={onGoToServices}>
                  <View style={[styles.catIcon, { borderColor: accent + "44" }]}>
                    <Text style={{ fontSize: 18 }}>{categoryEmoji(c.category)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catName}>{c.category}</Text>
                    <Text style={styles.catSub}>
                      {c.count} service{c.count !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={[styles.catPill, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
                    <Text style={[styles.catPillText, { color: accent }]}>{c.count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Recent services */}
      <View style={styles.sectionH}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Recent services</Text>
          {(stats?.recentServices?.length ?? 0) > 0 && (
            <TouchableOpacity onPress={onGoToServices}>
              <Text style={styles.actionLink}>See all</Text>
            </TouchableOpacity>
          )}
        </View>
        {stats?.recentServices && stats.recentServices.length > 0 ? (
          <View style={{ gap: 8 }}>
            {stats.recentServices.map((s) => {
              const [c1, c2] = coverGradient(s._id);
              const available = s.availability === "available" && s.isActive;
              return (
                <TouchableOpacity key={s._id} style={styles.recentRow} activeOpacity={0.85} onPress={onGoToServices}>
                  {s.images && s.images.length > 0 ? (
                    <MediaTile uri={s.images[0]} style={styles.recentThumb} posterOnly />
                  ) : (
                    <LinearGradient colors={[c1, c2]} style={styles.recentThumb}>
                      <Text style={styles.recentThumbEmoji}>{categoryEmoji(s.category)}</Text>
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recentTitle} numberOfLines={1}>{s.name}</Text>
                    <View style={styles.recentMeta}>
                      <Text style={styles.recentMetaText} numberOfLines={1}>{s.category}</Text>
                      <View style={styles.metaDot} />
                      <Text style={styles.recentPrice}>{formatMoney(s.price, s.currency)}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      available
                        ? { backgroundColor: "rgba(52,211,153,0.16)" }
                        : { backgroundColor: colors.glassFillSubtle },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: available ? colors.successLight : colors.textFaint },
                      ]}
                    />
                    <Text style={[styles.statusText, { color: available ? colors.successLight : colors.textFaint }]}>
                      {available ? "available" : "unavailable"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TouchableOpacity onPress={onGoToServices} style={styles.recentEmpty}>
            <Text style={styles.recentEmptyText}>+ Add your first service</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.backgroundDeep },
  loadingBox: { alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: c.textSecondary },
  aurora: {
    position: "absolute",
    top: -160,
    alignSelf: "center",
    width: 360,
    height: 280,
    borderRadius: 180,
    backgroundColor: c.primaryFadedStrong,
  },
  section: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  sectionH: { paddingHorizontal: 18, paddingBottom: 18 },
  kicker: { fontFamily: VNF.medium, fontSize: 12, color: c.textDim, marginBottom: 4 },
  greetingHeadline: { fontFamily: VNF.display, fontSize: 30, color: c.textBright, letterSpacing: -0.8, lineHeight: 33 },
  greetingName: { color: c.primaryLight },


  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  setupCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: c.cardGlass,
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  setupHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  setupHeaderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  setupTitle: { fontFamily: VNF.heading, fontSize: 15, color: c.textBright, letterSpacing: -0.2 },
  setupCount: { fontFamily: VNF.bold, fontSize: 12, color: c.primaryLight },
  // Small tiles in a wrapping row — 3 to a line, a 4th (or a dropped one
  // leaving 2) still sizes evenly since the basis is a fraction, not fixed.
  // Fixed-width tiles in a horizontal scroller rather than flex-shrinking to
  // fit — squeezing a 4th tile onto the card's own width left labels
  // wrapping awkwardly, so it scrolls instead.
  setupTileGrid: { flexDirection: "row", gap: 8, marginTop: 12 },
  setupTile: {
    width: 104,
    minHeight: 84,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassStroke,
    justifyContent: "space-between",
  },
  setupTileDone: { opacity: 0.6 },
  setupTileIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  setupCheckDone: { borderColor: VN.green, backgroundColor: VN.green + "22" },
  setupTileLabel: { fontFamily: VNF.medium, fontSize: 11.5, color: c.textBright, marginTop: 8, lineHeight: 14 },

  sectionTitle: { fontFamily: VNF.heading, fontSize: 18, color: c.textBright, letterSpacing: -0.4, marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionLink: { fontFamily: VNF.bold, fontSize: 11.5, color: c.primaryLight, marginBottom: 12 },

  actionsRow: { flexDirection: "row", gap: 8 },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: VN.purple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryBtnText: { fontFamily: VNF.heading, fontSize: 13, color: c.white },
  glassBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
  },
  glassBtnText: { fontFamily: VNF.sub, fontSize: 13, color: c.textBright },

  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: c.cardGlass,
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: c.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: { fontFamily: VNF.sub, fontSize: 14, color: c.textBright },
  catSub: { fontFamily: VNF.medium, fontSize: 11, color: c.textDim, marginTop: 2 },
  catPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  catPillText: { fontFamily: VNF.bold, fontSize: 11 },

  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: c.cardGlass,
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  recentThumb: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  recentThumbEmoji: { fontSize: 26 },
  recentTitle: { fontFamily: VNF.sub, fontSize: 14.5, color: c.textBright },
  recentMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  recentMetaText: { fontFamily: VNF.medium, fontSize: 11.5, color: c.textDim, flexShrink: 1 },
  metaDot: { width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: c.textFaint },
  recentPrice: { fontFamily: VNF.bold, fontSize: 11.5, color: c.primaryLight },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: VNF.bold, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  recentEmpty: { paddingVertical: 24, alignItems: "center" },
  recentEmptyText: { fontFamily: VNF.bold, fontSize: 14, color: c.primaryLight },
});
