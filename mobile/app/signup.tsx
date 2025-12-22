import { Link, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    // Configure Google Sign-In on component mount
    configureGoogleSignIn();
  }, []);

  const handleSignup = async () => {
    if (!username || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
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

      const errorMessage =
        error.response?.data?.message || "Signup failed. Please try again.";
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

            <FormInput
              label="Password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <PrimaryButton
              onPress={handleSignup}
              loading={loading}
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
});
