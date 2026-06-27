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
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { FLUTTERWAVE_COUNTRY_CODES } from "@/constants/payments";
import { Fonts } from "@/constants/fonts";

type Bank = { code: string; name: string };

export default function FlutterwaveOnboardingScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [savedBank, setSavedBank] = useState<any>(null);

  const [countryCode, setCountryCode] = useState("NG");
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
        if (FLUTTERWAVE_COUNTRY_CODES[country]) code = FLUTTERWAVE_COUNTRY_CODES[country];
      }
      setCountryCode(code);

      const [statusRes, banksRes] = await Promise.all([
        fetch(`${BASE_URL}/flutterwave/connect/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BASE_URL}/flutterwave/banks?country=${code}`, {
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
      const res = await fetch(`${BASE_URL}/flutterwave/connect/resolve`, {
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
      const res = await fetch(`${BASE_URL}/flutterwave/connect/save`, {
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
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
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
            color={onboardingComplete ? "#10b981" : "#f59e0b"}
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
            <Ionicons name="chevron-down" size={18} color="#9ca3af" />
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
            placeholderTextColor="#6b7280"
            keyboardType="number-pad"
            maxLength={10}
          />

          {accountName ? (
            <View style={styles.resolvedBox}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.resolvedText}>{accountName}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleVerify}
              disabled={resolving}
            >
              {resolving ? (
                <ActivityIndicator size="small" color="#a855f7" />
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
            <Ionicons name="cash-outline" size={20} color="#a855f7" />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Your cut: </Text>
              90% of every sale is paid to your bank
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#a855f7" />
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Powered by Flutterwave: </Text>
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
              placeholderTextColor="#6b7280"
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
                    <Ionicons name="checkmark" size={18} color="#a855f7" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f0f1a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 22, fontFamily: Fonts.bold, color: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  statusCard: { borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24, borderWidth: 1 },
  statusCardSuccess: { backgroundColor: "rgba(16, 185, 129, 0.08)", borderColor: "rgba(16, 185, 129, 0.3)" },
  statusCardWarning: { backgroundColor: "rgba(245, 158, 11, 0.08)", borderColor: "rgba(245, 158, 11, 0.3)" },
  statusTitle: { fontSize: 20, fontFamily: Fonts.bold, color: "#fff", marginTop: 12, marginBottom: 8 },
  statusSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
  detailsCard: { backgroundColor: "#1f1f2e", borderRadius: 12, padding: 16, marginBottom: 20 },
  detailsTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#fff", marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  detailLabel: { fontSize: 14, fontFamily: Fonts.regular, color: "#9ca3af" },
  detailValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: "#fff" },
  form: { backgroundColor: "#1f1f2e", borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: "#9ca3af", marginBottom: 8, marginTop: 4 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f1a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 8,
  },
  selectText: { fontSize: 15, fontFamily: Fonts.regular, color: "#fff" },
  selectPlaceholder: { color: "#6b7280" },
  input: {
    backgroundColor: "#0f0f1a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#fff",
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
  resolvedText: { fontSize: 14, fontFamily: Fonts.semiBold, color: "#10b981" },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#a855f7",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  ctaText: { fontSize: 16, fontFamily: Fonts.semiBold, color: "#fff" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#a855f7",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 4,
  },
  secondaryButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#a855f7" },
  infoSection: { backgroundColor: "#1f1f2e", borderRadius: 12, padding: 16, gap: 14 },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoText: { fontSize: 14, fontFamily: Fonts.regular, color: "#d1d5db", flex: 1, lineHeight: 20 },
  infoLabel: { fontFamily: Fonts.semiBold, color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#1f1f2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, height: "75%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 },
  modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: "#fff" },
  searchInput: {
    backgroundColor: "#0f0f1a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    color: "#fff",
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
  bankRowText: { fontSize: 15, fontFamily: Fonts.regular, color: "#fff" },
  emptyText: { textAlign: "center", color: "#6b7280", marginTop: 24, fontFamily: Fonts.regular },
});
