import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { ImagePickerButton } from "@/components/shared";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

type VerificationStatus = "none" | "pending" | "approved" | "rejected";

/**
 * Identity verification, on its own screen. Used to be a section inside
 * Settings — pulled out so the "Complete your setup" checklists (vendor
 * dashboard, client profile) can send someone straight to the action instead
 * of dropping them in the middle of the general Settings screen.
 */
export default function VerifyAccountScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [isVendor, setIsVendor] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>("none");
  const [notes, setNotes] = useState("");
  const [licenseImage, setLicenseImage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const [profileRes, verifRes] = await Promise.all([
          axios.get(`${BASE_URL}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios
            .get(`${BASE_URL}/verification/status`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => ({ data: { status: "none" as VerificationStatus } })),
        ]);
        setIsVendor(!!profileRes.data.user?.isVendor);
        setStatus(verifRes.data.status || "none");
        setNotes(verifRes.data.reviewNotes || "");
      } catch {
        showError("Failed to load verification status");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!licenseImage) {
      showInfo("Please select an image of your driver's license.", "Required");
      return;
    }
    setSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      let imageUrl = licenseImage;
      if (licenseImage.startsWith("file://")) {
        const { uploadImage } = await import("@/utils/imageUpload");
        const result = await uploadImage(licenseImage, "verifications", token!);
        imageUrl = result.url;
      }
      await axios.post(
        `${BASE_URL}/verification/submit`,
        { documentImage: imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatus("pending");
      setLicenseImage("");
      showSuccess("Your verification request has been submitted. We'll review it shortly.", "Submitted");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to submit verification");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Identity Verification</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.description}>
            {isVendor
              ? "Submit a government-issued ID to get a verification badge on your profile. Verified vendors and hosts get priority approval for paid events."
              : "Submit a government-issued ID to get a verification badge and become a trusted host. Verified hosts get faster approval for paid events."}
          </Text>

          {status === "approved" && (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>Verified</Text>
            </View>
          )}

          {status === "pending" && (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={22} color={colors.warning} />
              <Text style={[styles.statusText, { color: colors.warning }]}>Under review</Text>
            </View>
          )}

          {status === "rejected" && (
            <>
              <View style={styles.statusRow}>
                <Ionicons name="close-circle" size={22} color={colors.error} />
                <Text style={[styles.statusText, { color: colors.error }]}>Not approved</Text>
              </View>
              {!!notes && <Text style={styles.notes}>Reason: {notes}</Text>}
            </>
          )}

          {(status === "none" || status === "rejected") && (
            <>
              <ImagePickerButton
                imageUri={licenseImage}
                onImageSelected={setLicenseImage}
                label="Government-issued ID"
                size={120}
                shape="square"
              />
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>Submit for verification</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 12,
    },
    backButton: {},
    headerTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    content: { padding: 20, paddingBottom: 40, gap: 16 },
    description: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 20 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    statusText: { fontSize: 16, fontFamily: Fonts.semiBold },
    notes: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted },
    submitButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },
  });
