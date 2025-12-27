import React, { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
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

export default function ResetPassword() {
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

    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters long");
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
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="key" size={48} color="#a855f7" />
          </View>
          <Text style={styles.title}>Create New Password</Text>
          <Text style={styles.subtitle}>
            Your new password must be different from previously used passwords.
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
            <View style={styles.requirementItem}>
              <Ionicons
                name={newPassword.length >= 6 ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={newPassword.length >= 6 ? "#10b981" : "#6b7280"}
              />
              <Text
                style={[
                  styles.requirementText,
                  newPassword.length >= 6 && styles.requirementMet,
                ]}
              >
                At least 6 characters
              </Text>
            </View>
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
                    ? "#10b981"
                    : "#6b7280"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: getResponsivePadding(),
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: scaleFontSize(28),
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: scaleFontSize(15),
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  form: {
    marginBottom: 30,
  },
  passwordRequirements: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  requirementsTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#e5e7eb",
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
    color: "#6b7280",
  },
  requirementMet: {
    color: "#10b981",
  },
  resetButton: {
    marginTop: 10,
  },
  footer: {
    alignItems: "center",
  },
  link: {
    color: "#a855f7",
    fontWeight: "600",
    fontSize: scaleFontSize(15),
  },
});
