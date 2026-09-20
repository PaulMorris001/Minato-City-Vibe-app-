import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import GlassBackButton from "@/components/shared/GlassBackButton";
import ImagePickerButton from "@/components/shared/ImagePickerButton";
import InfoTip from "@/components/shared/InfoTip";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { useCreateEvent } from "@/contexts/CreateEventContext";

/**
 * Required for a paid in-person event, just off the basics screen. Still
 * enforced at submit (see create-event/index.tsx) — this screen only hosts the
 * upload; "Create Event" is what routes an organizer here if they skipped it.
 */
export default function CreateEventVenueProofScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { draft, update } = useCreateEvent();

  return (
    <LinearGradient
      colors={isDark ? ["#1A0F35", colors.backgroundDeep] : [colors.background, colors.backgroundDeep]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Venue proof</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <InfoTip label="VENUE PROOF *" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
            Only our review team sees this — it's never shown to guests or on your
            event page. It's how we confirm a paid event has a real venue behind it
            before anyone is charged.
          </InfoTip>
          <Text style={styles.hint}>
            Upload a photo of your venue booking — confirmation email, signed
            contract, or reservation screenshot. Admins review this before your
            event goes on sale.
          </Text>
          <ImagePickerButton
            imageUri={draft.venueProofImage}
            onImageSelected={(uri) => update("venueProofImage", uri)}
            label="Booking / Contract"
            size={120}
            shape="square"
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    backButton: {},
    headerTitle: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 20,
      color: c.textBright,
      letterSpacing: -0.5,
    },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
    infoTip: { marginBottom: 8 },
    infoTipLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    hint: {
      color: c.textDim,
      fontSize: 12,
      marginBottom: 16,
      lineHeight: 16,
    },
  });
