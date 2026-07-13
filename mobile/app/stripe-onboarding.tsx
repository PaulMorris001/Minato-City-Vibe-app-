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
import { useRouter, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
// Custom-scheme prefix the server redirects to after Stripe onboarding.
// Must match `scheme` in app.config.js AND the APP_URL env var on the server.
const RETURN_URL = "mobile://stripe-onboarding";

type AccountStatus = {
  connected: boolean;
  onboardingComplete: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
};

export default function StripeOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ success?: string; refresh?: string }>();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  // When the user returns from the Stripe-hosted onboarding page, refresh status
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
      setStatus(data);
    } catch {
      Alert.alert("Error", "Failed to fetch account status");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPayouts = async () => {
    setActionLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      // Step 1: Create account if needed
      if (!status?.connected) {
        const createRes = await fetch(`${BASE_URL}/stripe/connect/create`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!createRes.ok) {
          const d = await createRes.json();
          Alert.alert("Error", d.message || "Failed to create account");
          return;
        }
      }

      // Step 2: Get onboarding link and open in browser
      const linkRes = await fetch(`${BASE_URL}/stripe/connect/link`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        Alert.alert("Error", linkData.message || "Failed to get onboarding link");
        return;
      }

      // Open Stripe in an auth-session browser. `openAuthSessionAsync` watches
      // for the redirect to RETURN_URL and closes the in-app browser the
      // moment it sees it — far more reliable than handing the Stripe URL to
      // `Linking.openURL` and hoping the OS routes a custom-scheme 302 back
      // into the app. Works on dev clients + production builds; does not work
      // in Expo Go (custom schemes aren't honored there).
      const result = await WebBrowser.openAuthSessionAsync(linkData.url, RETURN_URL);

      // Whether the user finished, cancelled, or dismissed, re-check status —
      // a partial onboarding may have flipped some capability flags.
      await fetchStatus();

      if (result.type === "success") {
        // The URL will look like mobile://stripe-onboarding?success=true or ?refresh=true.
        // No-op here; the second useEffect picks up the params and the
        // status fetch above already reflects the new state.
      }
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

  const isFullySetup = status?.connected && status?.onboardingComplete;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Payouts Setup</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status card */}
        <View style={[styles.statusCard, isFullySetup ? styles.statusCardSuccess : styles.statusCardWarning]}>
          <Ionicons
            name={isFullySetup ? "checkmark-circle" : "alert-circle"}
            size={40}
            color={isFullySetup ? colors.success : colors.warning}
          />
          <Text style={styles.statusTitle}>
            {isFullySetup ? "Payouts Enabled" : "Setup Required"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isFullySetup
              ? "You'll automatically receive payouts for ticket and guide sales."
              : "Complete your Stripe setup to receive payouts from sales."}
          </Text>
        </View>

        {/* Info boxes */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Your cut: </Text>
              90% of every sale goes directly to you
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Powered by Stripe: </Text>
              Secure, trusted by millions of businesses
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Payouts: </Text>
              Automatically deposited to your bank account
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

        {/* Account details when connected */}
        {status?.connected && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Account Status</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Charges enabled</Text>
              <Ionicons
                name={status.chargesEnabled ? "checkmark-circle" : "close-circle"}
                size={20}
                color={status.chargesEnabled ? colors.success : colors.error}
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
          </View>
        )}

        {/* CTA */}
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
                <Ionicons name="open-outline" size={20} color="#fff" />
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
            <Ionicons name="open-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Manage Stripe Account</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.background },
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
  statusTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginTop: 12, marginBottom: 8 },
  statusSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center", lineHeight: 22 },
  infoSection: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textTertiary, flex: 1, lineHeight: 20 },
  infoLabel: { fontFamily: Fonts.semiBold, color: c.text },
  detailsCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailsTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.text, marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  detailLabel: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
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
