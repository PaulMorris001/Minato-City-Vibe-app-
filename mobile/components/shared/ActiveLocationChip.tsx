import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import LocationPickerSheet from "./LocationPickerSheet";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ActiveLocationChipProps {
  city: string | null;
  /**
   * Pill form for tight spots — home renders it inline beside the greeting
   * date, where the full-width row form would dominate the block. Same tap
   * target and same picker, just smaller type and a rounded outline.
   */
  compact?: boolean;
}

/**
 * The app's one shared active browsing location — tapping it opens the city
 * picker as a bottom sheet. Picking there updates the `selectedCity` store that
 * every location-aware screen (home, vendors, guides, search) reads, so a
 * change made from any one of them is immediately active for all the others.
 *
 * The sheet is owned here rather than by each caller so every entry point stays
 * consistent and nobody has to wire up its state.
 */
export default function ActiveLocationChip({ city, compact = false }: ActiveLocationChipProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.chip, compact && styles.chipCompact]}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={compact ? "location-outline" : "location"}
          size={compact ? 13 : 16}
          color={Colors.primary}
        />
        <Text style={[styles.chipText, compact && styles.chipTextCompact]} numberOfLines={1}>
          {city || (compact ? "Anywhere" : "All locations")}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 12 : 16} color={colors.textSecondary} />
      </TouchableOpacity>
      <LocationPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
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
    chipCompact: {
      gap: 4,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 0,
      maxWidth: 150,
      flexShrink: 1,
    },
    chipText: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.medium,
      color: c.text,
    },
    chipTextCompact: {
      // `flex: 1` would stretch the pill to fill the row; compact sizes to
      // its label and only shrinks when the city name is long.
      flex: 0,
      flexShrink: 1,
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
    },
  });
