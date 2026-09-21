import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import AdditionalLocationsEditor from "@/components/shared/AdditionalLocationsEditor";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { useCreateEvent } from "@/contexts/CreateEventContext";

/**
 * Other venues this event runs at in parallel — the "same event, several
 * places" feature. Mutually exclusive with the sub-events programme; the hub
 * screen won't navigate here while a programme exists (see create-event/index.tsx),
 * but this screen defensively shows the same notice inline rather than
 * silently rendering an editor whose save would be rejected server-side.
 */
export default function CreateEventLocationsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { draft, update } = useCreateEvent();

  const blocked = draft.subEvents.length > 0;

  return (
    <LinearGradient
      colors={isDark ? ["#1A0F35", colors.backgroundDeep] : [colors.background, colors.backgroundDeep]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Other locations</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {blocked ? (
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={17} color={colors.textDim} />
              <Text style={styles.noticeText}>
                Remove your sub-events to add other locations instead — an event can
                have one or the other.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.hint}>
                Running the same event in more than one place at once — a watch party
                in New York and London, say. One ticket covers every venue; attendees pick
                which one they're going to.
              </Text>
              <AdditionalLocationsEditor
                value={draft.extraVenues}
                onChange={(extraVenues) => update("extraVenues", extraVenues)}
              />
            </>
          )}
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
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.glassFillSubtle,
    },
    noticeText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      lineHeight: 19,
    },
  });
