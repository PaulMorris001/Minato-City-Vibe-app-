import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { VENDOR_NAVBAR_HEIGHT } from "@/constants/vendorChrome";
import VendorChatsTab from "@/components/vendor/VendorChatsTab";

export default function VendorChats() {
  return (
    <View style={styles.screen}>
      <VendorChatsTab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B0613",
    // The vendor navbar overlays the tab host on iOS; pad below it. On
    // Android the navbar sits in normal flow above the tabs.
    paddingTop: Platform.OS === "ios" ? VENDOR_NAVBAR_HEIGHT : 0,
  },
});
