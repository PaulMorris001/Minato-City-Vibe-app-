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
import { useUnread } from "@/contexts/UnreadContext";

// Import tab components
import DashboardTab from "@/components/vendor/DashboardTab";
import ServicesTab from "@/components/vendor/ServicesTab";
import AccountTab from "@/components/vendor/AccountTab";
import VendorChatsTab from "@/components/vendor/VendorChatsTab";
import BookingsTab from "@/components/vendor/BookingsTab";

type TabType = "dashboard" | "services" | "bookings" | "chats" | "account";

export default function VendorDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const { vendorUnread } = useUnread();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchServices(), fetchPendingCount()]);
    setLoading(false);
  };

  const fetchPendingCount = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/bookings/vendor?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingBookingsCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
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
    activeIcon: keyof typeof Ionicons.glyphMap,
    inactiveIcon: keyof typeof Ionicons.glyphMap,
    label: string,
    badgeCount?: number
  ) => {
    const isActive = activeTab === tab;
    const color = isActive ? "#A855F7" : "rgba(244,238,255,0.38)";
    return (
      <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab(tab)} activeOpacity={0.7}>
        <View style={{ position: "relative" }}>
          <Ionicons name={isActive ? activeIcon : inactiveIcon} size={23} color={color} />
          {badgeCount != null && badgeCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{badgeCount > 99 ? "99+" : badgeCount}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.tabLabel, { color, fontWeight: isActive ? "700" : "500" }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

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
            onGoToServices={() => setActiveTab("services")}
            onGoToAccount={() => setActiveTab("account")}
          />
        )}
        {activeTab === "services" && (
          <ServicesTab
            services={services}
            onRefresh={fetchServices}
            refreshing={refreshing}
          />
        )}
        {activeTab === "bookings" && (
          <BookingsTab />
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
        {renderTabButton("dashboard", "grid", "grid-outline", "Dashboard")}
        {renderTabButton("services", "briefcase", "briefcase-outline", "Services")}
        {renderTabButton("bookings", "calendar", "calendar-outline", "Bookings", pendingBookingsCount)}
        {renderTabButton("chats", "chatbubbles", "chatbubbles-outline", "Chats", vendorUnread)}
        {renderTabButton("account", "person", "person-outline", "Account")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0613",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B0613",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9ca3af",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#0B0613",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  tabButton: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10.5,
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
  },
  content: {
    flex: 1,
  },
});
