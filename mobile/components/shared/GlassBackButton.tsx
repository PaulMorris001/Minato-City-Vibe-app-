import React from "react";
import {
  Platform,
  StyleProp,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/contexts/ThemeContext";
import { goBack } from "@/utils/navigation";

const hasLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

export interface GlassIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  /**
   * Pin the glyph color instead of following the theme. Use "#fff" when the
   * pill floats over a photo hero or a pinned-dark poster screen, where the
   * backdrop stays dark in both schemes.
   */
  iconColor?: string;
  /**
   * The pill floats over a photo/video (hero images, image viewers): pins the
   * glyph white and swaps the themed fallback fill for a dark scrim so the
   * button stays legible over any media in both schemes. Liquid Glass adapts
   * to the media natively, so on iOS 26 this only pins the glyph.
   */
  overMedia?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Round icon pill for the navigation layer (back buttons, top-chrome
 * actions). Real Liquid Glass on iOS 26+; elsewhere (Android, older iOS) a
 * themed translucent fill using the app's glass tokens — either way the pill
 * and its glyph adapt to the active color scheme.
 */
export function GlassIconButton({
  icon,
  onPress,
  size = 40,
  iconColor,
  overMedia,
  style,
  accessibilityLabel,
}: GlassIconButtonProps) {
  const { colors } = useTheme();

  const round: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  const glyph = (
    <Ionicons
      name={icon}
      size={Math.round(size * 0.55)}
      color={iconColor ?? (overMedia ? "#fff" : colors.text)}
    />
  );

  if (hasLiquidGlass) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <GlassView style={round} isInteractive>
          {glyph}
        </GlassView>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        round,
        overMedia
          ? { backgroundColor: "rgba(0, 0, 0, 0.4)" }
          : {
              backgroundColor: colors.glassFill,
              borderWidth: 1,
              borderColor: colors.glassStroke,
            },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {glyph}
    </TouchableOpacity>
  );
}

export interface GlassBackButtonProps
  extends Omit<GlassIconButtonProps, "icon"> {
  /** Route used when there's no back stack (deep links, cold starts). */
  fallbackRoute?: string;
}

/**
 * The app-wide back button: a Liquid Glass pill with the native chevron.
 * Defaults to goBack() so dead-end back stacks land on home.
 */
export default function GlassBackButton({
  onPress,
  fallbackRoute,
  ...rest
}: GlassBackButtonProps) {
  return (
    <GlassIconButton
      icon="chevron-back"
      onPress={onPress ?? (() => goBack(fallbackRoute))}
      accessibilityLabel="Go back"
      {...rest}
    />
  );
}
