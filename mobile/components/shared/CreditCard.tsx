import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney } from "@/constants/payments";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const { width: SCREEN_W } = Dimensions.get("window");
// Matches wallet-rewards.tsx's 16px side padding on the scroll content.
const CARD_WIDTH = SCREEN_W - 32;
const CARD_HEIGHT = CARD_WIDTH * 0.56;

interface CreditCardProps {
  amount: number;
  currency: "NGN" | "USD";
  /** Stagger the entrance when a second card sits below this one. */
  entranceDelay?: number;
  /** The vendor this balance is locked to, if any — shown like a card's
   *  merchant restriction. Omit for credit spendable at any vendor. */
  vendorName?: string;
}

/**
 * The OurCityVibe credit balance, styled like a bank card — a fintech-app
 * convention (Apple Card, Cash App) for "this is real money, not just a
 * number in a list". Purely decorative: a real card can't be swiped or
 * tapped for detail, it's the same balance shown on Settings before this.
 */
export default function CreditCard({ amount, currency, entranceDelay = 0, vendorName }: CreditCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const entrance = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 480,
      delay: entranceDelay,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    // A single light sweep every ~5s — a subtle "this is alive" cue rather
    // than a constant animation that would compete with the balance text.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200 + entranceDelay),
        Animated.timing(shine, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_WIDTH, CARD_WIDTH],
  });

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      <LinearGradient
        colors={[colors.primaryDark, colors.primary, colors.accentPink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.circleLarge} />
        <View style={styles.circleSmall} />

        <Animated.View pointerEvents="none" style={[styles.shineWrap, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.topRow}>
          <Text style={styles.brand}>OurCityVibe</Text>
          <Ionicons
            name="wifi"
            size={20}
            color="rgba(255,255,255,0.85)"
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </View>

        <View style={styles.chip} />

        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(amount, currency)}
        </Text>

        {!!vendorName && (
          <Text style={styles.vendorLock} numberOfLines={1}>
            Redeemable at {vendorName}
          </Text>
        )}

        <View style={styles.bottomRow}>
          <Text style={styles.bottomLabel}>OURCITYVIBE CREDIT</Text>
          <Text style={styles.bottomLabel}>{currency}</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: 20,
      padding: 20,
      justifyContent: "space-between",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    circleLarge: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: "rgba(255,255,255,0.06)",
      top: -80,
      right: -60,
    },
    circleSmall: {
      position: "absolute",
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "rgba(255,255,255,0.05)",
      bottom: -40,
      left: -30,
    },
    shineWrap: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: CARD_WIDTH * 0.5,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 17,
      color: "#fff",
      letterSpacing: 0.2,
    },
    chip: {
      width: 40,
      height: 30,
      borderRadius: 6,
      backgroundColor: "rgba(255,255,255,0.35)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.5)",
    },
    amount: {
      fontFamily: "Outfit_700Bold",
      fontSize: 32,
      color: "#fff",
      letterSpacing: 0.5,
    },
    vendorLock: {
      fontFamily: "Outfit_500Medium",
      fontSize: 12,
      color: "rgba(255,255,255,0.8)",
      marginTop: -6,
    },
    bottomRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    bottomLabel: {
      fontFamily: "Outfit_600SemiBold",
      fontSize: 11,
      color: "rgba(255,255,255,0.75)",
      letterSpacing: 1,
    },
  });
