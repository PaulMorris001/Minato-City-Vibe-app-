/**
 * Floating "Need help?" pill that opens the official support chat.
 *
 * Support used to be reachable only from inside the Messages inbox and from
 * Settings — both places you have to already know to look. This puts it on the
 * home screen with a visible label, the way OPay and similar apps do: a moving
 * help sign reads as "someone is there", where a static icon reads as decoration.
 *
 * Positioned bottom-LEFT because the create-event FAB owns bottom-right, and it
 * borrows that FAB's inset maths so it clears the iOS floating tab bar too.
 *
 * Uses the RN Animated API rather than Reanimated: Reanimated is installed but
 * used in only two files here, while every other animation in the app is
 * Animated — matching the local convention keeps this readable.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { openSupportChat } from "@/utils/userNavigation";
import { ensureAuth } from "@/utils/requireAuth";

export interface SupportFabProps {
  /** Text in the pill. Kept short — it sits beside the create FAB. */
  label?: string;
  /** Hide entirely (e.g. for the support account itself). */
  hidden?: boolean;
}

export default function SupportFab({ label = "Need help?", hidden = false }: SupportFabProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);

  // Expanding halo behind the icon — the "moving help sign". Same loop shape as
  // AuthPrimitives' LiveDot: one timing pass, scaled and faded out, repeated.
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (hidden) return;
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    animation.start();
    // Stop on unmount, or the loop keeps running against a dead component.
    return () => animation.stop();
  }, [pulse, hidden]);

  if (hidden) return null;

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  const springTo = (value: number) =>
    Animated.spring(press, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  const handlePress = async () => {
    if (opening) return;
    // Guests can browse but not message. Use the same prompt every other gated
    // action uses rather than letting the request 401 into a generic error.
    if (!(await ensureAuth("chat with support"))) return;
    setOpening(true);
    try {
      await openSupportChat();
    } finally {
      setOpening(false);
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        // Mirrors the create FAB: on iOS the screen runs under the floating tab
        // bar, so lift above it; on Android the JS bar still takes layout space.
        Platform.OS === "ios" && { bottom: insets.bottom + 60 },
        { transform: [{ scale: press }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={() => springTo(0.94)}
        onPressOut={() => springTo(1)}
        accessibilityRole="button"
        accessibilityLabel="Chat with support"
        accessibilityHint="Opens a conversation with the OurCityvibe support team"
        disabled={opening}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pill}
        >
          <View style={styles.iconWrap}>
            <Animated.View
              // Decorative only — the label carries the meaning.
              pointerEvents="none"
              style={[
                styles.halo,
                { transform: [{ scale: haloScale }], opacity: haloOpacity },
              ]}
            />
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 16,
    left: 20,
    borderRadius: 26,
    // Shadow lives on the wrapper: the gradient child clips its own overflow.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 16,
    height: 48,
    borderRadius: 26,
    overflow: "hidden",
  },
  iconWrap: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  halo: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
