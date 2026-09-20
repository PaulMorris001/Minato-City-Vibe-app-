import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { ImagePickerButton, PrimaryButton } from "@/components/shared";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

type VerificationStatus = "none" | "pending" | "approved" | "rejected";

const STATUS_META: Record<
  Exclude<VerificationStatus, "none">,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; colorKey: "success" | "warning" | "error" }
> = {
  approved: { icon: "checkmark-circle", label: "Verified", colorKey: "success" },
  pending: { icon: "time-outline", label: "Under review", colorKey: "warning" },
  rejected: { icon: "close-circle", label: "Not approved", colorKey: "error" },
};

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

  const canSubmit = status === "none" || status === "rejected";
  const statusMeta = status !== "none" ? STATUS_META[status] : null;

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
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroBadge}
              >
                <Ionicons name="shield-checkmark" size={36} color="#fff" />
              </LinearGradient>
              <Text style={styles.heroTitle}>Get your verified badge</Text>
              <Text style={styles.description}>
                {isVendor
                  ? "Submit a government-issued ID to get a verification badge on your profile. Verified vendors and hosts get priority approval for paid events."
                  : "Submit a government-issued ID to get a verification badge and become a trusted host. Verified hosts get faster approval for paid events."}
              </Text>
            </View>

            {statusMeta && (
              <View
                style={[
                  styles.statusCard,
                  {
                    backgroundColor: colors[statusMeta.colorKey] + "1A",
                    borderColor: colors[statusMeta.colorKey] + "40",
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusIconWrap,
                    { backgroundColor: colors[statusMeta.colorKey] + "26" },
                  ]}
                >
                  <Ionicons name={statusMeta.icon} size={22} color={colors[statusMeta.colorKey]} />
                </View>
                <View style={styles.statusTextWrap}>
                  <Text style={[styles.statusText, { color: colors[statusMeta.colorKey] }]}>
                    {statusMeta.label}
                  </Text>
                  {status === "pending" && (
                    <Text style={styles.statusSubtext}>
                      We'll notify you as soon as a review is complete.
                    </Text>
                  )}
                  {status === "rejected" && !!notes && (
                    <Text style={styles.statusSubtext}>Reason: {notes}</Text>
                  )}
                </View>
              </View>
            )}

            {canSubmit && (
              <View style={styles.uploadCard}>
                <Text style={styles.uploadLabel}>Government-issued ID</Text>
                <Text style={styles.uploadHint}>
                  A clear photo of your driver's license, passport or national ID.
                </Text>
                <View style={styles.uploadPickerWrap}>
                  <ImagePickerButton
                    imageUri={licenseImage}
                    onImageSelected={setLicenseImage}
                    label="Upload ID"
                    size={140}
                    shape="square"
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {canSubmit && (
            <View style={styles.footer}>
              <PrimaryButton
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting}
                icon="shield-checkmark-outline"
                iconPosition="left"
              >
                Submit for verification
              </PrimaryButton>
            </View>
          )}
        </>
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
    headerTitle: { fontSize: scaleFontSize(22), fontFamily: Fonts.bold, color: c.text },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 32, gap: 20 },
    hero: { alignItems: "center", gap: 12, paddingVertical: 8 },
    heroBadge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    heroTitle: { fontSize: 19, fontFamily: Fonts.bold, color: c.text, textAlign: "center" },
    description: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 20,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    statusCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
    },
    statusIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    statusTextWrap: { flex: 1, gap: 4 },
    statusText: { fontSize: 16, fontFamily: Fonts.semiBold },
    statusSubtext: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted, lineHeight: 18 },
    uploadCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: "dashed",
      padding: 20,
      alignItems: "center",
      gap: 6,
    },
    uploadLabel: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text },
    uploadHint: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 8,
    },
    uploadPickerWrap: { marginTop: 4 },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.background,
    },
  });
