import React, { useState, useEffect } from "react";
import { Link, useRouter } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import * as SecureStore from "expo-secure-store";
import { capitalize } from "@/libs/helpers";
import { FormInput, PrimaryButton } from "@/components/shared";
import { useAccount } from "@/contexts/AccountContext";
import { configureGoogleSignIn, signInWithGoogle } from "@/utils/googleAuth";

export default function Login() {
  const router = useRouter();
  const { setActiveAccount } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    // Configure Google Sign-In on component mount
    configureGoogleSignIn();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      console.log("Attempting login to:", `${BASE_URL}/login`);
      console.log("Email:", email);

      const res = await axios.post(`${BASE_URL}/login`, {
        email,
        password,
      });

      console.log("Login response:", res.data);
      const user = res.data.user;
      const token = res.data.token;

      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));

      // If user is a vendor, show role picker
      if (user.isVendor) {
        setUserData(user);
        setShowRolePicker(true);
        setLoading(false);
      } else {
        // Regular client, go directly to home
        await setActiveAccount("client");
        router.replace("/(tabs)/home");
      }
    } catch (error: any) {
      console.error("Login error details:");
      console.error("Error message:", error.message);
      console.error("Error code:", error.code);
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
      console.error("Request URL:", error.config?.url);

      let errorMessage = "Login failed. Please try again.";

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = `Cannot connect to server at ${BASE_URL}. Make sure the backend is running.`;
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        errorMessage = "Connection timeout. Check your network connection.";
      } else if (error.message.includes('Network Error')) {
        errorMessage = `Network error. Cannot reach ${BASE_URL}. Check if backend is running and accessible.`;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert("Error", errorMessage);
      setLoading(false);
    }
  };

  const selectRole = async (role: "client" | "vendor") => {
    setShowRolePicker(false);

    // Set the active account in context
    await setActiveAccount(role);

    if (role === "vendor") {
      router.replace("/(vendor)/dashboard");
    } else {
      router.replace("/(tabs)/home");
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

      // If user is a vendor, show role picker
      if (user.isVendor) {
        setUserData(user);
        setShowRolePicker(true);
        setGoogleLoading(false);
      } else {
        // Regular client, go directly to home
        await setActiveAccount("client");
        router.replace("/(tabs)/home");
      }
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
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>NightVibe</Text>
          <Text style={styles.subtitle}>Welcome Back</Text>
        </View>

        <View style={styles.form}>
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
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry
          />

          <PrimaryButton
            onPress={handleLogin}
            loading={loading}
            style={styles.loginButton}
          >
            Log In
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
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={styles.link}>
              Sign up
            </Link>
          </Text>
        </View>
      </View>

      {/* Role Picker Modal */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="person-circle" size={48} color="#a855f7" />
              <Text style={styles.modalTitle}>Choose Account</Text>
              <Text style={styles.modalSubtitle}>
                Welcome back, {capitalize(userData?.username)}!
              </Text>
            </View>

            <TouchableOpacity
              style={styles.roleButton}
              onPress={() => selectRole("client")}
            >
              <View style={styles.roleIconContainer}>
                <Ionicons name="person" size={32} color="#a855f7" />
              </View>
              <View style={styles.roleInfo}>
                <Text style={styles.roleTitle}>Continue as Client</Text>
                <Text style={styles.roleDescription}>
                  Browse vendors and book services
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.roleButton}
              onPress={() => selectRole("vendor")}
            >
              <View style={styles.roleIconContainer}>
                <Ionicons name="briefcase" size={32} color="#a855f7" />
              </View>
              <View style={styles.roleInfo}>
                <Text style={styles.roleTitle}>Continue as Vendor</Text>
                <Text style={styles.roleDescription}>
                  Manage your business and services
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    padding: 24,
  },
  header: {
    marginBottom: 40,
  },
  logo: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#a855f7",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#9ca3af",
    textAlign: "center",
  },
  form: {
    marginBottom: 30,
  },
  loginButton: {
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
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    marginTop: 24,
  },
  footerText: {
    color: "#9ca3af",
    fontSize: 15,
  },
  link: {
    color: "#a855f7",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 16,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
  },
  roleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f1a",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#374151",
  },
  roleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  roleInfo: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 14,
    color: "#9ca3af",
  },
});
