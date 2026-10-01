import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/** `newRaffle` from GET /raffle/status (see getRaffleStatus). */
export interface NewRaffleInfo {
  name: string;
  deadline: string;
  daysLeft: number;
}

/**
 * "A new raffle is live" notice for someone whose own raffle has ended. The
 * raffle screens otherwise only ever describe the user's existing entry, so
 * without this a past entrant never found out the next batch had opened.
 * Shown on both the landing page and the status page.
 */
export default function NewRaffleBanner({ raffle, onEnter }: { raffle: NewRaffleInfo; onEnter: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const ends = new Date(raffle.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const left =
    raffle.daysLeft <= 0 ? "ends today" : `${raffle.daysLeft} day${raffle.daysLeft === 1 ? "" : "s"} left`;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={styles.liveDot} />
        <Text style={styles.kicker}>NEW RAFFLE IS LIVE</Text>
      </View>
      <Text style={styles.title}>{raffle.name || "Birthday Raffle"}</Text>
      <Text style={styles.body}>
        Your last raffle has ended — you can enter this one too. Create a birthday event before {ends} ({left}).
      </Text>
      <TouchableOpacity style={styles.button} onPress={onEnter} activeOpacity={0.85}>
        <Text style={styles.buttonText}>Enter the new raffle</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.primaryFaded,
      borderWidth: 1,
      borderColor: c.primaryBorder,
      borderRadius: 20,
      padding: 18,
      marginBottom: 20,
    },
    headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accentPink },
    kicker: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 0.8, color: c.primaryLight },
    title: { fontFamily: Fonts.bold, fontSize: 18, color: c.textBright, marginBottom: 6 },
    body: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, color: c.textSecondary, marginBottom: 14 },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 13,
    },
    buttonText: { fontFamily: Fonts.bold, fontSize: 15, color: c.white },
  });
