import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { VENDOR_NAVBAR_HEIGHT } from "@/constants/vendorChrome";
import { VendorStats } from "@/libs/interfaces";
import DashboardTab from "@/components/vendor/DashboardTab";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
export default function VendorDashboard() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/vendor/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    fetchStats().finally(() => setLoading(false));
  }, []);

  // Stats change from actions on the other tabs (new service, booking
  // updates, account edits), so refetch whenever this tab regains focus.
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <DashboardTab
        stats={stats}
        statsLoading={loading}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onGoToServices={() => router.push("/(vendor)/services" as any)}
      />
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
