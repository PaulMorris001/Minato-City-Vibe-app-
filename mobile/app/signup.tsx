import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";

import { BASE_URL } from "@/constants/constants";
import { remoteLog } from "@/utils/remoteLog";
import { passwordError } from "@/utils/passwordPolicy";
import { PosterBackground } from "@/components/auth/PosterBackground";
import {
  GradientAccent,
  GlassRoundButton,
  PrimaryCTA,
  ProgressArc,
  Wordmark,
} from "@/components/auth/AuthPrimitives";
import { AU } from "@/components/auth/tokens";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

import { darkColors, type ThemeColors } from "@/constants/theme";
type StepKey = "username" | "email" | "password" | "confirm";

type AvailStatus = "idle" | "checking" | "available" | "taken" | "error";

type StepDef = {
  key: StepKey;
  question: string;
  hint: string;
  placeholder: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
  autoComplete?: "username" | "email" | "new-password";
};

const STEPS: StepDef[] = [
  {
    key: "username",
    question: "What's your\nnight name?",
    hint: "Show up as @___ on RSVPs and parties.",
    placeholder: "@nightowl",
    autoComplete: "username",
  },
  {
    key: "email",
    question: "Where do we\nfind you?",
    hint: "For RSVPs and recovery. We never spam.",
    placeholder: "you@mail.com",
    keyboardType: "email-address",
    autoComplete: "email",
  },
  {
    key: "password",
    question: "Lock it in.",
    hint: "8+ characters. Mix in a number or symbol.",
    placeholder: "••••••••",
    secure: true,
    autoComplete: "new-password",
  },
  {
    key: "confirm",
    question: "One more time.",
    hint: "Just to be sure. Spelling matters.",
    placeholder: "••••••••",
    secure: true,
    autoComplete: "new-password",
  },
];

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function computePasswordStrength(pwd: string) {
  const long = pwd.length >= 8;
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);
  const mixedCase = /[a-z]/.test(pwd) && /[A-Z]/.test(pwd);
  const segments = [long, hasNumber, hasSymbol, mixedCase];
  const filled = segments.filter(Boolean).length;
  const label =
    filled >= 4 ? "STRONG" : filled === 3 ? "GOOD" : filled === 2 ? "OK" : "WEAK";
  const parts: string[] = [label, `${pwd.length} CHARS`];
  if (mixedCase) parts.push("MIXED CASE");
  if (hasSymbol) parts.push("SYMBOL");
  if (hasNumber && !hasSymbol) parts.push("NUMBER");
  return { segments, label, summary: parts.join(" · ") };
}

export default function Signup() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<StepKey, string>>({
    username: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Explicit terms/EULA consent — required before an account can be created
  // (Apple Guideline 1.2). Gates both email signup and the social buttons.
  const [agreedTerms, setAgreedTerms] = useState(false);
  // Live uniqueness state for the username/email steps. "idle" = nothing to
  // show (empty or locally invalid), "checking" = request in flight, then the
  // server's verdict. "error" is non-blocking — /register does the final say.
  const [avail, setAvail] = useState<{ username: AvailStatus; email: AvailStatus }>({
    username: "idle",
    email: "idle",
  });

  const current = STEPS[step];
  const value = values[current.key];

  useEffect(() => {
    // Refocus the field every time the step changes.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    setShowPassword(false);
    return () => clearTimeout(t);
  }, [step]);

  const update = (next: string) => {
    const cleaned = current.key === "username" ? next.replace(/^@+/, "") : next;
    setValues((v) => ({ ...v, [current.key]: cleaned }));
  };

  const match = !!values.password && !!values.confirm && values.password === values.confirm;
  const mismatch = !!values.confirm && values.password !== values.confirm;
  const passwordStrength = useMemo(
    () => computePasswordStrength(values.password),
    [values.password]
  );

  // One network call for a single field's availability. Format is assumed
  // already valid (callers gate on the local regexes first).
  const runAvailabilityCheck = async (
    key: "username" | "email",
    raw: string
  ): Promise<AvailStatus> => {
    try {
      const res = await axios.get(`${BASE_URL}/auth/check-availability`, {
        params: { [key]: raw },
      });
      const info = res.data?.[key];
      if (!info) return "error";
      return info.available ? "available" : "taken";
    } catch {
      // Network / rate-limit hiccup — don't block the user here; the final
      // /register call is authoritative and will surface a clear 409.
      return "error";
    }
  };

  // Debounced live check as the user types on the username / email steps.
  useEffect(() => {
    const key = current.key;
    if (key !== "username" && key !== "email") return;

    const raw = values[key].trim();
    const validLocal =
      key === "username" ? USERNAME_RE.test(raw) : EMAIL_RE.test(raw);
    if (!validLocal) {
      setAvail((a) => ({ ...a, [key]: "idle" }));
      return;
    }

    setAvail((a) => ({ ...a, [key]: "checking" }));
    let cancelled = false;
    const t = setTimeout(async () => {
      const status = await runAvailabilityCheck(key, raw);
      if (!cancelled) setAvail((a) => ({ ...a, [key]: status }));
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [values.username, values.email, current.key]);

  const validateCurrent = (): string | null => {
    const v = values[current.key].trim();
    if (!v) return "This field is required.";
    if (current.key === "username" && !USERNAME_RE.test(v))
      return "3–20 characters, letters / numbers / underscores only.";
    if (current.key === "email" && !EMAIL_RE.test(v))
      return "That email doesn't look right.";
    if (current.key === "password") {
      const err = passwordError(values.password);
      if (err) return err;
    }
    if (current.key === "confirm" && v !== values.password)
      return "Passwords don't match yet.";
    return null;
  };

  const submitRegister = async () => {
    setSubmitting(true);
    remoteLog("info", "signup attempt", {
      email: values.email,
      username: values.username,
    });
    try {
      const res = await axios.post(`${BASE_URL}/register`, {
        username: values.username,
        email: values.email,
        password: values.password,
        termsAccepted: agreedTerms,
      });

      const user = res.data.user;
      const token = res.data.token;

      Sentry.setUser({ id: user._id, email: user.email, username: user.username });
      remoteLog("info", "signup success", { userId: user._id });

      await SecureStore.setItemAsync("token", token);
      await SecureStore.setItemAsync("user", JSON.stringify(user));

      if (res.data?.requiresEmailVerification) {
        router.replace({
          pathname: "/verify-signup-email",
          params: { email: values.email },
        } as any);
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (error: any) {
      const status = error.response?.status;
      const isNetworkError =
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND" ||
        error.message?.includes("Network Error");
      const isServerError = typeof status === "number" && status >= 500;
      // 4xx (409 username/email taken, 400 invalid input) are expected user
      // errors — Render log only. 5xx / network are real problems → Sentry.
      if (isServerError || isNetworkError) {
        Sentry.captureException(error, {
          tags: { action: "signup" },
          contexts: {
            signup: { email: values.email, username: values.username },
            response: { status, data: error.response?.data },
          },
        });
      }
      remoteLog(
        isServerError || isNetworkError ? "error" : "warn",
        "signup failed",
        {
          email: values.email,
          username: values.username,
          status,
          code: error?.code,
          message: error?.message,
          serverMessage: error.response?.data?.message,
        },
        error
      );

      let msg = "Signup failed. Please try again.";
      const serverMsg: string = (error.response?.data?.message ?? "").toLowerCase();
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND")
        msg = "Cannot connect to server. Check your internet connection.";
      else if (error.message?.includes("Network Error"))
        msg = "No internet connection. Please check your network.";
      else if (status === 409 && serverMsg.includes("username"))
        msg = "That username is already taken.";
      else if (status === 409 && serverMsg.includes("email"))
        msg = "An account with that email already exists. Try logging in.";
      else if (status === 409)
        msg = "An account with those details already exists.";
      else if (status === 400 && serverMsg.includes("password"))
        msg = "Password is too weak.";
      else if (status === 400 && serverMsg.includes("email"))
        msg = "Please enter a valid email.";
      else if (status === 429) msg = "Too many attempts. Try again in a few minutes.";
      else if (status >= 500) msg = "Server error. Try again later.";
      else if (error.response?.data?.message) msg = error.response.data.message;

      Alert.alert("Signup failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    const err = validateCurrent();
    if (err) {
      Alert.alert("Hold up", err);
      return;
    }

    if (step === 0 && !agreedTerms) {
      Alert.alert(
        "One more thing",
        "Please agree to the Terms of Service and Privacy Policy to create an account."
      );
      return;
    }

    // Block advancing past a username/email that's already taken. If the
    // debounce hasn't settled yet, run a blocking check now so the user never
    // reaches the next step on a stale/unknown value.
    const key = current.key;
    if (key === "username" || key === "email") {
      const raw = values[key].trim();
      let status = avail[key];
      if (status === "idle" || status === "checking") {
        setAvail((a) => ({ ...a, [key]: "checking" }));
        status = await runAvailabilityCheck(key, raw);
        setAvail((a) => ({ ...a, [key]: status }));
      }
      if (status === "taken") {
        Alert.alert(
          "Hold up",
          key === "username"
            ? "That username is already taken. Please choose another."
            : "An account with that email already exists. Try logging in."
        );
        return;
      }
    }

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      submitRegister();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  // CTA variant: primary if current field has any text and not mismatched.
  const isFinal = step === STEPS.length - 1;
  const ctaActive = value.length > 0 && !(current.key === "confirm" && mismatch);
  const ctaVariant: "primary" | "light" | "disabled" =
    isFinal && current.key === "confirm" && mismatch
      ? "disabled"
      : ctaActive
        ? "primary"
        : "light";
  const ctaLabel = isFinal ? "Start the night" : ctaActive ? "Next" : "Continue";

  // Accent fill under the input: empty → small dim slice, filled → full
  const accent = value ? 1 : 0.18 + step * 0.18;

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
            {/* Top bar */}
            <View style={styles.topBar}>
              <GlassRoundButton
                icon="chevron-back"
                onPress={handleBack}
                disabled={step === 0}
              />
              <View style={styles.progressPill}>
                <ProgressArc value={(step + 1) / STEPS.length} />
                <Text style={styles.progressLabel}>
                  STEP {step + 1} OF {STEPS.length}
                </Text>
              </View>
              <View style={{ width: 38 }} />
            </View>

            {/* Wordmark */}
            <View style={styles.wordmarkRow}>
              <Wordmark />
            </View>

            {/* Question */}
            <View style={styles.questionBlock}>
              <Text style={styles.question}>{current.question}</Text>
              <Text style={styles.hint}>{current.hint}</Text>

              <View style={styles.fieldWrap}>
                <View style={styles.inputRow}>
                  <TextInput
                    ref={inputRef}
                    value={value}
                    onChangeText={update}
                    placeholder={current.placeholder}
                    placeholderTextColor={AU.textMute}
                    secureTextEntry={!!current.secure && !showPassword}
                    keyboardType={current.keyboardType ?? "default"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={current.autoComplete}
                    textContentType={
                      current.key === "username"
                        ? "username"
                        : current.key === "email"
                          ? "emailAddress"
                          : "newPassword"
                    }
                    returnKeyType={isFinal ? "done" : "next"}
                    onSubmitEditing={handleNext}
                    style={[styles.input, !!current.secure && styles.inputWithEye]}
                  />
                  {!!current.secure && (
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      activeOpacity={0.7}
                      hitSlop={10}
                      style={styles.eyeBtn}
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={AU.textMute}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.underlineTrack}>
                  <LinearGradient
                    colors={[AU.purple, AU.pink]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.underlineFill, { width: `${accent * 100}%` }]}
                  />
                </View>
              </View>

              {/* Per-step status affordance */}
              {(current.key === "username" || current.key === "email") && (
                <AvailabilityChip
                  stepKey={current.key}
                  value={value}
                  status={avail[current.key]}
                />
              )}

              {current.key === "password" && !!value && (
                <View style={styles.strengthBlock}>
                  <View style={styles.strengthRow}>
                    {passwordStrength.segments.map((on, i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthSegment,
                          on
                            ? {
                                backgroundColor:
                                  i < 2 ? AU.purpleSoft : AU.pink,
                              }
                            : { backgroundColor: colors.glassFill },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.strengthLabel}>{passwordStrength.summary}</Text>
                </View>
              )}

              {current.key === "confirm" && (match || mismatch) && (
                <View
                  style={[
                    styles.chip,
                    match ? styles.chipGreen : styles.chipPink,
                    { alignSelf: "flex-start", marginTop: 14 },
                  ]}
                >
                  <Text style={match ? styles.chipGreenText : styles.chipPinkText}>
                    {match ? "✓ Passwords match" : "✗ Doesn't match yet"}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1, minHeight: 16 }} />

            {/* CTA + dots + footer */}
            <View style={styles.bottomBlock}>
              {step === 0 && (
                <TouchableOpacity
                  style={styles.consentRow}
                  onPress={() => setAgreedTerms((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreedTerms }}
                >
                  <View style={[styles.consentBox, agreedTerms && styles.consentBoxOn]}>
                    {agreedTerms && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.consentText}>
                    I agree to the{" "}
                    <Text
                      style={styles.consentLink}
                      onPress={() => router.push("/terms" as any)}
                    >
                      Terms of Service
                    </Text>{" "}
                    and{" "}
                    <Text
                      style={styles.consentLink}
                      onPress={() => router.push("/privacy" as any)}
                    >
                      Privacy Policy
                    </Text>
                    , including zero tolerance for objectionable content or
                    abusive behavior.
                  </Text>
                </TouchableOpacity>
              )}

              <PrimaryCTA
                label={ctaLabel}
                onPress={handleNext}
                variant={ctaVariant}
                loading={submitting}
              />

              <View style={styles.dotsRow}>
                {STEPS.map((_, i) => {
                  const past = i <= step;
                  if (past) {
                    return (
                      <LinearGradient
                        key={i}
                        colors={[AU.purple, AU.pink]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[styles.dot, i === step && styles.dotActive]}
                      />
                    );
                  }
                  return <View key={i} style={[styles.dot, styles.dotIdle]} />;
                })}
              </View>

              {step === 0 && (
                <View style={styles.socialWrap}>
                  <View
                    pointerEvents={agreedTerms ? "auto" : "none"}
                    style={!agreedTerms && { opacity: 0.45 }}
                  >
                    <SocialAuthButtons />
                  </View>
                  {/* Social signup also creates an account — same consent gate. */}
                  {!agreedTerms && (
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() =>
                        Alert.alert(
                          "One more thing",
                          "Please agree to the Terms of Service and Privacy Policy to create an account."
                        )
                      }
                    />
                  )}
                </View>
              )}

              <Text style={styles.footerText}>
                Already on OurCityvibe?{" "}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.push("/login" as any)}
                >
                  Log in
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function AvailabilityChip({
  stepKey,
  value,
  status,
}: {
  stepKey: "username" | "email";
  value: string;
  status: AvailStatus;
}) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const noun = stepKey === "username" ? "Username" : "Email";
  const validLocal =
    stepKey === "username" ? USERNAME_RE.test(trimmed) : EMAIL_RE.test(trimmed);

  // Keep quiet until the field is at least locally valid — the field's own
  // validation message covers malformed input on Next.
  if (!validLocal) return null;

  if (status === "checking") {
    return (
      <View style={[styles.chip, styles.chipNeutral, styles.chipStandalone]}>
        <Text style={styles.chipNeutralText}>CHECKING…</Text>
      </View>
    );
  }
  if (status === "available") {
    return (
      <View style={[styles.chip, styles.chipGreen, styles.chipStandalone]}>
        <Text style={styles.chipGreenText}>✓ AVAILABLE</Text>
      </View>
    );
  }
  if (status === "taken") {
    return (
      <View style={[styles.chip, styles.chipPink, styles.chipStandalone]}>
        <Text style={styles.chipPinkText}>
          ✗ {noun.toUpperCase()} TAKEN
        </Text>
      </View>
    );
  }
  return null;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
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
    backgroundColor: c.glassFillSubtle,
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
  questionBlock: { paddingHorizontal: 22, paddingTop: 22 },
  question: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 42,
    lineHeight: 42 * 0.96,
    letterSpacing: -1.47,
    color: AU.text,
  },
  hint: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    color: AU.textDim,
    marginTop: 12,
  },
  fieldWrap: { marginTop: 24 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 30,
    color: AU.text,
    letterSpacing: -0.6,
    paddingBottom: 12,
    paddingTop: 0,
    margin: 0,
  },
  inputWithEye: {
    paddingRight: 8,
  },
  eyeBtn: {
    paddingBottom: 12,
    paddingLeft: 8,
  },
  underlineTrack: {
    height: 2,
    borderRadius: 2,
    backgroundColor: c.glassStroke,
    overflow: "hidden",
  },
  underlineFill: { height: 2, borderRadius: 2 },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  chipStandalone: { alignSelf: "flex-start", marginTop: 14 },
  chipNeutral: { backgroundColor: c.glassFill },
  chipNeutralText: {
    color: AU.textMute,
    fontFamily: "Outfit_700Bold",
    fontSize: 10.5,
    letterSpacing: 0.5,
  },
  chipGreen: { backgroundColor: "rgba(52,211,153,0.16)" },
  chipGreenText: {
    color: AU.greenSoft,
    fontFamily: "Outfit_700Bold",
    fontSize: 10.5,
    letterSpacing: 0.5,
  },
  chipPink: { backgroundColor: "rgba(236,72,153,0.18)" },
  chipPinkText: {
    color: "#FBCFE8",
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 0.44,
  },
  strengthBlock: { marginTop: 14, gap: 8 },
  strengthRow: { flexDirection: "row", gap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 10.5,
    color: AU.textMute,
    letterSpacing: 0.5,
  },
  bottomBlock: { paddingHorizontal: 22, paddingBottom: 0 },
  socialWrap: { marginTop: 18, gap: 10 },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  consentBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  consentBoxOn: {
    backgroundColor: AU.purple,
    borderColor: AU.purple,
  },
  consentText: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 12.5,
    lineHeight: 18,
    color: AU.textMute,
  },
  consentLink: {
    color: AU.purpleSoft,
    fontFamily: "Outfit_600SemiBold",
    textDecorationLine: "underline",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  dot: { height: 6, width: 6, borderRadius: 3 },
  dotActive: { width: 22 },
  dotIdle: { backgroundColor: c.glassStrokeStrong },
  footerText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: AU.textDim,
    textAlign: "center",
    marginTop: 14,
  },
  footerLink: {
    color: AU.purpleSoft,
    fontFamily: "Outfit_700Bold",
  },
});

// Auth/poster surface: always renders the dark palette.
const colors = darkColors;
const styles = createStyles(darkColors);
