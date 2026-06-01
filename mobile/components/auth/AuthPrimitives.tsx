import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AU, AU_GRADIENT_CTA } from "./tokens";

/**
 * Wordmark — "CityVibe" in display weight.
 * Note: true gradient-fill text needs masked-view; we approximate with the
 * design's gradient start color (#C084FC), which reads cleanly on dark.
 */
export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <Text
      style={{
        fontFamily: "BricolageGrotesque_800ExtraBold",
        fontSize: size,
        letterSpacing: -size * 0.02,
        color: AU.purpleSoft,
      }}
    >
      CityVibe
    </Text>
  );
}

/**
 * Headline accent — second line of a display headline rendered in the
 * gradient-start color as a stand-in for the linear gradient text fill.
 */
export function GradientAccent({ children, style }: TextProps) {
  return (
    <Text style={[{ color: AU.purpleSoft }, style]}>{children}</Text>
  );
}

/**
 * Round glassy button used for back / close.
 */
export function GlassRoundButton({
  icon,
  onPress,
  disabled,
  size = 38,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        styles.glassRound,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Ionicons name={icon} size={size * 0.42} color={AU.text} />
    </TouchableOpacity>
  );
}

/**
 * Tiny circular progress badge — SVG-free substitute for the design's
 * conic-gradient arc. A dim ring sits behind a small gradient disc that
 * scales with `value`, paired with the STEP N OF M label in the pill.
 */
export function ProgressArc({
  value,
  size = 22,
}: {
  value: number;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const half = size / 2;
  const fillSize = Math.max(6, Math.round((size - 4) * clamped));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: half,
        borderWidth: 2,
        borderColor: AU.strokeHi,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LinearGradient
        colors={[AU.purple, AU.pink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: fillSize,
          height: fillSize,
          borderRadius: fillSize / 2,
        }}
      />
    </View>
  );
}

/**
 * Primary gradient pill button (CTA).
 * `variant`:
 *   - "primary": purple→pink gradient + glow shadow
 *   - "light":   white pill (used for "tap to fill demo" states; we keep
 *                 it available though the production screens always render
 *                 primary or disabled)
 *   - "disabled": muted glass
 */
export function PrimaryCTA({
  label,
  onPress,
  variant = "primary",
  loading,
  style,
  showArrow = true,
  height = 58,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "light" | "disabled";
  loading?: boolean;
  style?: ViewStyle;
  showArrow?: boolean;
  height?: number;
}) {
  const isPrimary = variant === "primary";
  const isLight = variant === "light";
  const disabled = variant === "disabled" || loading;
  const labelColor = isPrimary ? "#fff" : isLight ? AU.bg : AU.textMute;

  const content = (
    <>
      <Text
        style={{
          color: labelColor,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 17,
          letterSpacing: -0.17,
        }}
      >
        {loading ? "…" : label}
      </Text>
      {showArrow && !loading && (
        <Text
          style={{
            marginLeft: 10,
            color: labelColor,
            fontSize: 18,
            fontFamily: "BricolageGrotesque_700Bold",
          }}
        >
          →
        </Text>
      )}
    </>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.ctaWrap,
        { height },
        isPrimary && styles.ctaShadow,
        isLight && styles.ctaShadowLight,
        style,
      ]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={AU_GRADIENT_CTA as unknown as readonly [string, string, ...string[]]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.ctaInner, { height }]}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.ctaInner,
            { height },
            isLight && { backgroundColor: AU.text },
            variant === "disabled" && {
              backgroundColor: "rgba(255,255,255,0.08)",
            },
          ]}
        >
          {content}
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Pulsing pink "live" dot used by the login stat pill.
 */
export function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });

  return (
    <View style={{ width: 7, height: 7 }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: AU.pink,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: AU.pink,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glassRound: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaWrap: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
  },
  ctaInner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  ctaShadow: {
    shadowColor: AU.purple,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  ctaShadowLight: {
    shadowColor: AU.text,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
});
