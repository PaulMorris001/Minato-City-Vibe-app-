import React, { useState, useRef, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { PrimaryButton } from "@/components/shared";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function VerifyOTP() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Focus the input on mount
    inputRef.current?.focus();
  }, []);

  const handleOtpChange = (value: string) => {
    // Only allow numbers and max 6 digits
    const numericValue = value.replace(/[^0-9]/g, "").slice(0, 6);
    setOtpValue(numericValue);
  };

  const handleVerifyOTP = async () => {
    if (otpValue.length !== 6) {
      Alert.alert("Error", "Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/auth/verify-otp`, {
        email,
        otp: otpValue,
      });

      if (res.data.success) {
        // Navigate to reset password screen
        router.push({
          pathname: "/reset-password",
          params: {
            email,
            resetToken: res.data.resetToken,
          },
        } as any);
      }
    } catch (error: any) {
      let errorMessage = "Failed to verify OTP. Please try again.";

      if (error.response?.status === 400) {
        errorMessage = "Invalid OTP. Please check the code and try again.";
      } else if (error.response?.status === 410) {
        errorMessage = "OTP has expired. Please request a new code.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResending(true);
    try {
      const res = await axios.post(`${BASE_URL}/auth/forgot-password`, {
        email,
      });

      if (res.data.success) {
        // Clear the OTP input
        setOtpValue("");
        inputRef.current?.focus();

        Alert.alert(
          "OTP Sent!",
          "A new verification code has been sent to your email."
        );
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Failed to resend OTP. Please try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setResending(false);
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  // Convert otpValue string to array for display
  const otpDigits = otpValue.split("");

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#a855f7" />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail" size={48} color="#a855f7" />
          </View>
          <Text style={styles.title}>Verify Code</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{"\n"}
            <Text style={styles.emailText}>{email}</Text>
          </Text>
        </View>

        {/* Hidden input that captures the full OTP (for keyboard autofill) */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={otpValue}
          onChangeText={handleOtpChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          caretHidden
        />

        {/* Visual OTP boxes */}
        <Pressable style={styles.otpContainer} onPress={focusInput}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View
              key={index}
              style={[
                styles.otpBox,
                otpDigits[index] ? styles.otpBoxFilled : null,
                otpValue.length === index ? styles.otpBoxFocused : null,
              ]}
            >
              <Text style={styles.otpDigit}>
                {otpDigits[index] || ""}
              </Text>
            </View>
          ))}
        </Pressable>

        <PrimaryButton
          onPress={handleVerifyOTP}
          loading={loading}
          style={styles.verifyButton}
        >
          Verify Code
        </PrimaryButton>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Didn't receive the code? </Text>
          <TouchableOpacity
            onPress={handleResendOTP}
            disabled={resending}
            activeOpacity={0.7}
          >
            <Text style={[styles.link, resending && styles.linkDisabled]}>
              {resending ? "Sending..." : "Resend Code"}
            </Text>
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
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: getResponsivePadding(),
    zIndex: 10,
    padding: 8,
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
  },
  emailText: {
    color: "#a855f7",
    fontWeight: "600",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#1f1f2e",
    borderWidth: 2,
    borderColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  otpBoxFilled: {
    borderColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  otpBoxFocused: {
    borderColor: "#a855f7",
  },
  otpDigit: {
    color: "#fff",
    fontSize: scaleFontSize(24),
    fontWeight: "bold",
    textAlign: "center",
  },
  verifyButton: {
    marginBottom: 24,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(15),
  },
  link: {
    color: "#a855f7",
    fontWeight: "600",
    fontSize: scaleFontSize(15),
  },
  linkDisabled: {
    opacity: 0.5,
  },
});
