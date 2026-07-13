import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { VENDOR_NAVBAR_HEIGHT } from "@/constants/vendorChrome";
import VendorChatsTab from "@/components/vendor/VendorChatsTab";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
export default function VendorChats() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.screen}>
      <VendorChatsTab />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.backgroundDeep,
    // The vendor navbar overlays the tab host on iOS; pad below it. On
    // Android the navbar sits in normal flow above the tabs.
    paddingTop: Platform.OS === "ios" ? VENDOR_NAVBAR_HEIGHT : 0,
  },
});
