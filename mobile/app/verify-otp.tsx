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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { PrimaryButton } from "@/components/shared";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function VerifyOTP() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    // Focus the first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleOtpChange = (value: string, index: number) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Handle backspace
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async () => {
    const otpCode = otp.join("");

    if (otpCode.length !== 6) {
      Alert.alert("Error", "Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/auth/verify-otp`, {
        email,
        otp: otpCode,
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
        // Clear the OTP inputs
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();

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

        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.otpInput,
                digit ? styles.otpInputFilled : null,
              ]}
              value={digit}
              onChangeText={(value) => handleOtpChange(value, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

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
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#1f1f2e",
    borderWidth: 2,
    borderColor: "#374151",
    color: "#fff",
    fontSize: scaleFontSize(24),
    fontWeight: "bold",
    textAlign: "center",
  },
  otpInputFilled: {
    borderColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
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
