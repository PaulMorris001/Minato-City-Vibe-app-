import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { VendorStats, Service } from "@/libs/interfaces";

// Import tab components
import DashboardTab from "@/components/vendor/DashboardTab";
import ServicesTab from "@/components/vendor/ServicesTab";
import AccountTab from "@/components/vendor/AccountTab";
import VendorChatsTab from "@/components/vendor/VendorChatsTab";

type TabType = "dashboard" | "services" | "chats" | "account";

export default function VendorDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchServices()]);
    setLoading(false);
  };

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

  const fetchServices = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/vendor/services`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setServices(res.data);
    } catch (error: any) {
      console.error("Error fetching services:", error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "dashboard") {
      await fetchStats();
    } else if (activeTab === "services") {
      await fetchServices();
    }
    setRefreshing(false);
  };

  const renderTabButton = (
    tab: TabType,
    icon: keyof typeof Ionicons.glyphMap,
    label: string
  ) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
      onPress={() => setActiveTab(tab)}
    >
      <Ionicons
        name={icon}
        size={24}
        color={activeTab === tab ? Colors.primary : "#9ca3af"}
      />
      <Text
        style={[
          styles.tabLabel,
          activeTab === tab && styles.tabLabelActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === "dashboard" && (
          <DashboardTab
            stats={stats}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}
        {activeTab === "services" && (
          <ServicesTab
            services={services}
            onRefresh={fetchServices}
            refreshing={refreshing}
          />
        )}
        {activeTab === "chats" && (
          <VendorChatsTab />
        )}
        {activeTab === "account" && (
          <AccountTab onRefresh={handleRefresh} />
        )}
      </View>

      {/* Bottom Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton("dashboard", "grid-outline", "Dashboard")}
        {renderTabButton("services", "briefcase-outline", "Services")}
        {renderTabButton("chats", "chatbubbles-outline", "Chats")}
        {renderTabButton("account", "person-outline", "Account")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.darkBackground,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9ca3af",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1f1f2e",
    paddingHorizontal: 8,
    paddingBottom: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tabButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 3,
    borderTopColor: "transparent",
    marginTop: -12,
  },
  tabButtonActive: {
    borderTopColor: Colors.primary,
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500",
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
});
