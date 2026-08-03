import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";

// Custom-scheme prefix the server's return page redirects to after Stripe's
// hosted onboarding. Must match `scheme` in app.config.js ("mobile"), this
// file's name, and APP_RETURN_URL in server/src/controllers/stripeConnect.controller.js.
const RETURN_URL = "mobile://stripe-connect-onboarding";

type AccountStatus = {
  connected: boolean;
  onboardingComplete: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  currency?: string | null;
  requirementsDue?: number;
  disabledReason?: string | null;
};

/**
 * Stripe Connect payout onboarding, for vendors inside Stripe's cross-border
 * -payouts footprint (US, UK, EEA, CA, CH). Unlike the Paystack and Wise screens
 * — which collect bank details in-app — Stripe hosts the whole flow including
 * identity verification, so this screen is a status view plus a browser handoff.
 */
export default function StripeConnectOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ success?: string; refresh?: string }>();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  // Returning from the Stripe-hosted page deep-links back here with these
  // params — re-check status so the card reflects what they just completed.
  useEffect(() => {
    if (params.success === "true" || params.refresh === "true") {
      fetchStatus();
    }
  }, [params.success, params.refresh]);

  const fetchStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/stripe/connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to load payout setup.");
        return;
      }
      setStatus(data);
    } catch {
      Alert.alert("Error", "Failed to load payout setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPayouts = async () => {
    setActionLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      // Step 1: create the connected account if they don't have one yet.
      if (!status?.connected) {
        const createRes = await fetch(`${BASE_URL}/stripe/connect/create`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!createRes.ok) {
          const d = await createRes.json();
          Alert.alert("Error", d.message || "Failed to create payout account.");
          return;
        }
      }

      // Step 2: mint a fresh hosted-onboarding link. These expire, which is why
      // we fetch one per attempt rather than caching.
      const linkRes = await fetch(`${BASE_URL}/stripe/connect/link`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        Alert.alert("Error", linkData.message || "Failed to start payout setup.");
        return;
      }

      // `openAuthSessionAsync` watches for the redirect to RETURN_URL and closes
      // the in-app browser the moment it sees it — far more reliable than
      // handing the Stripe URL to `Linking.openURL` and hoping the OS routes a
      // custom-scheme redirect back into the app. Works on dev clients and
      // production builds; not in Expo Go (custom schemes aren't honored there).
      await WebBrowser.openAuthSessionAsync(linkData.url, RETURN_URL);

      // Finished, cancelled or dismissed — re-check either way, since a partial
      // run can still have flipped capabilities.
      await fetchStatus();
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isFullySetup = !!(status?.connected && status?.onboardingComplete);
  // Verified, but Stripe is holding bank transfers pending more information.
  // Sales still work and the money is safe — it just can't land yet.
  const payoutsPaused = isFullySetup && status?.payoutsEnabled === false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Payouts Setup</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.statusCard,
            isFullySetup ? styles.statusCardSuccess : styles.statusCardWarning,
          ]}
        >
          <Ionicons
            name={isFullySetup ? "checkmark-circle" : "alert-circle"}
            size={40}
            color={isFullySetup ? colors.success : colors.warning}
          />
          <Text style={styles.statusTitle}>
            {isFullySetup ? "Payouts Enabled" : "Verify Your Identity"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isFullySetup
              ? status?.currency
                ? `Payouts are sent to your ${status.currency} account via Stripe.`
                : "Payouts are sent to your bank account via Stripe."
              : "Stripe verifies your identity and bank details so you can be paid for tickets, guides and bookings."}
          </Text>
        </View>

        {payoutsPaused && (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
            <Text style={styles.noticeText}>
              Stripe needs more information before it can send money to your bank. Your
              sales still work and your earnings are held safely until this is resolved.
              {status?.disabledReason ? ` (${status.disabledReason})` : ""}
            </Text>
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Your cut: </Text>
              90% of every sale, converted to your local currency
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Powered by Stripe: </Text>
              Stripe verifies your identity and holds your bank details — we never see them
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Payouts: </Text>
              Released after your event, once we've confirmed the sale
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Platform fee: </Text>
              10% per transaction covers payment processing and platform costs
            </Text>
          </View>
        </View>

        {status?.connected && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Account Status</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Identity verified</Text>
              <Ionicons
                name={status.onboardingComplete ? "checkmark-circle" : "close-circle"}
                size={20}
                color={status.onboardingComplete ? colors.success : colors.error}
              />
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payouts enabled</Text>
              <Ionicons
                name={status.payoutsEnabled ? "checkmark-circle" : "close-circle"}
                size={20}
                color={status.payoutsEnabled ? colors.success : colors.error}
              />
            </View>
            {!!status.requirementsDue && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Outstanding items</Text>
                <Text style={styles.detailValue}>{status.requirementsDue}</Text>
              </View>
            )}
          </View>
        )}

        {!isFullySetup && (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleSetupPayouts}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="open-outline" size={20} color={colors.white} />
                <Text style={styles.ctaText}>
                  {status?.connected ? "Continue Setup" : "Set Up Payouts"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isFullySetup && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSetupPayouts}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="open-outline" size={18} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Manage Payout Account</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backButton: { marginRight: 16 },
    headerTitle: { fontSize: 22, fontFamily: Fonts.bold, color: c.text },
    content: { padding: 20, paddingBottom: 40 },
    statusCard: {
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      marginBottom: 24,
      borderWidth: 1,
    },
    statusCardSuccess: {
      backgroundColor: "rgba(16, 185, 129, 0.08)",
      borderColor: "rgba(16, 185, 129, 0.3)",
    },
    statusCardWarning: {
      backgroundColor: "rgba(245, 158, 11, 0.08)",
      borderColor: "rgba(245, 158, 11, 0.3)",
    },
    statusTitle: {
      fontSize: 20,
      fontFamily: Fonts.bold,
      color: c.text,
      marginTop: 12,
      marginBottom: 8,
    },
    statusSubtitle: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    noticeCard: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
      backgroundColor: "rgba(245, 158, 11, 0.08)",
      borderColor: "rgba(245, 158, 11, 0.3)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    noticeText: {
      flex: 1,
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 19,
    },
    infoSection: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      gap: 14,
    },
    infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    infoText: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textTertiary,
      flex: 1,
      lineHeight: 20,
    },
    infoLabel: { fontFamily: Fonts.semiBold, color: c.text },
    detailsCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    detailsTitle: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: c.text,
      marginBottom: 12,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
    },
    detailLabel: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
    detailValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.text },
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 12,
      gap: 8,
      marginTop: 4,
    },
    ctaText: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.white },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.primary,
      paddingVertical: 14,
      borderRadius: 12,
      gap: 8,
      marginTop: 4,
    },
    secondaryButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.primary },
  });
