import { Link, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import * as SecureStore from "expo-secure-store";
import { FormInput, PrimaryButton } from "@/components/shared";
import { configureGoogleSignIn, signInWithGoogle } from "@/utils/googleAuth";
import * as Sentry from "@sentry/react-native";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    // Configure Google Sign-In on component mount
    configureGoogleSignIn();
  }, []);

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (password && value && value !== password) {
      setPasswordError("Passwords don't match");
    } else {
      setPasswordError("");
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (confirmPassword && value !== confirmPassword) {
      setPasswordError("Passwords don't match");
    } else {
      setPasswordError("");
    }
  };

  const handleSignup = async () => {
    if (!username || !email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }
    if (!termsAccepted) {
      Alert.alert(
        "Agreement required",
        "Please agree to the Terms of Service and Privacy Policy to continue."
      );
      return;
    }

    setLoading(true);
    try {
      // Add breadcrumb for tracking user flow
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'Signup attempt',
        level: 'info',
        data: { email, username, apiUrl: BASE_URL }
      });

      const res = await axios.post(`${BASE_URL}/register`, {
        username,
        email,
        password,
        termsAccepted: true,
      });

      const user = res.data.user;
      const token = res.data.token;

      // Set user context in Sentry
      Sentry.setUser({
        id: user._id,
        email: user.email,
        username: user.username,
      });

      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));

      // Always redirect to home (everyone starts as a client)
      router.replace("/(tabs)/home");
    } catch (error: any) {
      // Capture error in Sentry with context
      Sentry.captureException(error, {
        tags: {
          action: 'signup',
          email: email,
        },
        contexts: {
          signup: {
            email: email,
            username: username,
            apiUrl: BASE_URL,
            statusCode: error.response?.status,
            errorCode: error.code,
          },
          response: {
            status: error.response?.status,
            data: error.response?.data,
          }
        },
        level: 'error',
      });

      let errorMessage = "Signup failed. Please try again.";

      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        errorMessage = "Cannot connect to server. Make sure you're connected to the internet.";
      } else if (error.code === "ETIMEDOUT" || error.message.includes("timeout")) {
        errorMessage = "Connection timed out. Check your network and try again.";
      } else if (error.message.includes("Network Error")) {
        errorMessage = "No internet connection. Please check your network and try again.";
      } else if (error.response?.status === 409) {
        const msg: string = error.response.data?.message ?? "";
        if (msg.toLowerCase().includes("username")) {
          errorMessage = "That username is already taken. Please choose a different one.";
        } else if (msg.toLowerCase().includes("email")) {
          errorMessage = "An account with that email already exists. Try logging in instead.";
        } else {
          errorMessage = "An account with those details already exists.";
        }
      } else if (error.response?.status === 400) {
        const msg: string = error.response.data?.message ?? "";
        if (msg.toLowerCase().includes("password")) {
          errorMessage = "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
        } else if (msg.toLowerCase().includes("email")) {
          errorMessage = "Please enter a valid email address.";
        } else if (msg.toLowerCase().includes("username")) {
          errorMessage = "Username can only contain letters, numbers, and underscores.";
        } else {
          errorMessage = error.response.data?.message || "Invalid details. Please check your information.";
        }
      } else if (error.response?.status === 429) {
        errorMessage = "Too many signup attempts. Please wait a few minutes and try again.";
      } else if (error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const userInfo = await signInWithGoogle();

      if (!userInfo.data?.idToken && !userInfo.data?.accessToken) {
        throw new Error("No token received from Google");
      }

      // Send the ID token or access token to your backend
      const res = await axios.post(`${BASE_URL}/google-auth`, {
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.accessToken,
      });

      const user = res.data.user;
      const token = res.data.token;

      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));

      // Always redirect to home (everyone starts as a client)
      router.replace("/(tabs)/home");
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || "Google sign-in failed. Please try again.";
      Alert.alert("Error", errorMessage);
      console.error("Google Sign-In Error:", error.response?.data || error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.logo}>NightVibe</Text>
            <Text style={styles.subtitle}>Create Your Account</Text>
          </View>

          <View style={styles.form}>
            <FormInput
              label="Username"
              placeholder="Choose a username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />

            <FormInput
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {/* Password */}
            <View style={styles.passwordContainer}>
              <Text style={styles.passwordLabel}>Password</Text>
              <View style={[styles.passwordRow, passwordError ? styles.passwordRowError : null]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Create a password"
                  placeholderTextColor="#6b7280"
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.passwordContainer}>
              <Text style={styles.passwordLabel}>Confirm Password</Text>
              <View style={[styles.passwordRow, passwordError ? styles.passwordRowError : null]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#6b7280"
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
              {passwordError ? (
                <Text style={styles.passwordError}>{passwordError}</Text>
              ) : null}
            </View>

            <View style={styles.termsRow}>
              <TouchableOpacity
                onPress={() => setTermsAccepted((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
                accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
              >
                {termsAccepted ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : null}
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I agree to the{" "}
                <Text style={styles.termsLink} onPress={() => router.push("/terms" as any)}>
                  Terms of Service
                </Text>
                {" "}and{" "}
                <Text style={styles.termsLink} onPress={() => router.push("/privacy" as any)}>
                  Privacy Policy
                </Text>
                . NightVibe has zero tolerance for objectionable content or
                abusive users.
              </Text>
            </View>

            <PrimaryButton
              onPress={handleSignup}
              loading={loading}
              disabled={!termsAccepted}
              style={styles.signupButton}
            >
              Sign Up
            </PrimaryButton>

            {/* <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#1f2937", "#374151"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.googleGradient}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={24} color="#fff" />
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity> */}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already have an account?{" "}
              <Link href="/login" style={styles.link}>
                Log in
              </Link>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: getResponsivePadding(),
  },
  header: {
    marginBottom: 40,
  },
  logo: {
    fontSize: scaleFontSize(42),
    fontWeight: "bold",
    color: "#a855f7",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: scaleFontSize(18),
    color: "#9ca3af",
    textAlign: "center",
  },
  form: {
    marginBottom: 30,
  },
  signupButton: {
    marginTop: 10,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#374151",
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#9ca3af",
    fontSize: scaleFontSize(14),
    fontWeight: "600",
  },
  googleButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  googleGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 12,
  },
  googleButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontWeight: "600",
  },
  passwordContainer: {
    marginBottom: 20,
  },
  passwordLabel: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: 8,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 14,
  },
  passwordRowError: {
    borderColor: "#ef4444",
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#fff",
  },
  eyeButton: {
    paddingLeft: 8,
  },
  passwordError: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  },
  footer: {
    alignItems: "center",
    marginTop: 24,
  },
  footerText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(15),
  },
  link: {
    color: "#a855f7",
    fontWeight: "600",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
    marginBottom: 4,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#6b7280",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  termsText: {
    flex: 1,
    color: "#9ca3af",
    fontSize: scaleFontSize(13),
    lineHeight: 18,
  },
  termsLink: {
    color: "#a855f7",
    fontWeight: "600",
  },
});
