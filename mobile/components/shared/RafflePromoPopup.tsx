import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

/**
 * Announces an open Birthday Raffle campaign every time the app is opened.
 *
 * Deliberately NOT remembered between launches: while a campaign is running
 * this is the pitch, so it runs again on the next cold start even if the last
 * one was dismissed. It is held to once per launch rather than once per mount
 * so that switching tabs back to home doesn't re-nag inside one session —
 * module scope is the session, since a cold start re-evaluates it.
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
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (shownThisLaunch) {
      onVisibilityChange?.(false);
      return;
    }
    let cancelled = false;

    (async () => {
      let showing = false;
      try {
        // Public and unauthenticated on purpose — a signed-out browser should
        // hear about the raffle too.
        const res = await fetch(`${BASE_URL}/raffle/public`);
        const data = await res.json();
        if (cancelled || !res.ok || !data?.active) return;

        // Decides which way the button points, same split as home's
        // RaffleBanner. Guests have no entry, so this is skipped for them.
        const token = await SecureStore.getItemAsync("token");
        if (token) {
          try {
            const statusRes = await fetch(`${BASE_URL}/raffle/status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const status = await statusRes.json();
            if (!cancelled && statusRes.ok) setEntered(!!status.hasQualifyingEvent);
          } catch {
            // Falls back to the "see the raffle" route, which is never wrong.
          }
        }

        if (cancelled) return;
        setCampaignName(data.campaignName || "");
        setVisible(true);
        shownThisLaunch = true;
        showing = true;
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
    const path = entered ? "/birthday-raffle/status" : "/birthday-raffle";
    dismiss();
    router.push(path as any);
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
            {entered
              ? "Your birthday event is live. Invite your friends and get them to RSVP. The higher your RSVPs, the better your chances!"
              : "Create your birthday event and invite your friends and get them to RSVP. The higher your RSVPs, the better your chances!"}
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={visit}>
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {entered ? "View your status" : "See the raffle"}
            </Text>
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
