import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AU } from "@/components/auth/tokens";
import { Fonts } from "@/constants/fonts";

interface GuestGateProps {
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Full-screen "you're browsing as a guest" prompt for tabs that need an
 * account (Profile, My Events). Routes to login / sign-up and offers the
 * public features tour.
 */
export default function GuestGate({
  title = "You're browsing as a guest",
  subtitle = "Log in or create an account to build your profile, host events, RSVP, buy passes, and chat.",
  icon = "person-circle-outline",
}: GuestGateProps) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.wrap}>
          <View style={styles.icon}>
            <Ionicons name={icon} size={64} color={AU.purpleSoft} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/login")}
            style={styles.btnWrap}
          >
            <LinearGradient
              colors={[AU.purple, AU.purpleDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>Log in or sign up</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: "/onboarding", params: { from: "features" } } as any)
            }
            activeOpacity={0.7}
            style={{ marginTop: 16 }}
          >
            <Text style={styles.link}>See app features</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  icon: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(168,85,247,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 24,
    color: AU.text,
    textAlign: "center",
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: AU.textDim,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
  },
  btnWrap: { width: "100%" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  btnText: { fontFamily: Fonts.bold, fontSize: 15, color: "#fff" },
  link: { fontFamily: Fonts.bold, fontSize: 13.5, color: AU.purpleSoft },
});
