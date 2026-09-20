import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface VerifiedBadgePopupProps {
  /** Opens the create-event flow — home.tsx's own `openCreateEvent` (handles
   *  the auth check before showing CreateEventModal). */
  onCreateEvent: () => void;
}

/**
 * One-time "You're verified!" popup, shown the next time the app opens after
 * an admin approves identity verification (verification.service.js's
 * markVerified already fires a bell notification + push — this is the
 * celebratory follow-up on top of that, mirroring RaffleWinnerPopup's
 * approach). There's no server-side "seen" flag for this, same as the raffle
 * popup — tracked in AsyncStorage per user so switching accounts on one
 * device can't cross-show or suppress it.
 */
export default function VerifiedBadgePopup({ onCreateEvent }: VerifiedBadgePopupProps) {
  const styles = useThemedStyles(createStyles);
  const [seenKey, setSeenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userJson = await SecureStore.getItemAsync("user");
        const userId = userJson ? JSON.parse(userJson)?._id : null;
        if (!userId) return;
        const key = `verified_badge_seen_${userId}`;

        const [seen, token] = await Promise.all([
          AsyncStorage.getItem(key),
          SecureStore.getItemAsync("token"),
        ]);
        if (cancelled || seen) return;

        const res = await axios.get(`${BASE_URL}/verification/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.data?.status === "approved") setSeenKey(key);
      } catch {
        // Non-critical — the notification bell still carries this news.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (seenKey) AsyncStorage.setItem(seenKey, "1").catch(() => {});
    setSeenKey(null);
  };

  const handleCreateEvent = () => {
    dismiss();
    onCreateEvent();
  };

  return (
    <Modal visible={!!seenKey} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.badgeWrap}>
            <Ionicons name="shield-checkmark" size={36} color="#10b981" />
          </View>
          <Text style={styles.title}>You're Verified!</Text>
          <Text style={styles.subtitle}>
            Congratulations — your account is verified. Create a public event, engage with the
            community and enjoy everything CityVibe has to offer.
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={handleCreateEvent}>
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>Create an event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} activeOpacity={0.7} onPress={dismiss}>
            <Text style={styles.dismissText}>Maybe later</Text>
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
    badgeWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(16,185,129,0.15)",
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
      marginBottom: 10,
    },
    primaryButtonText: { fontFamily: Fonts.semiBold, fontSize: 14, color: "#fff" },
    dismissButton: { paddingVertical: 8 },
    dismissText: { fontFamily: Fonts.medium, fontSize: 13, color: c.textMuted },
  });
