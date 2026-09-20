import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Fonts } from "@/constants/fonts";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { goHome } from "@/utils/navigation";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import EmailStep from "@/components/verification/EmailStep";
import IdentityStep from "@/components/verification/IdentityStep";
import PayoutStep from "@/components/verification/PayoutStep";

const STEPS = [
  { key: "email", label: "Email" },
  { key: "identity", label: "Identity" },
  { key: "payout", label: "Payout" },
] as const;

/**
 * The wizard behind public-event-verification's "Get Started" button. Each
 * step is a self-contained component that fetches its own status and lets
 * the user complete it inline — see EmailStep/IdentityStep/PayoutStep.
 */
export default function PublicEventVerificationSteps() {
  const styles = useThemedStyles(createStyles);
  const [step, setStep] = useState(0);

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = () => {
    Alert.alert(
      "Thank you!",
      "Thank you for completing the verification. Your identity will be verified within 24-48 hours — we'll let you know as soon as it's approved.",
      [{ text: "Done", onPress: () => goHome() }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} onPress={step === 0 ? undefined : goPrev} />
        <View style={styles.progressWrap}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={styles.progressItem}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, i <= step && styles.progressFillActive]} />
              </View>
              <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.stepArea}>
          {step === 0 && <EmailStep onContinue={goNext} />}
          {step === 1 && <IdentityStep onContinue={goNext} />}
          {step === 2 && <PayoutStep onFinish={handleFinish} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 16,
    },
    backButton: {},
    progressWrap: { flex: 1, flexDirection: "row", gap: 10 },
    progressItem: { flex: 1, gap: 6 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: c.border, overflow: "hidden" },
    progressFill: { flex: 1, backgroundColor: "transparent" },
    progressFillActive: { backgroundColor: c.primary },
    progressLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: c.textMuted },
    progressLabelActive: { color: c.primary },
    stepArea: { flex: 1, paddingHorizontal: 20 },
  });
