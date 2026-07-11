import React from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { AU } from "@/components/auth/tokens";

/**
 * Glassy info card used for stats, about, host, attendees, etc.
 * Background: rgba(26,16,48,0.75); 1px hairline; radius 16; padding 14.
 * We don't apply backdrop blur because RN's BlurView under a translucent
 * background on dark performs worse than the equivalent flat fill on most
 * devices; the result reads as glass against the dark hero.
 *
 * Deliberately NOT upgraded to expo-glass-effect's GlassView on iOS 26: the
 * event screen stacks 20+ of these in one scroll view, and that many live
 * glass-effect views is the same perf trap as the BlurView above. Real
 * Liquid Glass in this app is reserved for the control layer (tab bar,
 * navbar pills, profile modal).
 */
export function GlassCard({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

/**
 * Micro-label used at the top of every glass card:
 * Inter 10/700, uppercase, letter-spacing 0.1em, color textMute.
 */
export const microLabelStyle: ViewStyle = {};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(26,16,48,0.75)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AU.stroke,
    padding: 14,
  },
});
