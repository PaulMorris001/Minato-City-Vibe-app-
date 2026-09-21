import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { ImagePickerButton, PrimaryButton } from "@/components/shared";
import StepDoneCard from "@/components/verification/StepDoneCard";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

type VerificationStatus = "none" | "pending" | "approved" | "rejected";

interface IdentityStepProps {
  onContinue: () => void;
}

/** Step 2 of the public-event verification wizard — the same submit flow as
 * /verify-account, inline. Submitting immediately unlocks Continue; the human
 * review itself still takes 24-48 hours. */
export default function IdentityStep({ onContinue }: IdentityStepProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus>("none");
  const [notes, setNotes] = useState("");
  const [licenseImage, setLicenseImage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.get(`${BASE_URL}/verification/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStatus(res.data.status || "none");
        setNotes(res.data.reviewNotes || "");
      } catch {
        // No submission yet — stays "none".
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
      showSuccess("Submitted for review.");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to submit verification");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "approved" || status === "pending") {
    const isApproved = status === "approved";
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <StepDoneCard
            icon={isApproved ? "checkmark" : "time-outline"}
            tint={isApproved ? colors.success : colors.warning}
            tintLight={isApproved ? colors.successLight : colors.warningLight}
            title={isApproved ? "Identity verified" : "Submitted for review"}
            subtitle={
              isApproved
                ? "Your government ID has been verified."
                : "We'll review your ID within 24-48 hours."
            }
          />
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton onPress={onContinue} icon="arrow-forward">
            Continue
          </PrimaryButton>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stepContainer}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Verify your identity</Text>
        <Text style={styles.stepSubtitle}>
          Submit a clear photo of your government-issued ID (driver's license, passport or
          national ID).
        </Text>

        {status === "rejected" && !!notes && (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.noticeText}>Not approved: {notes}</Text>
          </View>
        )}

        <View style={styles.pickerWrap}>
          <ImagePickerButton
            imageUri={licenseImage}
            onImageSelected={setLicenseImage}
            label="Government-issued ID"
            size={140}
            shape="square"
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton onPress={handleSubmit} loading={submitting} icon="shield-checkmark-outline">
          Submit for verification
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
    footer: { paddingTop: 12, paddingBottom: 12 },
    stepTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text },
    stepSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 20 },
    pickerWrap: { alignItems: "center", paddingVertical: 8 },
    noticeCard: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      backgroundColor: c.error + "1A",
      borderWidth: 1,
      borderColor: c.error + "40",
      borderRadius: 12,
      padding: 14,
    },
    noticeText: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 18 },
  });
