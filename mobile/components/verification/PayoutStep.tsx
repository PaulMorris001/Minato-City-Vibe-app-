import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess } from "@/utils/toast";
import { PrimaryButton } from "@/components/shared";
import StepDoneCard from "@/components/verification/StepDoneCard";
import { getAddressFromCurrentPosition } from "@/hooks/useLocation";
import { setActiveCity } from "@/hooks/useActiveCity";
import {
  payoutCountryKnown,
  payoutProviderForCountry,
  payoutUnavailableMessage,
} from "@/constants/payments";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

type Bank = { code: string; name: string };

// Must match app.config.js `scheme` ("mobile") and this route's counterpart in
// stripe-connect-onboarding.tsx / stripeConnect.controller.js's APP_RETURN_URL.
const STRIPE_RETURN_URL = "mobile://stripe-connect-onboarding";

interface PayoutStepProps {
  onFinish: () => void;
}

/**
 * Step 3 of the public-event verification wizard. Payout isn't required to
 * create a public event — only to sell tickets on one (see the "Trust gates"
 * comment in event.controller.js createEvent) — so every branch here can
 * reach Finish even when incomplete; this step exists to get it out of the
 * way before an organizer hits that gate mid-checkout-setup.
 */
export default function PayoutStep({ onFinish }: PayoutStepProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Paystack
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [paystackComplete, setPaystackComplete] = useState(false);
  const [savedBank, setSavedBank] = useState<{ bankName: string; accountName: string; accountNumber: string } | null>(null);

  // Stripe
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; onboardingComplete: boolean; currency?: string | null } | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  const countryKnown = payoutCountryKnown(country);
  const provider = payoutProviderForCountry(country);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync("token")}`,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${BASE_URL}/profile`, { headers: await authHeaders() });
        setCountry(res.data.user?.country);
      } catch {
        showError("Failed to load your payout status");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!countryKnown) return;
    if (provider === "paystack") loadPaystack();
    else if (provider === "stripe") loadStripeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryKnown, provider]);

  const loadPaystack = async () => {
    try {
      const headers = await authHeaders();
      const [statusRes, banksRes] = await Promise.all([
        axios.get(`${BASE_URL}/paystack/connect/status`, { headers }),
        axios.get(`${BASE_URL}/paystack/banks?country=NG`, { headers }),
      ]);
      setPaystackComplete(!!statusRes.data.onboardingComplete);
      setSavedBank(statusRes.data.bank || null);
      setBanks(banksRes.data.banks || []);
    } catch {
      showError("Failed to load bank options");
    }
  };

  const loadStripeStatus = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/stripe/connect/status`, { headers: await authHeaders() });
      setStripeStatus(res.data);
    } catch {
      showError("Failed to load payout status");
    }
  };

  const handleUseCurrentLocation = async () => {
    if (detectingLocation) return;
    setDetectingLocation(true);
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        if (!canAskAgain) {
          showError("Enable location access in your device settings to continue.");
          return;
        }
        const requested = await Location.requestForegroundPermissionsAsync();
        granted = requested.status === "granted";
      }
      if (!granted) return;

      const address = await getAddressFromCurrentPosition();
      if (!address?.country) {
        showError("Couldn't determine your location. Try again in a moment.");
        return;
      }
      const token = await SecureStore.getItemAsync("token");
      await axios.put(
        `${BASE_URL}/profile/picture`,
        { location: { country: address.country, state: address.state || "", city: address.city || "" } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCountry(address.country);
      if (address.city) {
        await setActiveCity(address.city);
        await SecureStore.setItemAsync("citySource", "auto");
      }
      showSuccess(`Location set to ${address.city || address.country}`);
    } catch {
      showError("Failed to update your location. Please try again.");
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleResolveBank = async () => {
    if (!selectedBank || accountNumber.length < 6) {
      showError("Choose your bank and enter your account number.");
      return;
    }
    setResolving(true);
    setAccountName("");
    try {
      const res = await axios.post(
        `${BASE_URL}/paystack/connect/resolve`,
        { accountNumber, bankCode: selectedBank.code },
        { headers: await authHeaders() }
      );
      if (!res.data.accountName) {
        showError(res.data.message || "Check the details and try again.");
        return;
      }
      setAccountName(res.data.accountName);
    } catch (err: any) {
      showError(err.response?.data?.message || "Something went wrong verifying your account.");
    } finally {
      setResolving(false);
    }
  };

  const handleSaveBank = async () => {
    if (!selectedBank || !accountName) return;
    setSavingBank(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/paystack/connect/save`,
        { accountNumber, bankCode: selectedBank.code, bankName: selectedBank.name, accountName },
        { headers: await authHeaders() }
      );
      setPaystackComplete(true);
      setSavedBank(res.data.bank);
      showSuccess("You're all set to receive payments.");
    } catch (err: any) {
      showError(err.response?.data?.message || "Failed to save bank details.");
    } finally {
      setSavingBank(false);
    }
  };

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    try {
      const headers = await authHeaders();
      if (!stripeStatus?.connected) {
        await axios.post(`${BASE_URL}/stripe/connect/create`, {}, { headers });
      }
      const linkRes = await axios.get(`${BASE_URL}/stripe/connect/link`, { headers });
      await WebBrowser.openAuthSessionAsync(linkRes.data.url, STRIPE_RETURN_URL);
      await loadStripeStatus();
    } catch (err: any) {
      showError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Country unknown — fixable, but there's no rail to send them to yet.
  if (!countryKnown) {
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>Add a payout method</Text>
          <Text style={styles.stepSubtitle}>
            Set your location first so we know which payout method to show you.
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleUseCurrentLocation}
            disabled={detectingLocation}
          >
            {detectingLocation ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Use my current location</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onFinish}>
            <Text style={styles.skipText}>I'll do this later</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Known country, but no rail reaches it — nothing actionable here.
  if (!provider) {
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>Add a payout method</Text>
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.warning} />
            <Text style={styles.noticeText}>{payoutUnavailableMessage(country)}</Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton onPress={onFinish} icon="checkmark">
            Finish
          </PrimaryButton>
        </View>
      </View>
    );
  }

  if (provider === "paystack") {
    const filteredBanks = banks.filter((b) => b.name.toLowerCase().includes(bankSearch.toLowerCase()));
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepTitle}>Add a payout method</Text>
          <Text style={styles.stepSubtitle}>
            Add your local bank account to receive payments for tickets, guides and bookings.
          </Text>

          {paystackComplete && savedBank ? (
            <StepDoneCard
              icon="checkmark"
              tint={colors.success}
              tintLight={colors.successLight}
              title={savedBank.bankName}
              subtitle={`${savedBank.accountName} · ${savedBank.accountNumber}`}
            />
          ) : (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>Bank</Text>
              <TouchableOpacity style={styles.select} onPress={() => setBankPickerOpen(true)}>
                <Text style={[styles.selectText, !selectedBank && styles.selectPlaceholder]}>
                  {selectedBank ? selectedBank.name : "Select your bank"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Account number</Text>
              <TextInput
                style={styles.input}
                value={accountNumber}
                onChangeText={(t) => {
                  setAccountNumber(t.replace(/[^0-9]/g, ""));
                  setAccountName("");
                }}
                placeholder="0123456789"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={10}
              />

              {accountName ? (
                <View style={styles.resolvedBox}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.resolvedText}>{accountName}</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.secondaryButton} onPress={handleResolveBank} disabled={resolving}>
                  {resolving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Verify account</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            onPress={paystackComplete ? onFinish : handleSaveBank}
            loading={savingBank}
            disabled={!paystackComplete && !accountName}
            icon="checkmark"
          >
            {paystackComplete ? "Finish" : "Save & finish"}
          </PrimaryButton>

          {!paystackComplete && (
            <TouchableOpacity onPress={onFinish}>
              <Text style={styles.skipText}>I'll do this later</Text>
            </TouchableOpacity>
          )}
        </View>

        <Modal visible={bankPickerOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select your bank</Text>
                <TouchableOpacity onPress={() => setBankPickerOpen(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                value={bankSearch}
                onChangeText={setBankSearch}
                placeholder="Search banks"
                placeholderTextColor={colors.textMuted}
              />
              <FlatList
                data={filteredBanks}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bankRow}
                    onPress={() => {
                      setSelectedBank(item);
                      setAccountName("");
                      setBankPickerOpen(false);
                      setBankSearch("");
                    }}
                  >
                    <Text style={styles.bankRowText}>{item.name}</Text>
                    {selectedBank?.code === item.code && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No banks found</Text>}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // provider === "stripe"
  const stripeComplete = !!(stripeStatus?.connected && stripeStatus?.onboardingComplete);
  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Add a payout method</Text>
        <Text style={styles.stepSubtitle}>
          Stripe verifies your identity and bank details so you can be paid for tickets, guides
          and bookings.
        </Text>

        {stripeComplete && (
          <StepDoneCard
            icon="checkmark"
            tint={colors.success}
            tintLight={colors.successLight}
            title="Payouts connected"
            subtitle={
              stripeStatus?.currency
                ? `Sent to your ${stripeStatus.currency} account via Stripe.`
                : "Sent to your bank account via Stripe."
            }
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!stripeComplete && (
          <TouchableOpacity style={styles.actionButton} onPress={handleStripeConnect} disabled={stripeLoading}>
            {stripeLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {stripeStatus?.connected ? "Continue setup" : "Set up payouts with Stripe"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <PrimaryButton onPress={onFinish} icon="checkmark">
          {stripeComplete ? "Finish" : "Finish for now"}
        </PrimaryButton>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
    stepContainer: { flex: 1 },
    body: { flexGrow: 1, justifyContent: "center", gap: 16, paddingVertical: 20 },
    footer: { paddingTop: 12, paddingBottom: 12, gap: 10 },
    stepTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text },
    stepSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 20 },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 12,
    },
    actionButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },
    skipText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textMuted,
      textAlign: "center",
      textDecorationLine: "underline",
    },
    noticeCard: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      backgroundColor: c.warning + "1A",
      borderWidth: 1,
      borderColor: c.warning + "40",
      borderRadius: 12,
      padding: 14,
    },
    noticeText: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 18 },
    form: { backgroundColor: c.card, borderRadius: 12, padding: 16, gap: 4 },
    fieldLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary, marginBottom: 6, marginTop: 4 },
    select: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    selectText: { fontSize: 15, fontFamily: Fonts.regular, color: c.text },
    selectPlaceholder: { color: c.textMuted },
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
      marginBottom: 4,
    },
    resolvedBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.success + "1A",
      borderRadius: 10,
      padding: 12,
    },
    resolvedText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.success },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.primary,
      paddingVertical: 14,
      borderRadius: 12,
    },
    secondaryButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.primary },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, height: "75%" },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 },
    modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    searchInput: {
      backgroundColor: c.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginHorizontal: 20,
      marginBottom: 12,
      color: c.text,
      fontFamily: Fonts.regular,
    },
    bankRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    bankRowText: { fontSize: 15, fontFamily: Fonts.regular, color: c.text },
    emptyText: { textAlign: "center", color: c.textMuted, marginTop: 24, fontFamily: Fonts.regular },
  });
