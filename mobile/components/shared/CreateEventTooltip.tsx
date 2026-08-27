/**
 * One-off coachmark pointing at the create-event FAB.
 *
 * The FAB is a bare "+" circle with no label, so nothing tells a new user that
 * it is how events get made. This says so, briefly, on the first few visits to
 * home and then never again — a hint that keeps reappearing stops being a hint
 * and becomes noise for the people who already learned it.
 *
 * Uses the RN Animated API rather than Reanimated: Reanimated is installed but
 * used in only two files here, while every other animation in the app is
 * Animated — matching the local convention keeps this readable.
 */

import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, Animated, Easing, Platform, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "@/contexts/ThemeContext";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";

const SEEN_KEY = "createEventTooltipShown";
const MAX_SHOWS = 3;
const HOLD_MS = 5000;

export default function CreateEventTooltip() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      // A read failure should cost the user a hint, never a crash on home.
      let shows = 0;
      try {
        shows = parseInt((await AsyncStorage.getItem(SEEN_KEY)) ?? "0", 10) || 0;
      } catch {
        return;
      }
      if (cancelled || shows >= MAX_SHOWS) return;

      setVisible(true);
      AsyncStorage.setItem(SEEN_KEY, String(shows + 1)).catch(() => {});

      Animated.timing(anim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();

      timer = setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 420,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(({ finished }) => {
          // Unmount rather than leaving a transparent view over the FAB.
          if (finished && !cancelled) setVisible(false);
        });
      }, HOLD_MS);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [anim]);

  if (!visible) return null;

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
