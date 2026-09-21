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
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  // Cancelling a quoted (invoiced but unpaid) order — the only state this tab
  // shows where payment hasn't happened yet, so it's the only one a vendor can
  // back out of from here. A reason is required so the client isn't left
  // guessing; it's posted into the order's chat as a system message.
  const [cancelingOrder, setCancelingOrder] = useState<VendorOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

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

  const closeCancelModal = () => {
    setCancelingOrder(null);
    setCancelReason("");
  };

  const handleConfirmCancel = async () => {
    if (!cancelingOrder || !cancelReason.trim()) return;
    setSubmittingCancel(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/orders/${cancelingOrder._id}/decline`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to cancel order");
        return;
      }
      // Declined orders no longer match this tab's status filters — drop it
      // locally instead of a full refetch.
      setOrders((prev) => prev.filter((o) => o._id !== cancelingOrder._id));
      closeCancelModal();
    } catch (error) {
      console.error("Error cancelling order:", error);
      Alert.alert("Error", "Failed to cancel order. Please try again.");
    } finally {
      setSubmittingCancel(false);
    }
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

        <View style={styles.actionsRow}>
          {/* Open the chat where the order/invoice card lives */}
          {!!item.chat && (
            <TouchableOpacity
              style={[styles.chatButton, styles.actionButton]}
              onPress={() => router.push(`/chat/${item.chat}` as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
              <Text style={styles.chatButtonText}>Open Chat</Text>
            </TouchableOpacity>
          )}

          {/* Only a quoted (invoiced, unpaid) order can be cancelled here —
              once it's paid, this button doesn't render for it. */}
          {item.status === "quoted" && (
            <TouchableOpacity
              style={[styles.cancelButton, styles.actionButton]}
              onPress={() => setCancelingOrder(item)}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.error} />
              <Text style={styles.cancelButtonText}>Cancel Order</Text>
            </TouchableOpacity>
          )}
        </View>
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

      <Modal visible={!!cancelingOrder} animationType="slide" transparent onRequestClose={closeCancelModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Cancel this order?</Text>
            <Text style={styles.modalSubtitle}>
              The client hasn't paid yet — they'll see your reason in the order chat.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Let the client know why you're cancelling…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              maxLength={500}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeCancelModal}
                disabled={submittingCancel}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonDanger,
                  (!cancelReason.trim() || submittingCancel) && styles.modalButtonDisabled,
                ]}
                onPress={handleConfirmCancel}
                disabled={!cancelReason.trim() || submittingCancel}
              >
                {submittingCancel ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDangerText}>Cancel Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    marginTop: 0,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.error + "14",
    borderWidth: 1,
    borderColor: c.error + "40",
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: c.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalButtonSecondary: {
    backgroundColor: c.backgroundSecondary,
  },
  modalButtonSecondaryText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.textSecondary,
  },
  modalButtonDanger: {
    backgroundColor: c.error,
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonDangerText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fff",
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
