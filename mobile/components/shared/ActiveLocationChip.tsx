import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ActiveLocationChipProps {
  city: string | null;
}

/**
 * Read-only display of the app's one shared active browsing location —
 * tapping it opens Select Location, the same screen the home feed uses.
 * Changing it there updates the `selectedCity` SecureStore key every
 * location-aware screen (home, vendors, best of, discover) reads, so a
 * change made from any one of them is immediately the active location for
 * all the others too.
 */
export default function ActiveLocationChip({ city }: ActiveLocationChipProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={() => router.push("/select-location" as any)}
      activeOpacity={0.8}
    >
      <Ionicons name="location" size={16} color={Colors.primary} />
      <Text style={styles.chipText} numberOfLines={1}>
        {city || "All locations"}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.backgroundSecondary,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 12,
    },
    chipText: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.medium,
      color: c.text,
    },
  });
