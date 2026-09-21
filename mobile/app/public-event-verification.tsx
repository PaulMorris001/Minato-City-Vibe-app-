import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Fonts } from "@/constants/fonts";
import { PrimaryButton } from "@/components/shared";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const PREVIEW_STEPS: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
  { icon: "mail-outline", label: "Verify your email" },
  { icon: "shield-checkmark-outline", label: "Verify your identity" },
  { icon: "cash-outline", label: "Add a payout method" },
];

/**
 * Reached instead of Settings when an unverified user tries to switch an
 * event to Public in CreateEventModal (see the "Get Verified" prompt there).
 * A landing page rather than dropping straight into the wizard — "Get
 * Started" hands off to public-event-verification-steps.tsx, which walks
 * email → identity → payout one at a time.
 */
export default function PublicEventVerificationScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
      </View>

      <View style={styles.content}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBadge}
        >
          <Ionicons name="globe-outline" size={40} color="#fff" />
        </LinearGradient>

        <Text style={styles.title}>Unlock public events</Text>
        <Text style={styles.subtitle}>
          Public events reach everyone browsing your city and can sell tickets — so we ask every
          host to verify a few things first. It only takes a few minutes.
        </Text>

        <View style={styles.previewList}>
          {PREVIEW_STEPS.map((item, i) => (
            <View key={item.label} style={styles.previewRow}>
              <View style={styles.previewIndex}>
                <Text style={styles.previewIndexText}>{i + 1}</Text>
              </View>
              <Ionicons name={item.icon} size={18} color={colors.primary} />
              <Text style={styles.previewLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          onPress={() => router.push("/public-event-verification-steps" as any)}
          icon="arrow-forward"
        >
          Get Started
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: 20, paddingVertical: 16 },
    backButton: {},
    content: { flex: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center", gap: 16 },
    heroBadge: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 10,
      marginBottom: 4,
    },
    title: { fontSize: 24, fontFamily: Fonts.bold, color: c.text, textAlign: "center" },
    subtitle: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 21,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    previewList: {
      width: "100%",
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 6,
      marginTop: 12,
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    previewIndex: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.primaryFaded,
      alignItems: "center",
      justifyContent: "center",
    },
    previewIndexText: { fontSize: 11, fontFamily: Fonts.bold, color: c.primary },
    previewLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: c.text },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  });
