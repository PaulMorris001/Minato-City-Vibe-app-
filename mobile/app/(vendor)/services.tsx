import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { VENDOR_NAVBAR_HEIGHT } from "@/constants/vendorChrome";
import { CatalogueCategory, Service } from "@/libs/interfaces";
import ServicesTab from "@/components/vendor/ServicesTab";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
export default function VendorServices() {
  const styles = useThemedStyles(createStyles);
  const [categories, setCategories] = useState<CatalogueCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCatalogue = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [cats, svcs] = await Promise.all([
        axios.get(`${BASE_URL}/vendor/categories`, { headers }),
        axios.get(`${BASE_URL}/vendor/services`, { headers }),
      ]);
      setCategories(cats.data);
      setServices(svcs.data);
    } catch (error: any) {
      console.error("Error fetching catalogue:", error);
    }
  };

  useEffect(() => {
    fetchCatalogue();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCatalogue();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCatalogue();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ServicesTab
        categories={categories}
        services={services}
        onRefresh={handleRefresh}
        refreshing={refreshing}
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
