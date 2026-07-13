import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import { LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";
import LocationPicker from "./LocationPicker";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface LocationFilterBarProps {
  value: LocationSelection | null;
  onChange: (sel: LocationSelection) => void;
  onClear: () => void;
}

/**
 * Compact location filter for browse screens. Collapsed it shows the active
 * filter as a chip; expanded it reveals the cascading Country/State/City
 * picker. Clearing remounts the picker so its internal state resets.
 */
export default function LocationFilterBar({ value, onChange, onClear }: LocationFilterBarProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const hasFilter = !!(value && (value.city || value.state || value.country));
  const label = hasFilter ? formatLocation(value!) : "All locations";

  const handleClear = () => {
    setResetKey((k) => k + 1);
    onClear();
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.chip} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
          <Ionicons name="location" size={16} color={Colors.primary} />
          <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {hasFilter && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.7}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <View style={styles.panel}>
          <LocationPicker
            key={resetKey}
            value={value ?? undefined}
            onChange={onChange}
            label=""
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.backgroundSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chipText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: c.text,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.primary,
  },
  panel: {
    marginTop: 12,
  },
});
