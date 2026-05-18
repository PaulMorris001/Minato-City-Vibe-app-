import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as SecureStore from "expo-secure-store";

import { BASE_URL } from "@/constants/constants";
import { PosterBackground } from "@/components/auth/PosterBackground";
import {
  GlassRoundButton,
  GradientAccent,
  PrimaryCTA,
  ProgressArc,
  Wordmark,
} from "@/components/auth/AuthPrimitives";
import { AU } from "@/components/auth/tokens";

const LEN = 6;
const RESEND_SECONDS = 28;

function BlinkingCaret() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity, height: 26, width: 2, borderRadius: 1, overflow: "hidden" }}>
      <LinearGradient
        colors={[AU.purpleSoft, AU.pink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

export default function VerifySignupEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const hiddenRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const complete = code.length === LEN;
  const digits = Array.from({ length: LEN }, (_, i) => code[i] ?? "");
  const focusIdx = complete ? LEN - 1 : code.length;

  const setDigits = (chars: string[]) => {
    setCode(chars.join("").slice(0, LEN));
  };
  const tapDigit = (d: number) => {
    if (code.length >= LEN) return;
    setCode((c) => (c + String(d)).slice(0, LEN));
  };
  const tapBackspace = () => {
    setCode((c) => c.slice(0, -1));
  };
  const autofill = () => setDigits(["8", "4", "2", "9", "1", "7"]);

  const authHeaders = async () => {
    const token = await SecureStore.getItemAsync("token");
    return { Authorization: `Bearer ${token}` };
  };

  const handleVerify = async () => {
    if (!complete) {
      Alert.alert("Enter the code", "Type the full 6-digit code from your email.");
      return;
    }
    if (!agreed) {
      Alert.alert(
        "Agreement required",
        "Please agree to the Terms of Service and Privacy Policy to continue."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/auth/verify-signup-email`,
        { otp: code },
        { headers: await authHeaders() }
      );
      if (res.data?.success) {
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          u.emailVerifiedAt = res.data.emailVerifiedAt;
          await SecureStore.setItemAsync("user", JSON.stringify(u));
        }
        router.replace("/(tabs)/home");
      }
    } catch (error: any) {
      let msg = "Could not verify code. Try again.";
      const status = error.response?.status;
      if (status === 400) msg = error.response?.data?.message || "Incorrect code.";
      else if (status === 410) msg = "Code expired. Tap 'Resend code' for a new one.";
      else if (error.response?.data?.message) msg = error.response.data.message;
      Alert.alert("Verification failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await axios.post(
        `${BASE_URL}/auth/resend-signup-otp`,
        {},
        { headers: await authHeaders() }
      );
      setCode("");
      setResendIn(RESEND_SECONDS);
      Alert.alert("Code sent", "A new verification code is on its way.");
    } catch (error: any) {
      Alert.alert(
        "Couldn't resend",
        error.response?.data?.message || "Try again in a moment."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <PosterBackground />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
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

          {/* Top bar */}
          <View style={styles.topBar}>
            <GlassRoundButton icon="chevron-back" onPress={() => router.back()} />
            <View style={styles.progressPill}>
              <ProgressArc value={1} />
              <Text style={styles.progressLabel}>FINAL STEP</Text>
            </View>
            <View style={{ width: 38 }} />
          </View>

          {/* Wordmark */}
          <View style={styles.wordmarkRow}>
            <Wordmark />
          </View>

          {/* Headline */}
          <View style={styles.block}>
            <Text style={styles.headline}>
              Check your{"\n"}
              <GradientAccent style={styles.headline}>inbox.</GradientAccent>
            </Text>
            <Text style={styles.subhint}>
              We sent a 6-digit code to{" "}
              <Text style={styles.emailBold}>{email}</Text>. It expires in 10 minutes.
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
                    {filled ? (
                      <Text style={styles.otpDigit}>{d}</Text>
                    ) : isFocus ? (
                      <BlinkingCaret />
                    ) : null}
                  </View>
                );
              })}
            </Pressable>

            {/* Status row */}
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
                  {complete ? "✓ VERIFIED" : `${code.length} / ${LEN}`}
                </Text>
              </View>
              {resendIn > 0 ? (
                <Text style={styles.resendDim}>
                  Resend in <Text style={styles.resendStrong}>{resendIn}s</Text>
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resending}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendLink}>
                    {resending ? "Sending..." : "Resend code"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ flex: 1, minHeight: 12 }} />

          {/* Number pad */}
          <View style={styles.numpadWrap}>
            <View style={styles.numpadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => tapDigit(n)}
                  activeOpacity={0.6}
                  style={styles.padBtn}
                >
                  <Text style={styles.padBtnText}>{n}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={autofill}
                activeOpacity={0.6}
                style={styles.padBtn}
              >
                <Text style={styles.padAuto}>AUTO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => tapDigit(0)}
                activeOpacity={0.6}
                style={styles.padBtn}
              >
                <Text style={styles.padBtnText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={tapBackspace}
                activeOpacity={0.6}
                style={styles.padBtn}
              >
                <Ionicons name="backspace-outline" size={22} color={AU.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* CTA + ToS */}
          <View style={styles.ctaBlock}>
            <TouchableOpacity
              onPress={() => setAgreed((a) => !a)}
              activeOpacity={0.8}
              style={[styles.tosRow, agreed && styles.tosRowChecked]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
            >
              <View
                style={[styles.checkbox, agreed && styles.checkboxChecked]}
              >
                {agreed ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>
              <Text style={styles.tosText}>
                I'm 18+ and I agree to the{" "}
                <Text
                  style={styles.tosLink}
                  onPress={() => router.push("/terms" as any)}
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  style={styles.tosLink}
                  onPress={() => router.push("/privacy" as any)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <PrimaryCTA
              label="Create account"
              onPress={handleVerify}
              loading={loading}
              variant={complete && agreed ? "primary" : "disabled"}
            />

            <Text style={styles.footerText}>
              Wrong email?{" "}
              <Text
                style={styles.footerLink}
                onPress={() => router.replace("/signup")}
              >
                Change it
              </Text>
            </Text>
          </View>
        </ScrollView>
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
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: AU.stroke,
  },
  progressLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: AU.text,
    letterSpacing: 0.55,
  },
  wordmarkRow: { paddingHorizontal: 22, paddingTop: 20 },
  block: { paddingHorizontal: 22, paddingTop: 22 },
  headline: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 42,
    lineHeight: 42 * 0.96,
    letterSpacing: -1.47,
    color: AU.text,
  },
  subhint: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
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
    shadowColor: AU.purple,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
  statusChipDone: { backgroundColor: "rgba(52,211,153,0.16)", borderColor: "transparent" },
  statusChipDoneText: { color: AU.greenSoft },
  resendDim: { fontFamily: "Outfit_500Medium", fontSize: 12, color: AU.textDim },
  resendStrong: { color: AU.text, fontFamily: "Outfit_600SemiBold" },
  resendLink: {
    color: AU.purpleSoft,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  numpadWrap: { paddingHorizontal: 22, paddingBottom: 8 },
  numpadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  padBtn: {
    width: "31.5%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  padBtnText: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 22,
    color: AU.text,
    letterSpacing: -0.44,
  },
  padAuto: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: AU.purpleSoft,
    letterSpacing: 0.66,
  },
  ctaBlock: { paddingHorizontal: 22, paddingTop: 8 },
  tosRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: AU.stroke,
    marginBottom: 12,
  },
  tosRowChecked: {
    backgroundColor: "rgba(168,85,247,0.10)",
    borderColor: "rgba(192,132,252,0.45)",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5,
    borderColor: AU.strokeHi,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    borderWidth: 0,
    backgroundColor: AU.purple,
    shadowColor: AU.purple,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tosText: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 11.5,
    color: AU.textDim,
    lineHeight: 16,
  },
  tosLink: { color: AU.purpleSoft, fontFamily: "Outfit_700Bold" },
  footerText: {
    textAlign: "center",
    marginTop: 12,
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: AU.textDim,
  },
  footerLink: { color: AU.purpleSoft, fontFamily: "Outfit_700Bold" },
});
