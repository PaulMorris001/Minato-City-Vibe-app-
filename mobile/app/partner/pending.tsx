import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PartnerPending() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textBright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.body}>
        <Ionicons name="time-outline" size={40} color={colors.primary} />
        <Text style={styles.title}>Under review</Text>
        <Text style={styles.sub}>
          Thanks for applying. We typically review Partner applications within a few business days.
        </Text>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/home" as any)}>
          <Text style={styles.link}>Back to home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.backgroundDeep },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerTitle: { fontFamily: Fonts.bold, fontSize: 18, color: c.textBright },
    body: { padding: 20, alignItems: "center", gap: 10, marginTop: 40 },
    title: { fontFamily: Fonts.bold, fontSize: 22, color: c.textBright },
    sub: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: c.textDim,
      lineHeight: 22,
      textAlign: "center",
    },
    link: { marginTop: 16, fontFamily: Fonts.semiBold, fontSize: 15, color: c.primary },
  });