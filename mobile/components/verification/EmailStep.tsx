import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess } from "@/utils/toast";
import { PrimaryButton } from "@/components/shared";
import StepDoneCard from "@/components/verification/StepDoneCard";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

interface EmailStepProps {
  onContinue: () => void;
}

/** Step 1 of the public-event verification wizard — embeds the same OTP flow
 * as /verify-email, inline, so completing it doesn't leave the wizard. */
export default function EmailStep({ onContinue }: EmailStepProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const hiddenRef = useRef<TextInput>(null);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync("token")}`,
  });

  const sendCode = async () => {
    try {
      await axios.post(`${BASE_URL}/auth/resend-signup-otp`, {}, { headers: await authHeaders() });
      setResendIn(RESEND_SECONDS);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (!/already verified/i.test(msg || "")) {
        showError(msg || "Couldn't send the verification code");
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${BASE_URL}/profile`, { headers: await authHeaders() });
        const u = res.data.user;
        setEmail(u?.email || "");
        const isVerified = !!u?.emailVerifiedAt;
        setVerified(isVerified);
        if (!isVerified) await sendCode();
      } catch {
        showError("Failed to load your email status");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleResend = async () => {
    setResending(true);
    setCode("");
    await sendCode();
    setResending(false);
  };

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) return;
    setVerifying(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/auth/verify-signup-email`,
        { otp: code },
        { headers: await authHeaders() }
      );
      if (res.data?.success || res.data?.emailVerifiedAt) {
        const userJson = await SecureStore.getItemAsync("user");
        if (userJson) {
          const u = JSON.parse(userJson);
          u.emailVerifiedAt = res.data.emailVerifiedAt || new Date().toISOString();
          await SecureStore.setItemAsync("user", JSON.stringify(u));
        }
        setVerified(true);
        showSuccess("Your email is verified");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      let msg = "Could not verify code. Try again.";
      if (status === 400) msg = err.response?.data?.message || "Incorrect code.";
      else if (status === 410) msg = "Code expired. Tap 'Resend code' for a new one.";
      showError(msg);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (verified) {
    return (
      <View style={styles.stepContainer}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <StepDoneCard
            icon="checkmark"
            tint={colors.success}
            tintLight={colors.successLight}
            title="Email verified"
            subtitle={email}
          />
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton onPress={onContinue} icon="arrow-forward">
            Continue
          </PrimaryButton>
        </View>
      </View>
    );
  }

  const complete = code.length === CODE_LENGTH;
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? "");

  return (
    <View style={styles.stepContainer}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.stepTitle}>Verify your email</Text>
        <Text style={styles.stepSubtitle}>
          We sent a 6-digit code to <Text style={styles.bold}>{email}</Text>. It expires in 10
          minutes.
        </Text>

        <TextInput
          ref={hiddenRef}
          value={code}
          onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          caretHidden
          style={styles.hiddenInput}
        />
        <Pressable style={styles.otpRow} onPress={() => hiddenRef.current?.focus()}>
          {digits.map((d, i) => (
            <View key={i} style={[styles.otpCell, !!d && styles.otpCellFilled]}>
              <Text style={styles.otpDigit}>{d}</Text>
            </View>
          ))}
        </Pressable>

        <TouchableOpacity
          onPress={handleResend}
          disabled={resendIn > 0 || resending}
          style={styles.resendRow}
        >
          <Text style={styles.resendText}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : resending ? "Sending…" : "Resend code"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton onPress={handleVerify} loading={verifying} disabled={!complete} icon="checkmark">
          Verify email
        </PrimaryButton>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
    stepContainer: { flex: 1 },
    body: { flexGrow: 1, justifyContent: "center", gap: 16, paddingVertical: 20 },
    footer: { paddingTop: 12, paddingBottom: 12 },
    stepTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text },
    stepSubtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, lineHeight: 20 },
    bold: { fontFamily: Fonts.semiBold, color: c.text },
    hiddenInput: { position: "absolute", height: 1, width: 1, opacity: 0 },
    otpRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
    otpCell: {
      flex: 1,
      aspectRatio: 1 / 1.1,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    otpCellFilled: { borderColor: c.primary, backgroundColor: c.primaryFaded },
    otpDigit: { fontSize: 22, fontFamily: Fonts.bold, color: c.text },
    resendRow: { alignSelf: "center" },
    resendText: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.primary },
  });
