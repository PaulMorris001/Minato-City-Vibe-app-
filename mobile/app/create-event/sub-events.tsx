import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import GlassBackButton from "@/components/shared/GlassBackButton";
import SubEventsEditor from "@/components/shared/SubEventsEditor";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { useCreateEvent } from "@/contexts/CreateEventContext";

/**
 * The programme of an event — different activities under one invitation.
 * Mutually exclusive with other locations; SubEventsEditor's own
 * `disabledReason` prop already covers showing that, since it existed before
 * this screen did (see AdditionalLocationsEditor's screen for the mirror).
 */
export default function CreateEventSubEventsScreen() {
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
          <Text style={styles.headerTitle}>Programme</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SubEventsEditor
            value={draft.subEvents}
            onChange={(subEvents) => update("subEvents", subEvents)}
            currency={draft.sellerCurrency}
            eventStart={draft.date}
            eventEnd={draft.endDate || undefined}
            disabledReason={
              !draft.date
                ? "Set your event's start date on the previous screen first — every stop has to fall inside it."
                : draft.extraVenues.length
                  ? "Remove the extra locations to add a programme of sub-events instead — an event can have one or the other."
                  : null
            }
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
  });
