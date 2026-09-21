import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface StepDoneCardProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Base tint (e.g. colors.success / colors.warning) — drives the card wash,
   *  border and the badge's gradient start. */
  tint: string;
  /** Lighter sibling tint (e.g. colors.successLight) for the badge's gradient
   *  end, so the badge reads as a glossy sphere rather than a flat circle. */
  tintLight: string;
  title: string;
  subtitle?: string;
}

/**
 * The "you're done with this step" card shared by EmailStep, IdentityStep and
 * PayoutStep — a gradient badge inside a soft halo, replacing a flat tinted
 * icon so a completed step reads as a small celebration rather than a status
 * line.
 */
export default function StepDoneCard({ icon, tint, tintLight, title, subtitle }: StepDoneCardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.card, { backgroundColor: tint + "12", borderColor: tint + "35", shadowColor: tint }]}>
      <View style={[styles.halo, { backgroundColor: tint + "1C" }]}>
        <LinearGradient
          colors={[tint, tintLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Ionicons name={icon} size={30} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 20,
      paddingVertical: 28,
      paddingHorizontal: 24,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 4,
    },
    halo: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    badge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { fontSize: 18, fontFamily: Fonts.bold, color: c.text, textAlign: "center" },
    subtitle: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
  });
