import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/contexts/ThemeContext";

interface RafflePromoPopupProps {
  /**
   * Reports whether this is on screen — on its verdict at launch, and again
   * when it's dismissed. The host uses it to keep any other launch-time modal
   * from stacking on top of this one.
   */
  onVisibilityChange?: (showing: boolean) => void;
}

/** How long the pitch stays quiet after it has been shown once. */
const REPEAT_DAYS = 3;
const SHOWN_AT_KEY = "raffle_promo_shown_at";

/**
 * Announces an open Birthday Raffle campaign to someone who is not in it yet.
 *
 * Two gates, both deliberate. It goes quiet for REPEAT_DAYS after being shown
 * — stored device-wide rather than per user, the same reasoning as
 * `utils/appRating.ts`: the nag belongs to the phone, so an account switch
 * shouldn't restart it. And it never appears at all for someone who already
 * has a qualifying birthday event, because there is nothing left to pitch them
 * (they have the home banner and their own status screen). On top of both, it
 * is held to once per launch by module scope, so switching tabs back to home
 * inside one session can't re-nag.
 *
 * The copy ties the outcome to RSVP count and nothing else, which is the real
 * mechanic — winners are a merit ranking on verified RSVPs, never a draw. Any
 * rewrite has to keep that link and stay consistent with
 * `app/birthday-raffle/rules.tsx`, the binding text.
 */
let shownThisLaunch = false;

export default function RafflePromoPopup({ onVisibilityChange }: RafflePromoPopupProps) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [campaignName, setCampaignName] = useState<string>("");

  useEffect(() => {
    if (shownThisLaunch) {
      onVisibilityChange?.(false);
      return;
    }
    let cancelled = false;

    (async () => {
      let showing = false;
      try {
        const lastShown = Number(await AsyncStorage.getItem(SHOWN_AT_KEY)) || 0;
        if (Date.now() - lastShown < REPEAT_DAYS * 24 * 60 * 60 * 1000) return;

        // Public and unauthenticated on purpose — a signed-out browser should
        // hear about the raffle too.
        const res = await fetch(`${BASE_URL}/raffle/public`);
        const data = await res.json();
        if (cancelled || !res.ok || !data?.active) return;

        // Already entered means already sold; drop the pitch entirely. Guests
        // have no entry, so this is skipped for them, and a failed check still
        // shows the popup — silence there would mute an open campaign over a
        // dropped request.
        const token = await SecureStore.getItemAsync("token");
        if (token) {
          try {
            const statusRes = await fetch(`${BASE_URL}/raffle/status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const status = await statusRes.json();
            if (statusRes.ok && status.hasQualifyingEvent) return;
          } catch {
            // Falls through to showing it.
          }
        }

        if (cancelled) return;
        setCampaignName(data.campaignName || "");
        setVisible(true);
        shownThisLaunch = true;
        showing = true;
        AsyncStorage.setItem(SHOWN_AT_KEY, String(Date.now())).catch(() => {});
      } catch {
        // No raffle news is not worth an error state on app open.
      } finally {
        if (!cancelled) onVisibilityChange?.(showing);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onVisibilityChange]);

  const dismiss = () => {
    setVisible(false);
    // Frees whatever the host was holding back while this was up.
    onVisibilityChange?.(false);
  };

  const visit = () => {
    dismiss();
    router.push("/birthday-raffle" as any);
  };

  const openRules = () => {
    dismiss();
    router.push("/birthday-raffle/rules" as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="gift" size={34} color="#a855f7" />
          </View>
          <Text style={styles.title}>{campaignName || "Birthday Raffle"}</Text>
          <Text style={styles.subtitle}>
            Create your birthday event and invite your friends and get them to RSVP. The higher
            your RSVPs, the better your chances!
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={visit}>
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>See the raffle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} activeOpacity={0.7} onPress={openRules}>
            <Text style={styles.linkText}>Official rules</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} activeOpacity={0.7} onPress={dismiss}>
            <Text style={styles.dismissText}>Not now</Text>
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
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(168,85,247,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    title: {
      fontFamily: Fonts.bold,
      fontSize: 22,
      color: c.text,
      marginBottom: 8,
      textAlign: "center",
    },
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
    linkButton: { paddingVertical: 8 },
    linkText: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: c.primary,
      textDecorationLine: "underline",
    },
    dismissButton: { paddingVertical: 8 },
    dismissText: { fontFamily: Fonts.medium, fontSize: 13, color: c.textMuted },
  });
