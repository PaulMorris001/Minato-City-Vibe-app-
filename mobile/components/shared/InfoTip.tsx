/**
 * A label with an ⓘ button that reveals an inline explanation.
 *
 * Long-form guidance was making the create-event form scroll forever, and
 * cutting it left people guessing what "Public", "Venue Proof" or per-tier
 * quantities actually meant. Tucking the explanation behind a tap keeps the
 * form short for people who already know, and answers the question in place for
 * people who don't.
 *
 * Distinct from CreateEventTooltip, which is a one-off coachmark that points at
 * the home FAB and shows itself on a timer.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface InfoTipProps {
  /** The field label this explains. Rendered with the ⓘ affordance beside it. */
  label: string;
  /** What the field means and how to decide. Shown when the ⓘ is tapped. */
  children: string;
  /** Match the surrounding label styling when the host form has its own. */
  labelStyle?: StyleProp<TextStyle>;
  /** Outer spacing, so the tip lines up with the form it sits in. */
  style?: StyleProp<ViewStyle>;
}

export default function InfoTip({ label, children, labelStyle, style }: InfoTipProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  return (
    <View style={style}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label} — what's this?`}
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.label, labelStyle]}>{label}</Text>
        <Ionicons
          name={open ? "information-circle" : "information-circle-outline"}
          size={16}
          color={open ? colors.primary : colors.textDim}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.panel}>
          <Text style={styles.panelText}>{children}</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 6 },
    label: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: c.textBright,
    },
    panel: {
      marginTop: 6,
      padding: 11,
      borderRadius: 11,
      backgroundColor: c.glassFillSubtle,
      borderWidth: 1,
      borderColor: c.glassStroke,
    },
    panelText: {
      fontFamily: Fonts.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: c.textDim,
    },
  });
