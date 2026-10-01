import React from "react";
import { ScrollView, Text, TouchableOpacity, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { AU_FONT } from "@/components/auth/tokens";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

export interface CategoryChipOption {
  /** What `onChange` reports — a category name, a vendor type id, … */
  value: string;
  label: string;
  emoji?: string;
}

interface CategoryChipsProps {
  options: CategoryChipOption[];
  /** `null` = the leading "All" chip is selected. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Label of the leading "nothing picked" chip — "All" to filter, "None" to tag. */
  allLabel?: string;
  /** Wrap onto several lines instead of scrolling sideways (full-page forms). */
  wrap?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * One horizontally scrolling row of category pills with a leading "All" chip.
 * The browse filter for events (categories), vendors (vendor types) and guides
 * (topics), and the optional category picker when creating an event — same
 * look as the date chips on public-events.tsx. Renders nothing with no
 * options, so a list that failed to load leaves no empty row behind.
 */
export default function CategoryChips({
  options,
  value,
  onChange,
  allLabel = "All",
  wrap = false,
  contentContainerStyle,
}: CategoryChipsProps) {
  const styles = useThemedStyles(createStyles);
  if (options.length === 0) return null;

  const pick = (next: string | null) => {
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };

  const chip = (key: string, label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const chips = [
    chip("__all", allLabel, value === null, () => pick(null)),
    ...options.map((o) =>
      chip(o.value, o.emoji ? `${o.emoji} ${o.label}` : o.label, o.value === value, () => pick(o.value))
    ),
  ];

  if (wrap) return <View style={[styles.row, styles.wrap, contentContainerStyle]}>{chips}</View>;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.row, contentContainerStyle]}
    >
      {chips}
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { gap: 8 },
    wrap: { flexDirection: "row", flexWrap: "wrap" },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
    chipActive: { backgroundColor: c.textBright },
    chipIdle: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.glassStrokeStrong },
    chipText: { fontFamily: AU_FONT.body, fontSize: 12.5, color: c.textDim, letterSpacing: -0.06 },
    chipTextActive: { fontFamily: AU_FONT.bodyBold, color: c.backgroundDeep },
  });
