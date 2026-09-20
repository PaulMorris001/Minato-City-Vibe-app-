import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import GlassBackButton from "@/components/shared/GlassBackButton";
import TicketTiersEditor from "@/components/shared/TicketTiersEditor";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { useCreateEvent } from "@/contexts/CreateEventContext";

/**
 * Named ticket tiers, off on their own screen — see app/create-event/_layout.tsx
 * for why. The draft already holds every keystroke, so "back" is the only exit
 * this screen needs; there's nothing to save.
 */
export default function CreateEventTiersScreen() {
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
          <Text style={styles.headerTitle}>Ticket tiers</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>
            Name each tier whatever you like — Basic, Premium, VIP, Table for 6 — set
            its price, and (optionally) how many of that tier are available. Buyers
            pick a tier at checkout.
          </Text>
          <TicketTiersEditor
            value={draft.tiers}
            onChange={(tiers) => update("tiers", tiers)}
            currency={draft.sellerCurrency}
            seedPrice={draft.ticketPrice}
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
    hint: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textDim,
      lineHeight: 18,
      marginBottom: 16,
    },
  });
