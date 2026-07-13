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
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
// A single Wise requirement field (we render the first entry of each `group`).
type WiseField = {
  key: string;
  name: string;
  type: string; // "text" | "select" | "radio" | ...
  required: boolean;
  example?: string;
  valuesAllowed?: { key: string; name: string }[] | null;
};
type WiseRequirement = { type: string; title: string; fields: { group: WiseField[] }[] };

/**
 * Wise payout onboarding for international vendors. Unlike the Flutterwave screen
 * (fixed account-number + bank fields), Wise's required fields vary by currency,
 * so we fetch them dynamically from /wise/account-requirements and render a form.
 */
export default function WiseOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [saving, setSaving] = useState(false);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [savedCurrency, setSavedCurrency] = useState<string | null>(null);

  const [currency, setCurrency] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [requirement, setRequirement] = useState<WiseRequirement | null>(null);
  // Flat map of field key → entered value (becomes the recipient `details`).
  const [values, setValues] = useState<Record<string, string>>({});

  // Simple select-field picker
  const [pickerField, setPickerField] = useState<WiseField | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/wise/connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = await res.json();
      setOnboardingComplete(!!status.onboardingComplete);
      setSavedCurrency(status.currency || null);
      if (status.currency) setCurrency(status.currency);
    } catch {
      Alert.alert("Error", "Failed to load payout setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch the bank-detail fields Wise needs for the entered currency.
  const loadRequirements = async () => {
    const cur = currency.trim().toUpperCase();
    if (cur.length !== 3) {
      Alert.alert("Enter a currency", "Use the 3-letter code for your payout currency (e.g. GBP, EUR, INR).");
      return;
    }
    setLoadingReqs(true);
    setRequirement(null);
    setValues({});
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/wise/account-requirements?currency=${cur}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.requirements) || data.requirements.length === 0) {
        Alert.alert("Unsupported", data.message || "We couldn't load payout fields for that currency.");
        return;
      }
      // MVP: use the first account type Wise offers for this currency.
      setRequirement(data.requirements[0]);
    } catch {
      Alert.alert("Error", "Something went wrong loading payout fields.");
    } finally {
      setLoadingReqs(false);
    }
  };

  const setValue = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

  // The renderable fields (first entry of each group), minus the holder name
  // which we capture in its own input.
  const fields: WiseField[] =
    requirement?.fields.map((f) => f.group[0]).filter((g) => g && g.key !== "accountHolderName") ?? [];

  const handleSave = async () => {
    if (!requirement) return;
    if (!accountHolderName.trim()) {
      Alert.alert("Missing name", "Enter the account holder's name.");
      return;
    }
    const missing = fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      Alert.alert("Missing details", `Please fill in "${missing.name}".`);
      return;
    }
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/wise/connect/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHolderName: accountHolderName.trim(),
          currency: currency.trim().toUpperCase(),
          type: requirement.type,
          details: values,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to save payout details.");
        return;
      }
      setOnboardingComplete(true);
      setSavedCurrency(data.currency || currency.trim().toUpperCase());
      setRequirement(null);
      Alert.alert("Payouts enabled", "You're all set to receive payments via Wise.");
    } catch {
      Alert.alert("Error", "Failed to save payout details.");
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
            {onboardingComplete ? "Payouts Enabled" : "Add Your Bank"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {onboardingComplete
              ? `Payouts are sent to your ${savedCurrency || ""} account via Wise.`
              : "Add your international bank account to receive payments for tickets, guides and bookings."}
          </Text>
        </View>

        {/* Currency → load the right fields */}
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Payout currency</Text>
          <View style={styles.currencyRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={currency}
              onChangeText={(t) => setCurrency(t.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
              placeholder="GBP"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={3}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={loadRequirements} disabled={loadingReqs}>
              {loadingReqs ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Load fields</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Dynamic requirement form */}
        {requirement && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Account holder name</Text>
            <TextInput
              style={styles.input}
              value={accountHolderName}
              onChangeText={setAccountHolderName}
              placeholder="As it appears on the account"
              placeholderTextColor={colors.textMuted}
            />

            {fields.map((f) => {
              const isSelect =
                (f.type === "select" || f.type === "radio") &&
                Array.isArray(f.valuesAllowed) &&
                f.valuesAllowed.length > 0;
              const selectedLabel = isSelect
                ? f.valuesAllowed?.find((v) => v.key === values[f.key])?.name
                : undefined;
              return (
                <View key={f.key}>
                  <Text style={styles.fieldLabel}>
                    {f.name}
                    {f.required ? "" : " (optional)"}
                  </Text>
                  {isSelect ? (
                    <TouchableOpacity style={styles.select} onPress={() => setPickerField(f)}>
                      <Text style={[styles.selectText, !selectedLabel && styles.selectPlaceholder]}>
                        {selectedLabel || `Select ${f.name.toLowerCase()}`}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      style={styles.input}
                      value={values[f.key] || ""}
                      onChangeText={(t) => setValue(f.key, t)}
                      placeholder={f.example || ""}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                </View>
              );
            })}

            <TouchableOpacity style={styles.ctaButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {onboardingComplete ? "Update Payout Account" : "Save & Enable Payouts"}
                </Text>
              )}
            </TouchableOpacity>
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
              <Text style={styles.infoLabel}>Powered by Wise: </Text>
              Mid-market rates, paid to ~160 countries
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Select-field picker */}
      <Modal visible={!!pickerField} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerField?.name}</Text>
              <TouchableOpacity onPress={() => setPickerField(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerField?.valuesAllowed || []}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.bankRow}
                  onPress={() => {
                    if (pickerField) setValue(pickerField.key, item.key);
                    setPickerField(null);
                  }}
                >
                  <Text style={styles.bankRowText}>{item.name}</Text>
                  {pickerField && values[pickerField.key] === item.key && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
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
  form: { backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary, marginBottom: 8, marginTop: 4 },
  currencyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
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
    marginBottom: 12,
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
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.primary },
  infoSection: { backgroundColor: c.card, borderRadius: 12, padding: 16, gap: 14 },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textTertiary, flex: 1, lineHeight: 20 },
  infoLabel: { fontFamily: Fonts.semiBold, color: c.text },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, height: "60%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 },
  modalTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
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
});
