/**
 * The earnings hero card + its stat tiles.
 *
 * Extracted from the vendor DashboardTab so the vendor dashboard and the
 * standalone Earnings screen render the same thing from the same code. They show
 * a seller their money; if the two ever drift, one of them is lying.
 *
 * The card keeps its dark gradient in both colour schemes, so everything drawn
 * on top of it is pinned to the dark-mode palette rather than theme tokens.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { VN, VNF, VN_EARNINGS_GRADIENT } from "@/components/vendor/vendorTheme";
import { formatMoney } from "@/constants/payments";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/** Placeholder bar heights, used only when a seller has no history yet. */
const PLACEHOLDER_BARS = [24, 32, 18, 40, 22, 36, 28, 44, 30, 38, 50, 46];

export interface EarningsHeroProps {
  /** Net earnings for the current period, in major units of `currency`. */
  net: number;
  /** Previous period's net, for the trend chip. */
  previousNet?: number;
  /** Per-day nets for the sparkline. Falls back to a flat placeholder. */
  daily?: number[];
  currency?: string;
  /** Overrides the "EARNINGS · THIS MONTH" kicker. */
  label?: string;
  onPress?: () => void;
}

export function EarningsHero({
  net,
  previousNet = 0,
  daily,
  currency,
  label = "EARNINGS · THIS MONTH",
  onPress,
}: EarningsHeroProps) {
  const styles = useThemedStyles(createStyles);

  const delta = net - previousNet;
  const up = delta >= 0;
  const pct =
    previousNet > 0 ? Math.round((delta / previousNet) * 100) : net > 0 ? 100 : 0;

  const bars = useMemo(() => {
    const series = daily?.length ? daily : [];
    const max = Math.max(1, ...series);
    const source = series.length ? series : PLACEHOLDER_BARS;
    return source.map((v) => {
      const height = series.length ? Math.round((v / max) * 100) : v;
      return Math.max(8, Math.min(100, height));
    });
  }, [daily]);

  const card = (
    <LinearGradient
      colors={VN_EARNINGS_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.earningsCard}
    >
      <View style={[styles.blob, { right: -60, top: -60, backgroundColor: "rgba(236,72,153,0.35)" }]} />
      <View style={[styles.blob, { left: -40, bottom: -60, backgroundColor: "rgba(34,211,238,0.18)" }]} />
      <View style={styles.earningsTopRow}>
        <Text style={styles.earningsKicker}>{label}</Text>
        <View
          style={[
            styles.trendChip,
            up
              ? { backgroundColor: "rgba(52,211,153,0.18)", borderColor: "rgba(52,211,153,0.35)" }
              : { backgroundColor: "rgba(236,72,153,0.18)", borderColor: "rgba(236,72,153,0.35)" },
          ]}
        >
          <Ionicons
            name={up ? "chevron-up" : "chevron-down"}
            size={10}
            color={up ? VN.greenSoft : "#FBCFE8"}
          />
          <Text style={[styles.trendText, { color: up ? VN.greenSoft : "#FBCFE8" }]}>
            {Math.abs(pct)}%
          </Text>
        </View>
      </View>

      <Text style={styles.earningsAmount}>{formatMoney(net, currency)}</Text>
      <Text style={styles.earningsDelta}>
        {up ? "+" : "-"}
        {formatMoney(Math.abs(delta), currency)} vs. last month
      </Text>

      <View style={styles.sparkline}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: `${h}%` },
              i > 8 ? { backgroundColor: VN.pink } : { backgroundColor: "rgba(255,255,255,0.16)" },
            ]}
          />
        ))}
      </View>
    </LinearGradient>
  );

  if (!onPress) return card;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      {card}
    </TouchableOpacity>
  );
}

export interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  label: string;
  value: string | number;
  sub: string;
}

/** Small metric tile used under the hero. */
export function StatCard({ icon, accent, label, value, sub }: StatCardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <View
          style={[styles.statIcon, { backgroundColor: accent + "22", borderColor: accent + "44" }]}
        >
          <Ionicons name={icon} size={14} color={accent} />
        </View>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    earningsCard: {
      borderRadius: 20,
      overflow: "hidden",
      padding: 18,
      borderWidth: 1,
      // The hero keeps its dark gradient in both schemes, so its border and text
      // stay pinned to the dark-mode values.
      borderColor: "rgba(255,255,255,0.14)",
      shadowColor: VN.purpleDeep,
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.45,
      shadowRadius: 30,
      elevation: 10,
    },
    blob: { position: "absolute", width: 200, height: 200, borderRadius: 100 },
    earningsTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    earningsKicker: {
      fontFamily: VNF.bold,
      fontSize: 10,
      color: "rgba(244,238,255,0.62)",
      letterSpacing: 1.2,
    },
    trendChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    trendText: { fontFamily: VNF.bold, fontSize: 10 },
    earningsAmount: {
      fontFamily: VNF.display,
      fontSize: 42,
      color: "#F4EEFF",
      letterSpacing: -1.6,
      marginTop: 6,
    },
    earningsDelta: {
      fontFamily: VNF.medium,
      fontSize: 12,
      color: "rgba(255,255,255,0.75)",
      marginTop: 4,
    },
    sparkline: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 3,
      height: 28,
      marginTop: 14,
    },
    bar: { flex: 1, borderRadius: 2 },

    statCard: {
      width: "47.8%",
      flexGrow: 1,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.cardGlass,
      borderWidth: 1,
      borderColor: c.glassStroke,
    },
    statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    statValue: { fontFamily: VNF.heading, fontSize: 22, color: c.textBright, letterSpacing: -0.4 },
    statLabel: { fontFamily: VNF.semibold, fontSize: 11.5, color: c.textBright, marginTop: 8 },
    statSub: { fontFamily: VNF.medium, fontSize: 10.5, color: c.textFaint, marginTop: 2 },
  });

export default EarningsHero;
