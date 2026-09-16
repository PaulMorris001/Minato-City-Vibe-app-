import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/fonts";
import { formatMoney } from "@/constants/payments";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** The vendor a viewer's credit would be redeemable at — null when the
 *  campaign assigned none for that currency (spendable anywhere). `_id` is
 *  the vendor's USER account id (not navigable); `vendorId` is their
 *  separate Vendor listing's own id — that's what `/vendor-details/[id]`
 *  needs, and it's `null` if the account has no listing (interrupted
 *  onboarding) — hide the "visit vendor" link rather than navigate with it. */
export interface RaffleVendor {
  _id: string;
  vendorId: string | null;
  username: string;
  businessName?: string;
  businessPicture?: string;
  profilePicture?: string;
}

/** Shape both birthday-raffle screens already get back from GET /raffle/status
 *  — passed straight through, no re-derivation needed. */
export interface RaffleStatusLike {
  status?: string;
  eventId?: string;
  eventTitle?: string;
  winnerRank?: number | null;
  prizes?: { rank: number; couponAmount?: number; couponCurrency?: "NGN" | "USD"; extraPerk?: string }[];
  vendor?: RaffleVendor | null;
}

/**
 * One-time "Congratulations, you won!" popup. Shared by both
 * app/birthday-raffle/index.tsx (the landing page) and
 * app/birthday-raffle/status.tsx (where the "raffle_winner" push notification
 * deep-links to) — a winner needs to see this regardless of which of the two
 * screens they arrive on, and the two used to only agree on one of them.
 *
 * Shown once per (eventId, rank), tracked in AsyncStorage: a plain revisit
 * never repeats it, but a rank correction (2nd → 1st) is genuinely new news
 * and shows again.
 */
export default function RaffleWinnerPopup({ data }: { data: RaffleStatusLike | null }) {
  const styles = useThemedStyles(createStyles);
  const [popup, setPopup] = useState<{
    seenKey: string;
    rank: number;
    couponAmount: number;
    couponCurrency: "NGN" | "USD";
    extraPerk: string;
  } | null>(null);

  useEffect(() => {
    if (!data || data.status !== "winner" || !data.eventId || !data.winnerRank) return;
    const seenKey = `raffle_winner_seen_${data.eventId}_${data.winnerRank}`;
    let cancelled = false;
    AsyncStorage.getItem(seenKey).then((seen) => {
      if (cancelled || seen) return;
      const tier = data.prizes?.find((p) => p.rank === data.winnerRank);
      setPopup({
        seenKey,
        rank: data.winnerRank!,
        couponAmount: tier?.couponAmount || 0,
        couponCurrency: tier?.couponCurrency || "NGN",
        extraPerk: tier?.extraPerk || "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [data?.status, data?.eventId, data?.winnerRank]);

  const dismiss = () => {
    if (popup) AsyncStorage.setItem(popup.seenKey, "1").catch(() => {});
    setPopup(null);
  };

  const goToWallet = () => {
    dismiss();
    router.push("/wallet-rewards" as any);
  };

  return (
    <Modal visible={!!popup} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.trophyWrap}>
            <Ionicons name="trophy" size={36} color="#F5B700" />
          </View>
          <Text style={styles.title}>Congratulations!</Text>
          <Text style={styles.subtitle}>
            {popup ? `You placed ${ordinal(popup.rank)} in the Birthday Raffle!` : ""}
          </Text>
          {!!popup && (
            <Text style={styles.prize}>
              {popup.couponAmount > 0
                ? `${formatMoney(popup.couponAmount, popup.couponCurrency)} OurCityVibe credit`
                : "A prize"}
              {popup.extraPerk ? ` + ${popup.extraPerk}` : ""}
            </Text>
          )}
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={goToWallet}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>View my Wallet & Rewards</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} activeOpacity={0.7} onPress={dismiss}>
            <Text style={styles.dismissText}>Close</Text>
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
      borderColor: c.glassStroke || "rgba(255,255,255,0.06)",
    },
    trophyWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(245,183,0,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    title: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 22,
      color: c.textBright,
      marginBottom: 6,
    },
    subtitle: {
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textDim,
      textAlign: "center",
      marginBottom: 12,
    },
    prize: {
      fontFamily: Fonts.bold,
      fontSize: 17,
      color: c.primary,
      textAlign: "center",
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
    primaryButtonText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: "#fff",
    },
    dismissButton: {
      paddingVertical: 8,
    },
    dismissText: {
      fontFamily: Fonts.medium,
      fontSize: 13,
      color: c.textFaint,
    },
  });
