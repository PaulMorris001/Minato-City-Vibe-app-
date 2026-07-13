import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

type BadgeType = "success" | "warning" | "danger" | "info" | "default";

interface StatusBadgeProps {
  label: string;
  type?: BadgeType;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconSize?: number;
  style?: ViewStyle;
}

const BADGE_COLORS: Record<BadgeType, { bg: string; text: string; border: string }> = {
  success: {
    bg: "rgba(34, 197, 94, 0.1)",
    text: "#22c55e",
    border: "#22c55e",
  },
  warning: {
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#f59e0b",
    border: "#f59e0b",
  },
  danger: {
    bg: "rgba(239, 68, 68, 0.1)",
    text: "#ef4444",
    border: "#ef4444",
  },
  info: {
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#3b82f6",
    border: "#3b82f6",
  },
  default: {
    bg: "rgba(156, 163, 175, 0.1)",
    text: "#9ca3af",
    border: "#9ca3af",
  },
};

export default function StatusBadge({
  label,
  type = "default",
  icon,
  iconSize = 12,
  style,
}: StatusBadgeProps) {
  const badgeColors = BADGE_COLORS[type];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: badgeColors.bg,
          borderColor: badgeColors.border,
        },
        style,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={iconSize}
          color={badgeColors.text}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, { color: badgeColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
});
