import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";

import { BASE_URL } from "@/constants/constants";
import { capitalize } from "@/libs/helpers";
import { useAccount } from "@/contexts/AccountContext";
import { configureGoogleSignIn, signInWithGoogle } from "@/utils/googleAuth";
import { registerForPushNotifications } from "@/utils/pushNotifications";
import { PosterBackground } from "@/components/auth/PosterBackground";
import {
  GlassRoundButton,
  GradientAccent,
  LiveDot,
  PrimaryCTA,
  Wordmark,
} from "@/components/auth/AuthPrimitives";
import { AU } from "@/components/auth/tokens";

export default function Login() {
  const router = useRouter();
  const { setActiveAccount } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  const ctaEnabled = email.trim().length > 0 && password.length > 0;

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      Sentry.addBreadcrumb({
        category: "auth",
        message: "Login attempt",
        level: "info",
        data: { email },
      });
      const res = await axios.post(`${BASE_URL}/login`, { email, password });
      const user = res.data.user;
      const token = res.data.token;

      Sentry.setUser({ id: user._id, email: user.email, username: user.username });

      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));
      registerForPushNotifications();

      if (user.isVendor) {
        setUserData(user);
        setShowRolePicker(true);
        setLoading(false);
      } else {
        await setActiveAccount("client");
        router.replace("/(tabs)/home");
      }
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { action: "login" },
        contexts: {
          login: { email, statusCode: error.response?.status },
          response: { status: error.response?.status, data: error.response?.data },
        },
      });

      let msg = "Login failed. Please try again.";
      const status = error.response?.status;
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND")
        msg = "Cannot connect to server.";
      else if (error.message?.includes("Network Error"))
        msg = "No internet connection.";
      else if (status === 401) msg = "Incorrect email or password.";
      else if (status === 404)
        msg = "No account found with that email. Did you mean to sign up?";
      else if (status === 403)
        msg = "Your account has been suspended. Contact Support@nvibez.com.";
      else if (status === 429) msg = "Too many attempts. Try again in a few minutes.";
      else if (status >= 500) msg = "Server error. Try again later.";
      else if (error.response?.data?.message) msg = error.response.data.message;

      Alert.alert("Login failed", msg);
      setLoading(false);
    }
  };

  const selectRole = async (role: "client" | "vendor") => {
    setShowRolePicker(false);
    await setActiveAccount(role);
    if (role === "vendor") router.replace("/(vendor)/dashboard");
    else router.replace("/(tabs)/home");
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const userInfo = await signInWithGoogle();
      if (!userInfo.data?.idToken && !userInfo.data?.accessToken) {
        throw new Error("No token received from Google");
      }
      const res = await axios.post(`${BASE_URL}/google-auth`, {
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.accessToken,
      });
      const user = res.data.user;
      const token = res.data.token;
      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));
      registerForPushNotifications();
      if (user.isVendor) {
        setUserData(user);
        setShowRolePicker(true);
        setGoogleLoading(false);
      } else {
        await setActiveAccount("client");
        router.replace("/(tabs)/home");
      }
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message || "Google sign-in failed. Please try again."
      );
      setGoogleLoading(false);
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/signup");
  };

  return (
    <View style={styles.container}>
      <PosterBackground />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Wordmark />
              <GlassRoundButton icon="close" onPress={handleClose} />
            </View>

            <View style={{ flex: 1 }} />

            <View style={styles.bottomBlock}>
              {/* Live stat pill */}
              <View style={styles.statPill}>
                <LiveDot />
                <Text style={styles.statText}>312 events live in NYC tonight</Text>
              </View>

              <Text style={styles.headline}>
                Welcome{"\n"}
                <GradientAccent style={styles.headline}>back, regular.</GradientAccent>
              </Text>
              <Text style={styles.subhint}>
                Your friends are already RSVP'ing. Let's catch up.
              </Text>

              {/* Glassy form card */}
              <View style={styles.card}>
                <View style={styles.field}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>EMAIL OR USERNAME</Text>
                  </View>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@mail.com"
                    placeholderTextColor={AU.textMute}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    style={styles.fieldInput}
                  />
                </View>

                <View style={styles.field}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>PASSWORD</Text>
                  </View>
                  <View style={styles.passwordRow}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={AU.textMute}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="password"
                      style={[styles.fieldInput, { flex: 1 }]}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      activeOpacity={0.7}
                      hitSlop={8}
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={AU.textMute}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <PrimaryCTA
                  label="Log in"
                  onPress={handleLogin}
                  loading={loading}
                  variant={ctaEnabled ? "primary" : "disabled"}
                  height={52}
                  style={{ borderRadius: 14, marginTop: 4 }}
                />

                <TouchableOpacity
                  onPress={() => router.push("/forgot-password")}
                  activeOpacity={0.7}
                  style={styles.forgotRow}
                  hitSlop={8}
                >
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>

                {/* OR divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Social buttons */}
                <View style={styles.socialRow}>
                  <TouchableOpacity
                    style={styles.socialBtn}
                    onPress={() =>
                      Alert.alert("Coming soon", "Sign in with Apple isn't ready yet.")
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons name="logo-apple" size={18} color={AU.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.socialBtn}
                    onPress={() =>
                      Alert.alert("Coming soon", "Sign in with Google isn't ready yet.")
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons name="logo-google" size={18} color={AU.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.socialBtn}
                    onPress={() =>
                      Alert.alert("Coming soon", "Sign in with X isn't ready yet.")
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.socialX}>𝕏</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.footerText}>
                New to NightVibe?{" "}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.replace("/signup")}
                >
                  Create an account
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Role picker modal — kept as-is, themed lightly to the new palette */}
      <Modal
        visible={showRolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRolePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="person-circle" size={48} color={AU.purpleSoft} />
              <Text style={styles.modalTitle}>Choose Account</Text>
              <Text style={styles.modalSubtitle}>
                Welcome back, {capitalize(userData?.username)}!
              </Text>
            </View>
            <TouchableOpacity
              style={styles.roleButton}
              onPress={() => selectRole("client")}
            >
              <View style={styles.roleIcon}>
                <Ionicons name="person" size={28} color={AU.purpleSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>Continue as Client</Text>
                <Text style={styles.roleDescription}>
                  Browse vendors and book services
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={AU.textMute} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.roleButton}
              onPress={() => selectRole("vendor")}
            >
              <View style={styles.roleIcon}>
                <Ionicons name="briefcase" size={28} color={AU.purpleSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>Continue as Vendor</Text>
                <Text style={styles.roleDescription}>
                  Manage your business and services
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={AU.textMute} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  scrollContent: { flexGrow: 1 },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomBlock: { paddingHorizontal: 22, paddingBottom: 24 },
  statPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: AU.stroke,
    marginBottom: 16,
  },
  statText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 11,
    color: AU.text,
    letterSpacing: 0.44,
  },
  headline: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 44,
    lineHeight: 44 * 0.94,
    letterSpacing: -1.54,
    color: AU.text,
  },
  subhint: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    color: AU.textDim,
    marginTop: 10,
    maxWidth: 280,
  },
  card: {
    marginTop: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(26,16,48,0.78)",
    borderWidth: 1,
    borderColor: AU.stroke,
    gap: 10,
  },
  field: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: AU.textMute,
    letterSpacing: 0.8,
  },
  forgotLink: {
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
    color: AU.purpleSoft,
  },
  forgotRow: {
    alignSelf: "center",
    paddingVertical: 8,
    marginTop: 2,
  },
  fieldInput: {
    fontFamily: "Outfit_500Medium",
    fontSize: 15,
    color: AU.text,
    marginTop: 4,
    paddingVertical: 0,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 4,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: AU.stroke },
  dividerText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 10,
    color: AU.textMute,
    letterSpacing: 1.2,
  },
  socialRow: { flexDirection: "row", gap: 8 },
  socialBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  socialX: {
    color: AU.text,
    fontSize: 18,
    fontFamily: "Outfit_700Bold",
  },
  footerText: {
    textAlign: "center",
    marginTop: 18,
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: AU.textDim,
  },
  footerLink: { color: AU.purpleSoft, fontFamily: "Outfit_700Bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    backgroundColor: AU.surface,
    borderWidth: 1,
    borderColor: AU.stroke,
  },
  modalHeader: { alignItems: "center", marginBottom: 24 },
  modalTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: AU.text,
    marginTop: 12,
  },
  modalSubtitle: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: AU.textDim,
    marginTop: 4,
  },
  roleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: AU.bg,
    borderWidth: 1,
    borderColor: AU.stroke,
    marginBottom: 12,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: AU.text,
  },
  roleDescription: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: AU.textDim,
    marginTop: 2,
  },
});
