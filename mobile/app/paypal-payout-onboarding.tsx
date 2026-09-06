import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { SELLER_SHARE_PERCENT } from "@/constants/payments";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Payout setup for every seller outside Nigeria.
 *
 * One field, because that is genuinely all PayPal Payouts needs. The Stripe
 * Connect screen this replaced opened a hosted KYC flow in a browser session and
 * polled for completion; PayPal addresses a recipient by email and runs its own
 * checks when the payout is sent.
 *
 * The trade-off worth knowing: a typo cannot be detected here. PayPal holds a
 * payout to an address with no account as "unclaimed" for 30 days and then
 * returns it, so the copy asks the seller to double-check rather than pretending
 * we validated it.
 */
export default function PaypalPayoutOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/paypal/connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = await res.json();
      setOnboardingComplete(!!status.onboardingComplete);
      setSavedEmail(status.email || null);
    } catch {
      Alert.alert("Error", "Failed to load payout setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      Alert.alert("Check your email", "Enter the email address on your PayPal account.");
      return;
    }
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/paypal/connect/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to save your PayPal address.");
        return;
      }
      setOnboardingComplete(true);
      setSavedEmail(data.email);
      setEmail("");
      Alert.alert("Payouts enabled", "You're all set to receive payments.");
    } catch {
      Alert.alert("Error", "Failed to save your PayPal address.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
            onboardingComplete ? styles.statusCardSuccess : styles.statusCardWarning,
          ]}
        >
          <Ionicons
            name={onboardingComplete ? "checkmark-circle" : "alert-circle"}
            size={40}
            color={onboardingComplete ? colors.success : colors.warning}
          />
          <Text style={styles.statusTitle}>
            {onboardingComplete ? "Payouts Enabled" : "Add Your PayPal"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {onboardingComplete
              ? "Payouts for your sales are sent to the PayPal address below."
              : "Add the email on your PayPal account to receive payments for tickets, guides and bookings."}
          </Text>
        </View>

        {onboardingComplete && savedEmail && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Payout Account</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>PayPal email</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {savedEmail}
              </Text>
            </View>
          </View>
        )}

        {/* Email entry (also used to change an existing address) */}
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>
            {onboardingComplete ? "New PayPal email" : "PayPal email"}
          </Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
          />

          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              Double-check this address. We can't verify it for you, and a payout sent to
              the wrong email takes 30 days to come back.
            </Text>
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>
                {onboardingComplete ? "Update PayPal Email" : "Save & Enable Payouts"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Your cut: </Text>
              {SELLER_SHARE_PERCENT}% of every sale is sent to your PayPal
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>When you're paid: </Text>
              after we've approved the payout — ticket sales are released once the event
              has happened
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Powered by PayPal: </Text>
              available in more than 200 countries
            </Text>
          </View>
        </View>
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
    detailsCard: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 20 },
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
      gap: 12,
    },
    detailLabel: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
    detailValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.text, flexShrink: 1 },
    form: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 20 },
    fieldLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      backgroundColor: c.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      fontSize: 15,
      fontFamily: Fonts.regular,
      marginBottom: 12,
    },
    noticeBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: "rgba(245, 158, 11, 0.08)",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    noticeText: {
      flex: 1,
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 19,
    },
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 12,
      gap: 8,
    },
    ctaText: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.white },
    infoSection: { backgroundColor: c.card, borderRadius: 12, padding: 16, gap: 14 },
    infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    infoText: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textTertiary,
      flex: 1,
      lineHeight: 20,
    },
    infoLabel: { fontFamily: Fonts.semiBold, color: c.text },
  });
