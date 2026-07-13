import React from "react";
import { View, ViewProps, ViewStyle } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Glassy info card used for stats, about, host, attendees, etc.
 * Dark: rgba(26,16,48,0.75) wash + hairline — reads as glass against the
 * dark hero. Light: solid white card on the lavender surface. Both come from
 * the cardGlass token so the vendor "bill" cards can match.
 *
 * We don't apply backdrop blur because RN's BlurView under a translucent
 * background on dark performs worse than the equivalent flat fill on most
 * devices.
 *
 * Deliberately NOT upgraded to expo-glass-effect's GlassView on iOS 26: the
 * event screen stacks 20+ of these in one scroll view, and that many live
 * glass-effect views is the same perf trap as the BlurView above. Real
 * Liquid Glass in this app is reserved for the control layer (tab bar,
 * navbar pills, profile modal).
 */
export function GlassCard({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  const card: ViewStyle = {
    backgroundColor: colors.cardGlass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    padding: 14,
  };
  return (
    <View style={[card, style]} {...rest}>
      {children}
    </View>
  );
}

/**
 * Micro-label used at the top of every glass card:
 * Inter 10/700, uppercase, letter-spacing 0.1em, color textMute.
 */
export const microLabelStyle: ViewStyle = {};
