import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AU, POSTERS } from "./tokens";

const POSTER_W = 110;
const POSTER_H = 130;
const GAP = 12;
const ROW = [...POSTERS, ...POSTERS, ...POSTERS];
const ROW_WIDTH = ROW.length * (POSTER_W + GAP);
const LOOP_DISTANCE = ROW_WIDTH / 3;

function Poster({ p }: { p: (typeof POSTERS)[number] }) {
  return (
    <LinearGradient
      colors={p.colors as unknown as readonly [string, string, ...string[]]}
      locations={p.locations as unknown as readonly [number, number, ...number[]]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.poster}
    >
      <Text style={styles.posterEmoji}>{p.emoji}</Text>
      <Text style={styles.posterTitle}>{p.title}</Text>
      <Text style={styles.posterSub}>{p.sub}</Text>
    </LinearGradient>
  );
}

function MarqueeRow({
  duration,
  reverse,
  style,
}: {
  duration: number;
  reverse?: boolean;
  style?: any;
}) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [duration, x]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-LOOP_DISTANCE, 0] : [0, -LOOP_DISTANCE],
  });

  return (
    <View style={[styles.marqueeWrap, style]} pointerEvents="none">
      <Animated.View style={[styles.marqueeRow, { transform: [{ translateX }] }]}>
        {ROW.map((p, i) => (
          <Poster key={i} p={p} />
        ))}
      </Animated.View>
    </View>
  );
}

export function PosterBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Aurora wash */}
      <LinearGradient
        colors={["#A855F7", "#EC4899", "#7C3AED", "#A855F7"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.aurora}
      />

      {/* Two scrolling rows */}
      <MarqueeRow duration={40000} style={{ top: 78, opacity: 0.85 }} />
      <MarqueeRow
        duration={56000}
        reverse
        style={{ top: 220, opacity: 0.7, marginLeft: -60 }}
      />

      {/* Bottom-to-top fade mask */}
      <LinearGradient
        colors={[
          "rgba(11,6,19,0.15)",
          "rgba(11,6,19,0.55)",
          "rgba(11,6,19,0.95)",
          AU.bg,
        ]}
        locations={[0, 0.3, 0.48, 0.62]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  aurora: {
    position: "absolute",
    top: -80,
    alignSelf: "center",
    width: 520,
    height: 520,
    borderRadius: 260,
    opacity: 0.35,
  },
  marqueeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: POSTER_H,
    overflow: "hidden",
  },
  marqueeRow: {
    flexDirection: "row",
    width: ROW_WIDTH,
  },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 14,
    padding: 10,
    marginRight: GAP,
    borderWidth: 1,
    borderColor: AU.strokeHi,
    overflow: "hidden",
  },
  posterEmoji: {
    position: "absolute",
    right: -8,
    bottom: -16,
    fontSize: 80,
    opacity: 0.35,
    transform: [{ rotate: "-8deg" }],
  },
  posterTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    letterSpacing: -0.3,
  },
  posterSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    marginTop: 3,
    fontFamily: "Outfit_500Medium",
  },
});
