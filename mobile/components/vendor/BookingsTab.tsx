import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useRouter, useFocusEffect } from "expo-router";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

// The tab lists chat orders, not legacy Booking docs: an order becomes visible
// here once the vendor sends the invoice ("quoted" → shown as Pending) and
// flips to Completed when the client pays ("paid"). "requested" orders stay in
// chat until the vendor invoices them.
type OrderFilter = "all" | "quoted" | "paid";

interface OrderClient {
  _id: string;
  username: string;
  profilePicture?: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  priceSnapshot?: { amount: number; currency: string };
  service?: { _id: string; name: string; images?: string[] };
}

interface VendorOrder {
  _id: string;
  client: OrderClient;
  items: OrderItem[];
  itemsSubtotal: number;
  additionalFees: { label: string; amount: number }[];
  total: number;
  currency: string;
  status: "quoted" | "paid";
  chat?: string;
  createdAt: string;
  paidAt?: string;
}

const STATUS_FILTERS: { label: string; value: OrderFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "quoted" },
  { label: "Completed", value: "paid" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  quoted: { label: "Pending", color: "#f59e0b" },
  paid: { label: "Completed", color: "#22c55e" },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function BookingsTab() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("all");

  const fetchOrders = useCallback(async (filter: OrderFilter = activeFilter) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const status = filter === "all" ? "quoted,paid" : filter;
      const res = await fetch(`${BASE_URL}/orders/vendor?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  }, [activeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchOrders(activeFilter).finally(() => setLoading(false));
  }, [activeFilter]);

  // A quoted order flips to paid while the vendor is elsewhere (chat, another
  // tab) — refresh on every focus so the states stay honest.
  useFocusEffect(
    useCallback(() => {
      fetchOrders(activeFilter);
    }, [fetchOrders, activeFilter])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders(activeFilter);
    setRefreshing(false);
  };

  const renderOrderCard = ({ item }: { item: VendorOrder }) => {
    const meta = STATUS_META[item.status] ?? { label: item.status, color: "#6b7280" };
    const thumbnail = item.items?.[0]?.service?.images?.[0];
    const itemsSummary = (item.items || [])
      .map((it) => `${it.name} × ${it.quantity || 1}`)
      .join(", ");

    return (
      <View style={styles.card}>
        {/* Items row */}
        <View style={styles.serviceRow}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.serviceImage} />
          ) : (
            <View style={styles.serviceImagePlaceholder}>
              <Ionicons name="receipt-outline" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.serviceInfo}>
            <Text style={styles.serviceName} numberOfLines={2}>
              {itemsSummary || "Order"}
            </Text>
            <Text style={styles.serviceCategory}>
              {item.items?.length || 0} {item.items?.length === 1 ? "item" : "items"}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${meta.color}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* Client + total */}
        <View style={styles.clientRow}>
          {item.client?.profilePicture ? (
            <Image source={{ uri: item.client.profilePicture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarLetter}>
                {item.client?.username?.[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.client?.username || "Unknown Client"}</Text>
          </View>
          <Text style={styles.price}>
            {(item.currency || "USD").toUpperCase()} {(item.total ?? 0).toLocaleString()}
          </Text>
        </View>

        {/* Dates */}
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.detailText}>
            {item.status === "paid" && item.paidAt
              ? `Paid ${formatDate(item.paidAt)}`
              : `Invoiced ${formatDate(item.createdAt)}`}
          </Text>
        </View>

        {/* Open the chat where the order/invoice card lives */}
        {!!item.chat && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push(`/chat/${item.chat}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text style={styles.chatButtonText}>Open Chat</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const emptyText =
    activeFilter === "all"
      ? "Orders appear here once you send an invoice from chat."
      : activeFilter === "quoted"
        ? "No pending orders — invoices you send from chat show up here until the client pays."
        : "No completed orders yet.";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bookings</Text>
        <Text style={styles.headerSubtitle}>
          {orders.length} {orders.length === 1 ? "order" : "orders"}
        </Text>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, activeFilter === f.value && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.value)}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.filterChipText, activeFilter === f.value && styles.filterChipTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          renderItem={renderOrderCard}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={52} color={colors.border} />
              <Text style={styles.emptyTitle}>No Bookings</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: c.textSecondary,
  },
  filterChipTextActive: {
    color: c.white,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  serviceImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.border,
  },
  serviceImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceInfo: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  serviceName: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: c.text,
  },
  serviceCategory: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.border,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  clientInfo: {
    flex: 1,
    marginLeft: 8,
  },
  clientName: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: c.primary,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.primaryFaded,
    borderWidth: 1,
    borderColor: c.primaryBorder,
  },
  chatButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.primary,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: c.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
