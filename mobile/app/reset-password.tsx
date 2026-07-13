import React, { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { FormInput, PrimaryButton } from "@/components/shared";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import { passwordChecks, passwordError } from "@/utils/passwordPolicy";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function ResetPassword() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { email, resetToken } = useLocalSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const pwErr = passwordError(newPassword);
    if (pwErr) {
      Alert.alert("Error", pwErr);
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/auth/reset-password`, {
        email,
        resetToken,
        newPassword,
      });

      if (res.data.success) {
        Alert.alert(
          "Success!",
          "Your password has been reset successfully. You can now log in with your new password.",
          [
            {
              text: "OK",
              onPress: () => {
                router.replace("/login");
              },
            },
          ]
        );
      }
    } catch (error: any) {
      let errorMessage = "Failed to reset password. Please try again.";

      if (error.response?.status === 400) {
        errorMessage = "Invalid or expired reset token. Please request a new password reset.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <GlassBackButton style={styles.backButton} />
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="key" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>Create New Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password with at least 8 characters, including upper
            and lower case letters, a number, and a symbol.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="New Password"
            placeholder="Enter new password"
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
            secureTextEntry
            autoFocus
          />

          <FormInput
            label="Confirm Password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            secureTextEntry
          />

          <View style={styles.passwordRequirements}>
            <Text style={styles.requirementsTitle}>Password Requirements:</Text>
            {passwordChecks(newPassword).map((c) => (
              <View key={c.key} style={styles.requirementItem}>
                <Ionicons
                  name={c.met ? "checkmark-circle" : "ellipse-outline"}
                  size={16}
                  color={c.met ? colors.success : colors.textMuted}
                />
                <Text style={[styles.requirementText, c.met && styles.requirementMet]}>
                  {c.label}
                </Text>
              </View>
            ))}
            <View style={styles.requirementItem}>
              <Ionicons
                name={
                  newPassword && confirmPassword && newPassword === confirmPassword
                    ? "checkmark-circle"
                    : "ellipse-outline"
                }
                size={16}
                color={
                  newPassword && confirmPassword && newPassword === confirmPassword
                    ? colors.success
                    : colors.textMuted
                }
              />
              <Text
                style={[
                  styles.requirementText,
                  newPassword &&
                    confirmPassword &&
                    newPassword === confirmPassword &&
                    styles.requirementMet,
                ]}
              >
                Passwords match
              </Text>
            </View>
          </View>

          <PrimaryButton
            onPress={handleResetPassword}
            loading={loading}
            style={styles.resetButton}
          >
            Reset Password
          </PrimaryButton>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => router.replace("/login")}
            activeOpacity={0.7}
          >
            <Text style={styles.link}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: getResponsivePadding(),
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: getResponsivePadding(),
    padding: 4,
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.primaryFaded,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: scaleFontSize(28),
    fontWeight: "bold",
    color: c.text,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: scaleFontSize(15),
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  form: {
    marginBottom: 30,
  },
  passwordRequirements: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  requirementsTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: c.textBody,
    marginBottom: 12,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  requirementText: {
    fontSize: scaleFontSize(14),
    color: c.textMuted,
  },
  requirementMet: {
    color: c.success,
  },
  resetButton: {
    marginTop: 10,
  },
  footer: {
    alignItems: "center",
  },
  link: {
    color: c.primary,
    fontWeight: "600",
    fontSize: scaleFontSize(15),
  },
});
