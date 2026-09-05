/**
 * Coachmark pointing at the create-event FAB.
 *
 * The FAB is a bare "+" circle with no label, so nothing tells a user that it
 * is how events get made. By product decision it shows on EVERY visit to home.
 * It hides while the home feed is scrolled down and animates back in when the
 * user returns to the top (`hidden` prop, driven by the home ScrollView);
 * otherwise it sits above the FAB permanently. It previously stopped after
 * three views and also faded itself out after five seconds, which meant anyone
 * who hadn't connected the "+" to event creation in that window never got told
 * again.
 *
 * pointerEvents="none" is what makes staying on screen safe — see the render.
 *
 * Uses the RN Animated API rather than Reanimated: Reanimated is installed but
 * used in only two files here, while every other animation in the app is
 * Animated — matching the local convention keeps this readable.
 */

import React, { useEffect, useRef } from "react";
import { Text, StyleSheet, Animated, Easing, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "@/contexts/ThemeContext";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";

export default function CreateEventTooltip({ hidden = false }: { hidden?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  // Fades/slides in at the top of the feed, out once scrolled away.
  useEffect(() => {
    Animated.timing(anim, {
      toValue: hidden ? 0 : 1,
      duration: hidden ? 160 : 260,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [anim, hidden]);

  return (
    <Animated.View
      // Never intercept a tap meant for the FAB underneath.
      pointerEvents="none"
      style={[
        styles.wrap,
        // Mirrors the FAB's own inset maths: on iOS the screen runs under the
        // floating tab bar, so both lift above it together.
        Platform.OS === "ios" && { bottom: insets.bottom + 132 },
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.bubble}>
        <Text style={styles.text}>Tap to create an event</Text>
      </View>
      <View style={styles.caret} />
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      // Sits directly above the 60pt FAB, right-aligned to its centre line.
      bottom: 88,
      right: 24,
      alignItems: "flex-end",
    },
    bubble: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    text: {
      fontFamily: Fonts.bold,
      fontSize: 13,
      color: c.textBright,
    },
    // Rotated square rather than a border triangle so it can carry the same
    // fill and border as the bubble on both themes.
    caret: {
      width: 12,
      height: 12,
      marginTop: -6,
      marginRight: 18,
      backgroundColor: c.card,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border,
      transform: [{ rotate: "45deg" }],
    },
  });
