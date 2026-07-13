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

import { BASE_URL } from "@/constants/constants";
import { capitalize } from "@/libs/helpers";
import { useAccount } from "@/contexts/AccountContext";
import { configureGoogleSignIn, signInWithGoogleWeb } from "@/utils/googleAuth";
import { isAppleAuthAvailable, signInWithApple } from "@/utils/appleAuth";
import { registerForPushNotifications } from "@/utils/pushNotifications";
import { remoteLog } from "@/utils/remoteLog";
import { AU } from "@/components/auth/tokens";

import { darkColors, type ThemeColors } from "@/constants/theme";
// `isUnexpectedAuthError` decides whether a sign-in failure deserves a
// Sentry alert vs. just a Render log. The rule of thumb: anything we can
// explain (user cancel, expected server-side rejection, missing entitlement)
// stays in Render; anything that looks like a real bug or unreachable server
// escalates. Keep this in sync with the messages thrown from googleAuth.ts /
// appleAuth.ts and the server's web-callback error params.
const KNOWN_USER_FACING_ERRORS = [
  "cancel",
  "account has been suspended",
  "session expired",
  "isn't enabled for this build",
  "couldn't process the request",
  "couldn't open",
];
function isExpectedAuthError(error: any): boolean {
  // Apple cancel
  if (error?.code === "ERR_REQUEST_CANCELED") return true;
  const msg = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (!msg) return false;
  return KNOWN_USER_FACING_ERRORS.some((needle) => msg.includes(needle));
}

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
    remoteLog("info", "google.handler tapped", {
      platform: Platform.OS,
      baseUrl: BASE_URL,
    });

    try {
      // Web-based OAuth via WebBrowser → server callback → mobile:// deep link.
      // Replaces the native GoogleSignin SDK call that's broken in the
      // shipped binary (placeholder iOS URL scheme + missing Android OAuth
      // client). The server returns our JWT + user in the deep-link params.
      const { token, user } = await signInWithGoogleWeb();
      remoteLog("info", "google.handler success", {
        userId: user.id,
        isVendor: user.isVendor,
        elapsedMs: Date.now() - startedAt,
      });
      await finishAuth(user, token);
    } catch (error: any) {
      if (isExpectedAuthError(error)) {
        // User cancel or known server-side rejection — log and move on.
        remoteLog("info", "google.handler expected failure", {
          platform: Platform.OS,
          message: error?.message,
        });
        // Cancel is silent; surface known errors with the message they threw.
        const cancelled = error?.message?.toLowerCase().includes("cancel");
        if (!cancelled) Alert.alert("Sign-in failed", error.message);
      } else {
        // Genuine unexpected failure → user sees an alert AND we Sentry.
        remoteLog(
          "error",
          "google.handler unexpected failure",
          { platform: Platform.OS, message: error?.message },
          error
        );
        // Lazy import keeps Sentry off the hot path of the common success
        // case (and out of pre-init code paths if Sentry was deferred).
        const Sentry = require("@sentry/react-native");
        Sentry.captureException(error, {
          tags: { action: "google.handleSignIn", platform: Platform.OS },
        });
        Alert.alert(
          "Error",
          typeof error?.message === "string" && error.message
            ? error.message
            : "Google sign-in failed. Please try again."
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (busy) return;
    setAppleLoading(true);
    const startedAt = Date.now();
    remoteLog("info", "apple.handler tapped", {
      platform: Platform.OS,
      baseUrl: BASE_URL,
    });

    try {
      const { identityToken, fullName, email } = await signInWithApple();
      remoteLog("info", "apple.handler got credential", {
        identityTokenLen: identityToken.length,
        hasEmail: !!email,
        hasFullName: !!fullName,
        elapsedMs: Date.now() - startedAt,
      });

      let res;
      try {
        res = await axios.post(`${BASE_URL}/apple-auth`, {
          identityToken,
          fullName,
          email,
        });
      } catch (httpErr: any) {
        const status = httpErr?.response?.status;
        const errData = {
          platform: Platform.OS,
          isAxios: !!httpErr?.isAxiosError,
          code: httpErr?.code,
          message: httpErr?.message,
          status,
          serverMessage: httpErr?.response?.data?.message,
          serverDetails: httpErr?.response?.data?.details,
          url: `${BASE_URL}/apple-auth`,
          elapsedMs: Date.now() - startedAt,
        };
        // 4xx is the server saying "no" politely — log to Render. Network
        // failure or 5xx is unexpected — escalate.
        const expected = status && status >= 400 && status < 500;
        remoteLog(
          expected ? "warn" : "error",
          "apple.handler server post failed",
          errData,
          httpErr
        );
        if (!expected) {
          const Sentry = require("@sentry/react-native");
          Sentry.captureException(httpErr, {
            tags: { action: "apple.serverPost", platform: Platform.OS },
            contexts: { apple: errData },
          });
        }
        throw httpErr;
      }

      remoteLog("info", "apple.handler success", {
        userId: res.data?.user?.id,
        isVendor: res.data?.user?.isVendor,
        elapsedMs: Date.now() - startedAt,
      });
      await finishAuth(res.data.user, res.data.token);
    } catch (error: any) {
      // Apple throws ERR_REQUEST_CANCELED when the user dismisses the sheet —
      // silent (already logged at info level inside signInWithApple).
      if (error?.code === "ERR_REQUEST_CANCELED") return;

      const friendly =
        error?.response?.data?.message ||
        (error?.code === "ERR_REQUEST_NOT_HANDLED"
          ? "Sign in with Apple isn't enabled for this build. Please update the app."
          : error?.code === "ERR_REQUEST_FAILED"
          ? "Apple couldn't process the request. Check your connection and try again."
          : error?.code === "ERR_REQUEST_NOT_INTERACTIVE"
          ? "Apple sign-in couldn't open. Please try again."
          : error?.message ||
            "Apple sign-in failed. Please try again.");
      Alert.alert("Error", friendly);
      // Sentry is only invoked from the inner HTTP catch (for 5xx/network)
      // — Apple SDK errors are environment problems, not bugs in our code.
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

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    backgroundColor: c.glassFillSubtle,
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
    backgroundColor: c.primaryFaded,
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

// Auth/poster surface: always renders the dark palette.
const styles = createStyles(darkColors);
