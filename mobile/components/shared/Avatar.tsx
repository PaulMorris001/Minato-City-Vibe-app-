import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { initialsOf } from "@/utils/eventDetails";

/**
 * Deterministic accent palette for default avatars. The same username always
 * hashes to the same color, so a given user has a stable avatar across
 * screens and sessions.
 */
const PALETTE = [
  "#A855F7",
  "#7C3AED",
  "#EC4899",
  "#F59E0B",
  "#22D3EE",
  "#0EA5E9",
  "#10B981",
  "#F472B6",
];

function bgColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export interface AvatarProps {
  /** URL of the user's profile picture. When falsy, initials are rendered. */
  uri?: string | null;
  /** Display name used to derive initials and the fallback color. */
  name?: string | null;
  /** Diameter in px. */
  size?: number;
  /** Override the deterministic fallback background. */
  bgColor?: string;
  /** Override the initials text color (defaults to white). */
  textColor?: string;
  style?: ViewStyle;
}

export function Avatar({
  uri,
  name,
  size = 40,
  bgColor,
  textColor = "#fff",
  style,
}: AvatarProps) {
  const radius = size / 2;
  const wrapStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden",
  };

  if (uri) {
    return (
      <View style={[wrapStyle, style]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
        />
      </View>
    );
  }

  const initials = initialsOf(name);
  const fallback = bgColor ?? bgColorFor(name?.trim() || "?");
  const fontSize = Math.max(10, Math.round(size * 0.42));

  return (
    <View style={[wrapStyle, styles.fallback, { backgroundColor: fallback }, style]}>
      <Text
        style={[
          styles.initials,
          { color: textColor, fontSize, lineHeight: fontSize * 1.05 },
        ]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: "Outfit_700Bold",
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlign: "center",
  },
});
