import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/contexts/ThemeContext";
import {
  openStoreReview,
  settleRatingPrompt,
  shouldPromptForRating,
  snoozeRatingPrompt,
} from "@/utils/appRating";

/**
 * Asks for an App Store / Play Store rating, once the user has actually had a
 * few good runs (see utils/appRating.ts for the gate — this component only
 * renders what the gate allows).
 *
 * Mounted on the home tab rather than fired from a success screen: the stores'
 * own review sheet is a modal on top of a modal if it lands mid-checkout, and
 * an interrupted purchase costs far more than a delayed ask.
 */
export default function RateAppPrompt({ enabled = true }: { enabled?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The host holds this false until any higher-priority launch modal (the
    // raffle announcement) has resolved, so the two never stack. A rating ask
    // is the one that can wait — it has a 60-day snooze either way.
    if (!enabled) return;
    let cancelled = false;
    shouldPromptForRating().then((ok) => {
      if (ok && !cancelled) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const rate = () => {
    setVisible(false);
    // Settled before the sheet opens: iOS never reports whether a review was
    // left, and asking a second time after they've been to the store is the
    // nag this gate exists to prevent.
    settleRatingPrompt();
    openStoreReview();
  };

  const notNow = () => {
    setVisible(false);
    snoozeRatingPrompt();
  };

  const never = () => {
    setVisible(false);
    settleRatingPrompt();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={notNow}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.starWrap}>
            <Ionicons name="star" size={34} color="#f59e0b" />
          </View>
          <Text style={styles.title}>Enjoying OurCityvibe?</Text>
          <Text style={styles.subtitle}>
            A quick rating helps other people in your city find events worth going to.
            It takes a few seconds.
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={rate}>
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>Rate the app</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} activeOpacity={0.7} onPress={notNow}>
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} activeOpacity={0.7} onPress={never}>
            <Text style={styles.neverText}>Don't ask again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 24,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    starWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(245,158,11,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    title: { fontFamily: Fonts.bold, fontSize: 22, color: c.text, marginBottom: 8 },
    subtitle: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 20,
    },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      alignSelf: "stretch",
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 14,
      marginBottom: 6,
    },
    primaryButtonText: { fontFamily: Fonts.semiBold, fontSize: 14, color: "#fff" },
    dismissButton: { paddingVertical: 8 },
    dismissText: { fontFamily: Fonts.medium, fontSize: 13, color: c.textMuted },
    neverText: { fontFamily: Fonts.regular, fontSize: 12, color: c.textFaint },
  });
