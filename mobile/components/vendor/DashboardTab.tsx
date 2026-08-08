import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { VendorStats } from "@/libs/interfaces";
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
import { formatMoney } from "@/constants/payments";

/** The slice of /earnings/summary this dashboard renders. */
interface EarningsSummary {
  currency: string;
  thisMonthNet: number;
  lastMonthNet: number;
  dailyNet: number[];
}
interface DashboardTabProps {
  stats: VendorStats | null;
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
  onRefresh,
  refreshing,
  onGoToServices,
}: DashboardTabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          setFirstName((u.username || "").split(" ")[0]);
        }
      } catch {}
    })();
  }, []);

  // Earnings come from /earnings/summary, not /vendor/stats: the latter's
  // earnings fields sum CONFIRMED BOOKINGS ONLY, so a vendor who also sells
  // tickets or guides saw a number far below what they'd actually made.
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await fetch(`${BASE_URL}/earnings/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setEarnings(await res.json());
      } catch {
        // Non-critical — the hero falls back to zeroes.
      }
    })();
  }, [refreshing]);

  const earningsThis = earnings?.thisMonthNet ?? 0;
  const earningsLast = earnings?.lastMonthNet ?? 0;
  const hasBookings = (stats?.bookingsThisMonth ?? 0) > 0 || earningsThis > 0;

  const categories = stats?.servicesByCategory ?? [];

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
          Welcome back, <Text style={styles.greetingName}>{firstName || "vendor"}</Text>
        </Text>
      </View>

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
