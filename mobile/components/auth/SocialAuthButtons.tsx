import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";

import { BASE_URL } from "@/constants/constants";
import { capitalize } from "@/libs/helpers";
import { useAccount } from "@/contexts/AccountContext";
import { configureGoogleSignIn, signInWithGoogleWeb } from "@/utils/googleAuth";
import { isAppleAuthAvailable, signInWithApple } from "@/utils/appleAuth";
import { registerForPushNotifications } from "@/utils/pushNotifications";
import { AU } from "@/components/auth/tokens";

/**
 * OR divider + "Continue with Apple / Google" buttons, shared between the login
 * and signup screens. Handles the full OAuth flow: token exchange with the
 * backend, secure storage, push registration, the vendor role picker, and
 * navigation. Apple is shown on supported iOS devices only.
 */
export function SocialAuthButtons() {
  const router = useRouter();
  const { setActiveAccount } = useAccount();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  const busy = googleLoading || appleLoading;

  useEffect(() => {
    configureGoogleSignIn();
    if (Platform.OS === "ios") {
      isAppleAuthAvailable().then(setAppleAvailable);
    }
  }, []);

  const finishAuth = async (user: any, token: string) => {
    await SecureStore.setItemAsync("token", token);
    await SecureStore.setItemAsync("user", JSON.stringify(user));
    registerForPushNotifications();
    if (user.isVendor) {
      setUserData(user);
      setShowRolePicker(true);
    } else {
      await setActiveAccount("client");
      router.replace("/(tabs)/home");
    }
  };

  const selectRole = async (role: "client" | "vendor") => {
    setShowRolePicker(false);
    await setActiveAccount(role);
    if (role === "vendor") router.replace("/(vendor)/dashboard");
    else router.replace("/(tabs)/home");
  };

  const handleGoogleSignIn = async () => {
    if (busy) return;
    setGoogleLoading(true);
    const startedAt = Date.now();
    Sentry.addBreadcrumb({
      category: "auth.google",
      message: "handleGoogleSignIn: tapped (web flow)",
      level: "info",
      data: { platform: Platform.OS, baseUrl: BASE_URL },
    });
    console.log("[SocialAuth] handleGoogleSignIn: tapped (web flow)", {
      platform: Platform.OS,
    });

    try {
      // Web-based OAuth via WebBrowser → server callback → mobile:// deep link.
      // Replaces the native GoogleSignin SDK call that's broken in the
      // shipped binary (placeholder iOS URL scheme + missing Android OAuth
      // client). The server returns our JWT + user in the deep-link params.
      const { token, user } = await signInWithGoogleWeb();
      console.log("[SocialAuth] web sign-in OK", {
        userId: user.id,
        isVendor: user.isVendor,
        elapsedMs: Date.now() - startedAt,
      });
      Sentry.addBreadcrumb({
        category: "auth.google",
        message: "web sign-in OK",
        level: "info",
        data: { userId: user.id },
      });
      await finishAuth(user, token);
    } catch (error: any) {
      const cancelled =
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("cancel");

      if (!cancelled) {
        console.warn("[SocialAuth] Google sign-in failed", {
          platform: Platform.OS,
          message: error?.message,
        });
        Sentry.captureException(error, {
          tags: { action: "google.handleSignIn", platform: Platform.OS },
        });
        Alert.alert(
          "Error",
          typeof error?.message === "string" && error.message
            ? error.message
            : "Google sign-in failed. Please try again."
        );
      } else {
        console.log("[SocialAuth] Google sign-in cancelled by user");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (busy) return;
    setAppleLoading(true);
    try {
      const { identityToken, fullName, email } = await signInWithApple();
      const res = await axios.post(`${BASE_URL}/apple-auth`, {
        identityToken,
        fullName,
        email,
      });
      await finishAuth(res.data.user, res.data.token);
    } catch (error: any) {
      // Apple throws ERR_REQUEST_CANCELED when the user dismisses the sheet.
      if (error?.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert(
          "Error",
          error.response?.data?.message ||
            "Apple sign-in failed. Please try again."
        );
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialRow}>
        {appleAvailable && (
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleAppleSignIn}
            activeOpacity={0.7}
            disabled={busy}
            accessibilityLabel="Continue with Apple"
          >
            {appleLoading ? (
              <ActivityIndicator color={AU.text} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={18} color={AU.text} />
                <Text style={styles.socialLabel}>Apple</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.socialBtn}
          onPress={handleGoogleSignIn}
          activeOpacity={0.7}
          disabled={busy}
          accessibilityLabel="Continue with Google"
        >
          {googleLoading ? (
            <ActivityIndicator color={AU.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={AU.text} />
              <Text style={styles.socialLabel}>Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Vendor accounts choose how to continue after OAuth */}
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
    </>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  socialLabel: {
    color: AU.text,
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
  },
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
