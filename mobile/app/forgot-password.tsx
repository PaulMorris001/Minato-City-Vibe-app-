import React, { useState } from "react";
import { useRouter } from "expo-router";
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

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/auth/forgot-password`, {
        email: email.toLowerCase().trim(),
      });

      if (res.data.success) {
        Alert.alert(
          "OTP Sent!",
          "A verification code has been sent to your email. Please check your inbox.",
          [
            {
              text: "OK",
              onPress: () => {
                router.push({
                  pathname: "/verify-otp",
                  params: { email: email.toLowerCase().trim() },
                } as any);
              },
            },
          ]
        );
      }
    } catch (error: any) {
      let errorMessage = "Failed to send OTP. Please try again.";

      if (error.response?.status === 404) {
        errorMessage = "Invalid email. This email is not registered.";
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
            <Ionicons name="lock-closed" size={48} color="#a855f7" />
          </View>
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a verification code to
            reset your password.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
          />

          <PrimaryButton
            onPress={handleSendOTP}
            loading={loading}
            style={styles.sendButton}
          >
            Send Verification Code
          </PrimaryButton>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Remember your password?{" "}
            <Text style={styles.link} onPress={() => router.back()}>
              Back to Login
            </Text>
          </Text>
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
    paddingHorizontal: 20,
  },
  form: {
    marginBottom: 30,
  },
  sendButton: {
    marginTop: 10,
  },
  footer: {
    alignItems: "center",
  },
  footerText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(15),
  },
  link: {
    color: "#a855f7",
    fontWeight: "600",
  },
});
