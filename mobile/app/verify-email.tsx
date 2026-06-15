import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { AU } from "@/components/auth/tokens";
import { GlassRoundButton, PrimaryCTA } from "@/components/auth/AuthPrimitives";

const LEN = 6;
const RESEND_SECONDS = 30;

/**
 * Verify email from Settings.
 *
 * Distinct from /verify-signup-email (the signup-flow screen): no ToS gate,
 * no "Create account" CTA, no FINAL STEP framing. On mount we fire a fresh
 * resend so the user actually gets an email — the previous flow assumed an
 * OTP was already in flight from signup, which broke for anyone returning
 * later from Settings.
 *
 * On success we go back to Settings (not Home) so the user lands where they
 * came from with the new verified state reflected in the section.
 */
export default function VerifyEmail() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [sendingInitial, setSendingInitial] = useState(true);
  const [initialSendError, setInitialSendError] = useState<string | null>(null);
  const hiddenRef = useRef<TextInput>(null);

  const authHeaders = async () => {
    const token = await SecureStore.getItemAsync("token");
    return { Authorization: `Bearer ${token}` };
  };

  // Load the user's email so we can show "code sent to maya@mail.com"
  useEffect(() => {
    (async () => {
      try {
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          setEmail(u.email || "");
        }
      } catch {
        // Non-fatal — email line just won't show.
      }
    })();
  }, []);

  // Fire a fresh OTP on mount. Previously the screen just sat there waiting
  // for a code that was never sent (or had expired since signup).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.post(
          `${BASE_URL}/auth/resend-signup-otp`,
          {},
          { headers: await authHeaders() }
        );
        if (cancelled) return;
        if (res.data?.success) {
          setResendIn(RESEND_SECONDS);
        }
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        const msg = err?.response?.data?.message;
        // 400 "already verified" — bounce back, the section will refresh.
        if (status === 400 && /already verified/i.test(msg || "")) {
          goBack();
          return;
        }
        setInitialSendError(msg || "Couldn't send the verification code. Try resending below.");
      } finally {
        if (!cancelled) setSendingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resend countdown tick
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const complete = code.length === LEN;
  const digits = Array.from({ length: LEN }, (_, i) => code[i] ?? "");
  const focusIdx = complete ? LEN - 1 : code.length;

  const handleVerify = async () => {
    if (!complete) {
      Alert.alert("Enter the code", "Type the full 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/auth/verify-signup-email`,
        { otp: code },
        { headers: await authHeaders() }
      );
      if (res.data?.success || res.data?.emailVerifiedAt) {
        // Mirror the new state into local storage so other screens see it.
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          u.emailVerifiedAt = res.data.emailVerifiedAt || new Date().toISOString();
          await SecureStore.setItemAsync("user", JSON.stringify(u));
        }
        Alert.alert("Verified", "Your email is verified.", [
          { text: "Done", onPress: () => goBack() },
        ]);
      }
    } catch (err: any) {
      let msg = "Could not verify code. Try again.";
      const status = err?.response?.status;
      if (status === 400) msg = err.response?.data?.message || "Incorrect code.";
      else if (status === 410) msg = "Code expired. Tap 'Resend code' for a new one.";
      else if (err.response?.data?.message) msg = err.response.data.message;
      Alert.alert("Verification failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setInitialSendError(null);
    try {
      await axios.post(
        `${BASE_URL}/auth/resend-signup-otp`,
        {},
        { headers: await authHeaders() }
      );
      setCode("");
      setResendIn(RESEND_SECONDS);
      Alert.alert("Code sent", "A new verification code is on its way.");
    } catch (err: any) {
      Alert.alert(
        "Couldn't resend",
        err?.response?.data?.message || "Try again in a moment."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
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
            {/* Hidden input so iOS/Android can autofill the one-time code */}
            <TextInput
              ref={hiddenRef}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, LEN))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={LEN}
              caretHidden
              style={styles.hiddenInput}
            />

            {/* Top bar — back only */}
            <View style={styles.topBar}>
              <GlassRoundButton icon="chevron-back" onPress={() => goBack()} />
              <View style={{ width: 38 }} />
            </View>

            {/* Headline */}
            <View style={styles.block}>
              <Text style={styles.headline}>Verify your email</Text>
              <Text style={styles.subhint}>
                {sendingInitial ? (
                  "Sending you a 6-digit code…"
                ) : initialSendError ? (
                  initialSendError
                ) : (
                  <>
                    We sent a 6-digit code to{" "}
                    <Text style={styles.emailBold}>{email || "your email"}</Text>. It
                    expires in 10 minutes.
                  </>
                )}
              </Text>

              {/* OTP cells */}
              <Pressable
                style={styles.otpRow}
                onPress={() => hiddenRef.current?.focus()}
              >
                {digits.map((d, i) => {
                  const filled = !!d;
                  const isFocus = !complete && i === focusIdx;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.otpCell,
                        filled && styles.otpCellFilled,
                        !filled && isFocus && styles.otpCellFocus,
                      ]}
                    >
                      {filled ? <Text style={styles.otpDigit}>{d}</Text> : null}
                    </View>
                  );
                })}
              </Pressable>

              {/* Status / resend row */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusChip,
                    complete && styles.statusChipDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      complete && styles.statusChipDoneText,
                    ]}
                  >
                    {complete ? "✓ READY" : `${code.length} / ${LEN}`}
                  </Text>
                </View>
                {resendIn > 0 ? (
                  <Text style={styles.resendDim}>
                    Resend in{" "}
                    <Text style={styles.resendStrong}>{resendIn}s</Text>
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resending || sendingInitial}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resendLink}>
                      {resending ? "Sending..." : "Resend code"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {sendingInitial && (
                <View style={styles.sendingHint}>
                  <ActivityIndicator size="small" color={AU.purpleSoft} />
                  <Text style={styles.sendingHintText}>Sending the code…</Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1, minHeight: 24 }} />

            {/* CTA */}
            <View style={styles.ctaBlock}>
              <PrimaryCTA
                label="Verify email"
                onPress={handleVerify}
                loading={loading}
                variant={complete ? "primary" : "disabled"}
              />
              <Text style={styles.footerText}>
                Wrong email?{" "}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.replace("/settings")}
                >
                  Change it in Settings
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  hiddenInput: {
    position: "absolute",
    height: 1,
    width: 1,
    opacity: 0,
  },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  block: { paddingHorizontal: 22, paddingTop: 32 },
  headline: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 32,
    lineHeight: 32 * 1.05,
    letterSpacing: -1.12,
    color: AU.text,
  },
  subhint: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: AU.textDim,
    marginTop: 12,
    lineHeight: 20,
  },
  emailBold: { color: AU.text, fontFamily: "Outfit_700Bold" },

  otpRow: {
    marginTop: 28,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  otpCell: {
    flex: 1,
    aspectRatio: 1 / 1.15,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  otpCellFilled: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(192,132,252,0.6)",
  },
  otpCellFocus: { borderColor: "rgba(236,72,153,0.7)" },
  otpDigit: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 30,
    color: AU.text,
    letterSpacing: -0.6,
  },

  statusRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusChip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: AU.stroke,
  },
  statusChipText: {
    color: AU.textMute,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 0.44,
  },
  statusChipDone: {
    backgroundColor: "rgba(52,211,153,0.16)",
    borderColor: "transparent",
  },
  statusChipDoneText: { color: AU.greenSoft },
  resendDim: { fontFamily: "Outfit_500Medium", fontSize: 12, color: AU.textDim },
  resendStrong: { color: AU.text, fontFamily: "Outfit_600SemiBold" },
  resendLink: {
    color: AU.purpleSoft,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  sendingHint: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sendingHintText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: AU.textDim,
  },

  ctaBlock: { paddingHorizontal: 22, paddingTop: 8 },
  footerText: {
    textAlign: "center",
    marginTop: 14,
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: AU.textDim,
  },
  footerLink: { color: AU.purpleSoft, fontFamily: "Outfit_700Bold" },
});
