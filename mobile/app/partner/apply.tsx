import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PartnerApply() {
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
        <Text style={styles.headerTitle}>Become a Partner</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Earn 10% for 12 months</Text>
        <Text style={styles.sub}>
          Refer organizers who host paid events. You earn 10% of OurCityVibe platform fees
          from their events for a full year — plus normal referral points.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={() => router.replace("/partner/pending" as any)}
        >
          <Text style={styles.ctaText}>Submit application (mock)</Text>
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
    body: { padding: 20, gap: 12 },
    title: { fontFamily: Fonts.bold, fontSize: 22, color: c.textBright },
    sub: { fontFamily: Fonts.regular, fontSize: 15, color: c.textDim, lineHeight: 22 },
    cta: {
      marginTop: 16,
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
    },
    ctaText: { fontFamily: Fonts.bold, fontSize: 15, color: "#fff" },
  });