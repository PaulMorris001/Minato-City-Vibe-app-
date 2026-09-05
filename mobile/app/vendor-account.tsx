import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GlassBackButton from "@/components/shared/GlassBackButton";
import AccountTab from "@/components/vendor/AccountTab";
import { VNF } from "@/components/vendor/vendorTheme";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

// The vendor account screen used to be a tab in (vendor); it moved out to a
// stacked route when Discover took its slot in the tab bar. Reached from the
// dashboard's profile menu.
export default function VendorAccount() {
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Account</Text>
        <View style={styles.backButton} />
      </View>
      <AccountTab onRefresh={() => {}} />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.backgroundDeep },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: { width: 40 },
    headerTitle: {
      fontFamily: VNF.heading,
      fontSize: 20,
      color: c.textBright,
      letterSpacing: -0.4,
    },
  });
