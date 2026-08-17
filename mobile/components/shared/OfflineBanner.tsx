import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/**
 * A persistent "you're offline" strip, mounted once at the root.
 *
 * Sits above the app rather than inside any screen so the user gets the same
 * answer everywhere, and so screens showing cached content don't each have to
 * explain themselves. `pointerEvents="none"` keeps it from eating taps on
 * whatever is underneath.
 */
export default function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  if (online) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
      <Text style={styles.text}>You&apos;re offline — showing saved content</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingBottom: 7,
      paddingHorizontal: 16,
      backgroundColor: c.error,
    },
    text: {
      fontFamily: Fonts.semiBold,
      fontSize: 12.5,
      color: "#fff",
    },
  });
