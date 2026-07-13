import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { VendorStats } from "@/libs/interfaces";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import VendorEventInvites from "./VendorEventInvites";
import {
  VN,
  VNF,
  VN_CTA_GRADIENT,
  VN_EARNINGS_GRADIENT,
  coverGradient,
  categoryEmoji,
} from "./vendorTheme";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface DashboardTabProps {
  stats: VendorStats | null;
  onRefresh: () => void;
  refreshing: boolean;
  onGoToServices?: () => void;
  onGoToAccount?: () => void;
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

function StatCard({
  icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  label: string;
  value: string | number;
  sub: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
          <Ionicons name={icon} size={14} color={accent} />
        </View>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

export default function DashboardTab({
  stats,
  onRefresh,
  refreshing,
  onGoToServices,
  onGoToAccount,
}: DashboardTabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const formatPrice = useFormatPrice();
  const [firstName, setFirstName] = useState("");

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

  const earningsThis = stats?.earningsThisMonth ?? 0;
  const earningsLast = stats?.earningsLastMonth ?? 0;
  const delta = earningsThis - earningsLast;
  const pct = earningsLast > 0 ? Math.round((delta / earningsLast) * 100) : earningsThis > 0 ? 100 : 0;
  const up = delta >= 0;
  const hasBookings = (stats?.bookingsThisMonth ?? 0) > 0 || earningsThis > 0;

  const bars = useMemo(() => {
    const daily = stats?.dailyEarnings && stats.dailyEarnings.length ? stats.dailyEarnings : [];
    const max = Math.max(1, ...daily);
    const src = daily.length ? daily : [24, 32, 18, 40, 22, 36, 28, 44, 30, 38, 50, 46];
    return src.map((v) => {
      const pctH = daily.length ? Math.round((v / max) * 100) : v;
      return Math.max(8, Math.min(100, pctH));
    });
  }, [stats?.dailyEarnings]);

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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={VN.purple} />
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

      {/* Earnings hero */}
      <View style={styles.sectionH}>
        <LinearGradient
          colors={VN_EARNINGS_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.earningsCard}
        >
          <View style={[styles.blob, { right: -60, top: -60, backgroundColor: "rgba(236,72,153,0.35)" }]} />
          <View style={[styles.blob, { left: -40, bottom: -60, backgroundColor: "rgba(34,211,238,0.18)" }]} />
          <View style={styles.earningsTopRow}>
            <Text style={styles.earningsKicker}>EARNINGS · THIS MONTH</Text>
            <View
              style={[
                styles.trendChip,
                up
                  ? { backgroundColor: "rgba(52,211,153,0.18)", borderColor: "rgba(52,211,153,0.35)" }
                  : { backgroundColor: "rgba(236,72,153,0.18)", borderColor: "rgba(236,72,153,0.35)" },
              ]}
            >
              <Ionicons name={up ? "chevron-up" : "chevron-down"} size={10} color={up ? VN.greenSoft : "#FBCFE8"} />
              <Text style={[styles.trendText, { color: up ? VN.greenSoft : "#FBCFE8" }]}>{Math.abs(pct)}%</Text>
            </View>
          </View>
          <Text style={styles.earningsAmount}>
            ${formatPrice(earningsThis)}
          </Text>
          <Text style={styles.earningsDelta}>
            {up ? "+" : "-"}${formatPrice(Math.abs(delta))} vs. last month
          </Text>
          <View style={styles.sparkline}>
            {bars.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  { height: `${h}%` },
                  i > 8
                    ? { backgroundColor: VN.pink }
                    : { backgroundColor: colors.glassStrokeStrong },
                ]}
              />
            ))}
          </View>
        </LinearGradient>
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
            value={`$${formatPrice(Number(stats?.averagePrice ?? 0))}`}
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
          <TouchableOpacity activeOpacity={0.85} style={styles.glassBtn} onPress={onGoToAccount}>
            <Ionicons name="cash-outline" size={16} color={VN.text} />
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
                    <Image source={{ uri: s.images[0] }} style={styles.recentThumb} contentFit="cover" />
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
                      <Text style={styles.recentPrice}>${formatPrice(s.price)}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      available
                        ? { backgroundColor: "rgba(52,211,153,0.16)" }
                        : { backgroundColor: "rgba(244,238,255,0.06)" },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: available ? VN.green : VN.textMute },
                      ]}
                    />
                    <Text style={[styles.statusText, { color: available ? VN.greenSoft : VN.textMute }]}>
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
  container: { flex: 1, backgroundColor: VN.bg },
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
  kicker: { fontFamily: VNF.medium, fontSize: 12, color: VN.textDim, marginBottom: 4 },
  greetingHeadline: { fontFamily: VNF.display, fontSize: 30, color: VN.text, letterSpacing: -0.8, lineHeight: 33 },
  greetingName: { color: VN.purpleSoft },

  earningsCard: {
    borderRadius: 20,
    overflow: "hidden",
    padding: 18,
    borderWidth: 1,
    borderColor: VN.strokeHi,
    shadowColor: VN.purpleDeep,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 10,
  },
  blob: { position: "absolute", width: 200, height: 200, borderRadius: 100 },
  earningsTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  earningsKicker: { fontFamily: VNF.bold, fontSize: 10, color: c.textDim, letterSpacing: 1.2 },
  trendChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  trendText: { fontFamily: VNF.bold, fontSize: 10 },
  earningsAmount: { fontFamily: VNF.display, fontSize: 42, color: c.text, letterSpacing: -1.6, marginTop: 6 },
  earningsDelta: { fontFamily: VNF.medium, fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  sparkline: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28, marginTop: 14 },
  bar: { flex: 1, borderRadius: 2 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47.8%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: VN.surface,
    borderWidth: 1,
    borderColor: VN.stroke,
  },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: VNF.heading, fontSize: 22, color: VN.text, letterSpacing: -0.4 },
  statLabel: { fontFamily: VNF.semibold, fontSize: 11.5, color: VN.text, marginTop: 8 },
  statSub: { fontFamily: VNF.medium, fontSize: 10.5, color: VN.textMute, marginTop: 2 },

  sectionTitle: { fontFamily: VNF.heading, fontSize: 18, color: VN.text, letterSpacing: -0.4, marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionLink: { fontFamily: VNF.bold, fontSize: 11.5, color: VN.purpleSoft, marginBottom: 12 },

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
    borderColor: VN.strokeHi,
  },
  glassBtnText: { fontFamily: VNF.sub, fontSize: 13, color: VN.text },

  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: VN.surface,
    borderWidth: 1,
    borderColor: VN.stroke,
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
  catName: { fontFamily: VNF.sub, fontSize: 14, color: VN.text },
  catSub: { fontFamily: VNF.medium, fontSize: 11, color: VN.textDim, marginTop: 2 },
  catPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  catPillText: { fontFamily: VNF.bold, fontSize: 11 },

  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: VN.surface,
    borderWidth: 1,
    borderColor: VN.stroke,
  },
  recentThumb: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  recentThumbEmoji: { fontSize: 26 },
  recentTitle: { fontFamily: VNF.sub, fontSize: 14.5, color: VN.text },
  recentMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  recentMetaText: { fontFamily: VNF.medium, fontSize: 11.5, color: VN.textDim, flexShrink: 1 },
  metaDot: { width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: VN.textMute },
  recentPrice: { fontFamily: VNF.bold, fontSize: 11.5, color: VN.purpleSoft },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: VNF.bold, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  recentEmpty: { paddingVertical: 24, alignItems: "center" },
  recentEmptyText: { fontFamily: VNF.bold, fontSize: 14, color: VN.purpleSoft },
});
