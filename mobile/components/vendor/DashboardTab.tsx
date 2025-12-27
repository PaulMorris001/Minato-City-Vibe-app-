import React from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { VendorStats } from "@/libs/interfaces";
import { useFormatPrice } from "@/hooks/useFormatPrice";

interface DashboardTabProps {
  stats: VendorStats | null;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function DashboardTab({
  stats,
  onRefresh,
  refreshing,
}: DashboardTabProps) {
  const formatPrice = useFormatPrice();

  const renderStatCard = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value: string | number,
    color: string
  ) => (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard Overview</Text>
        <Text style={styles.headerSubtitle}>
          Monitor your services and performance
        </Text>
      </View>

      {/* Statistics Grid */}
      <View style={styles.statsGrid}>
        {renderStatCard(
          "briefcase",
          "Total Services",
          stats?.totalServices || 0,
          Colors.primary
        )}
        {renderStatCard(
          "checkmark-circle",
          "Active Services",
          stats?.activeServices || 0,
          "#22c55e"
        )}
        {renderStatCard(
          "alert-circle",
          "Unavailable",
          stats?.unavailableServices || 0,
          "#f59e0b"
        )}
        {renderStatCard(
          "cash",
          "Avg. Price",
          `$${formatPrice(stats?.averagePrice || 0)}`,
          "#3b82f6"
        )}
      </View>

      {/* Services by Category */}
      {stats && stats.servicesByCategory.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services by Category</Text>
          {stats.servicesByCategory.map((item, index) => (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryLeft}>
                <View style={styles.categoryDot} />
                <Text style={styles.categoryName}>{item.category}</Text>
              </View>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryCount}>{item.count}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Recent Services */}
      {stats && stats.recentServices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Services</Text>
          {stats.recentServices.map((service) => (
            <View key={service._id} style={styles.serviceCard}>
              {service.images && service.images.length > 0 && (
                <Image
                  source={{ uri: service.images[0] }}
                  style={styles.serviceThumbnail}
                />
              )}
              <View style={styles.serviceContent}>
                <View style={styles.serviceHeader}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <View
                    style={[
                      styles.availabilityBadge,
                      service.availability === "available" && styles.availableBadge,
                      service.availability === "unavailable" &&
                        styles.unavailableBadge,
                    ]}
                  >
                    <Text style={styles.availabilityText}>
                      {service.availability}
                    </Text>
                  </View>
                </View>
                <Text style={styles.serviceCategory}>{service.category}</Text>
                <View style={styles.serviceFooter}>
                  <Text style={styles.servicePrice}>
                    ${service.price} {service.currency}
                  </Text>
                  <Text style={styles.serviceDate}>
                    {new Date(service.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Empty State */}
      {stats && stats.totalServices === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="briefcase-outline" size={64} color="#4b5563" />
          <Text style={styles.emptyTitle}>No Services Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start adding services to see your dashboard statistics
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 12,
    color: "#9ca3af",
  },
  section: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.primary,
    marginBottom: 16,
  },
  categoryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    color: "#e5e7eb",
  },
  categoryBadge: {
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },
  serviceCard: {
    backgroundColor: "#374151",
    borderRadius: 8,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 12,
  },
  serviceThumbnail: {
    width: 80,
    height: 80,
    backgroundColor: "#4b5563",
  },
  serviceContent: {
    flex: 1,
    padding: 12,
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  availableBadge: {
    backgroundColor: "#22c55e",
  },
  unavailableBadge: {
    backgroundColor: "#ef4444",
  },
  availabilityText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    textTransform: "capitalize",
  },
  serviceCategory: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 8,
  },
  serviceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  servicePrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.primary,
  },
  serviceDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
