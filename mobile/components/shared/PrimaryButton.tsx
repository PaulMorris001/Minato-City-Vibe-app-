import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface PrimaryButtonProps {
  onPress: () => void;
  children: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconPosition?: "left" | "right";
  iconSize?: number;
  gradient?: readonly [string, string];
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  testID?: string;
}

export default function PrimaryButton({
  onPress,
  children,
  loading = false,
  disabled = false,
  icon,
  iconPosition = "right",
  iconSize = 20,
  gradient = ["#a855f7", "#7c3aed"] as const,
  style,
  textStyle,
  fullWidth = true,
  testID,
}: PrimaryButtonProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[
        styles.buttonContainer,
        !fullWidth && styles.buttonNotFullWidth,
        (loading || disabled) && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.8}
      testID={testID}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            {icon && iconPosition === "left" && (
              <Ionicons
                name={icon}
                size={iconSize}
                color="#fff"
                style={styles.iconLeft}
              />
            )}
            <Text style={[styles.text, textStyle]}>{children}</Text>
            {icon && iconPosition === "right" && (
              <Ionicons
                name={icon}
                size={iconSize}
                color="#fff"
                style={styles.iconRight}
              />
            )}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  buttonContainer: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonNotFullWidth: {
    alignSelf: "flex-start",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  text: {
    color: c.text,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  iconLeft: {
    marginRight: 4,
  },
  iconRight: {
    marginLeft: 4,
  },
});
