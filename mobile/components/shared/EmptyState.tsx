import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/**
 * The standard "nothing here" block — icon, title, optional subtitle and CTA.
 * Every list screen was re-implementing this shape inline.
 */
export default function EmptyState({
  icon = "search-outline",
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity style={styles.action} activeOpacity={0.85} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
    title: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: c.text,
      marginTop: 4,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    action: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
    },
    actionText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.primary },
  });
