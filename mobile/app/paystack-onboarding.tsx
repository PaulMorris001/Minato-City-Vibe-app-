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
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
type Bank = { code: string; name: string };

// Country (lowercased) → ISO code for the banks endpoint. Mirrors the server's
// BANK_COUNTRY_NAMES map (controllers/paystack.controller.js); launch scope is
// Nigeria only.
const PAYSTACK_BANK_COUNTRY_CODES: Record<string, string> = {
  nigeria: "NG",
  ghana: "GH",
  kenya: "KE",
  "south africa": "ZA",
};

export default function PaystackOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [savedBank, setSavedBank] = useState<any>(null);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");

      // Determine the vendor's country code from their stored profile.
      let code = "NG";
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const user = JSON.parse(userJson);
        const country = (user?.location?.country || "").trim().toLowerCase();
        if (PAYSTACK_BANK_COUNTRY_CODES[country]) code = PAYSTACK_BANK_COUNTRY_CODES[country];
      }

      const [statusRes, banksRes] = await Promise.all([
        fetch(`${BASE_URL}/paystack/connect/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BASE_URL}/paystack/banks?country=${code}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const status = await statusRes.json();
      setOnboardingComplete(!!status.onboardingComplete);
      setSavedBank(status.bank || null);

      const banksData = await banksRes.json();
      setBanks(banksData.banks || []);
    } catch {
      Alert.alert("Error", "Failed to load payout setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedBank || accountNumber.length < 6) {
      Alert.alert("Missing details", "Choose your bank and enter your account number.");
      return;
    }
    setResolving(true);
    setAccountName("");
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/paystack/connect/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber, bankCode: selectedBank.code }),
      });
      const data = await res.json();
      if (!res.ok || !data.accountName) {
        Alert.alert("Couldn't verify", data.message || "Check the details and try again.");
        return;
      }
      setAccountName(data.accountName);
    } catch {
      Alert.alert("Error", "Something went wrong verifying your account.");
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBank || !accountName) return;
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/paystack/connect/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber,
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          accountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to save bank details.");
        return;
      }
      setOnboardingComplete(true);
      setSavedBank(data.bank);
      Alert.alert("Payouts enabled", "You're all set to receive payments.");
    } catch {
      Alert.alert("Error", "Failed to save bank details.");
    } finally {
      setSaving(false);
    }
  };

  const filteredBanks = banks.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

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
            {onboardingComplete ? "Payouts Enabled" : "Add Your Bank"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {onboardingComplete
              ? "Payouts for your sales are sent to the bank account below."
              : "Add your local bank account to receive payments for tickets, guides and bookings."}
          </Text>
        </View>

        {onboardingComplete && savedBank && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Payout Account</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank</Text>
              <Text style={styles.detailValue}>{savedBank.bankName || "—"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account</Text>
              <Text style={styles.detailValue}>{savedBank.accountNumber}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name</Text>
              <Text style={styles.detailValue}>{savedBank.accountName}</Text>
            </View>
          </View>
        )}

        {/* Bank entry form (also used to update an existing account) */}
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
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleVerify}
              disabled={resolving}
            >
              {resolving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Verify account</Text>
              )}
            </TouchableOpacity>
          )}

          {!!accountName && (
            <TouchableOpacity style={styles.ctaButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {onboardingComplete ? "Update Bank" : "Save & Enable Payouts"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Your cut: </Text>
              90% of every sale is paid to your bank
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Powered by Paystack: </Text>
              Trusted across Africa
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bank picker modal */}
      <Modal visible={bankPickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select your bank</Text>
              <TouchableOpacity onPress={() => setBankPickerOpen(false)}>
                <Ionicons name="close" size={24} color="#fff" />
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
              ListEmptyComponent={
                <Text style={styles.emptyText}>No banks found</Text>
              }
            />
          </View>
        </View>
      </Modal>
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
  statusCard: { borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24, borderWidth: 1 },
  statusCardSuccess: { backgroundColor: "rgba(16, 185, 129, 0.08)", borderColor: "rgba(16, 185, 129, 0.3)" },
  statusCardWarning: { backgroundColor: "rgba(245, 158, 11, 0.08)", borderColor: "rgba(245, 158, 11, 0.3)" },
  statusTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginTop: 12, marginBottom: 8 },
  statusSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center", lineHeight: 22 },
  detailsCard: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 20 },
  detailsTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.text, marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  detailLabel: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
  detailValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.text },
  form: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary, marginBottom: 8, marginTop: 4 },
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
    marginBottom: 12,
  },
  resolvedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resolvedText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.success },
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
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 4,
  },
  secondaryButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.primary },
  infoSection: { backgroundColor: c.card, borderRadius: 12, padding: 16, gap: 14 },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textTertiary, flex: 1, lineHeight: 20 },
  infoLabel: { fontFamily: Fonts.semiBold, color: c.text },
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
    borderBottomColor: "#2a2a3a",
  },
  bankRowText: { fontSize: 15, fontFamily: Fonts.regular, color: c.text },
  emptyText: { textAlign: "center", color: c.textMuted, marginTop: 24, fontFamily: Fonts.regular },
});
