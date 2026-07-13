import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Fonts } from "@/constants/fonts";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface LoadingScreenProps {
  message?: string;
  size?: "small" | "large";
  color?: string;
}

export default function LoadingScreen({
  message,
  size = "large",
  color = "#a855f7",
}: LoadingScreenProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
});
