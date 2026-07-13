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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import chatService from "@/services/chat.service";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
type BookingStatus = "all" | "pending" | "confirmed" | "rejected" | "cancelled";

interface BookingClient {
  _id: string;
  username: string;
  profilePicture?: string;
  email?: string;
}

interface BookingService {
  _id: string;
  name: string;
  category?: string;
  images?: string[];
  price?: number;
  currency?: string;
}

interface Booking {
  _id: string;
  client: BookingClient;
  service: BookingService;
  preferredDate: string;
  message?: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  priceSnapshot?: { amount: number; currency: string };
  createdAt: string;
}

const STATUS_FILTERS: { label: string; value: BookingStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Rejected", value: "rejected" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#22c55e",
  rejected: "#ef4444",
  cancelled: "#6b7280",
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<BookingStatus>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [chattingWith, setChattingWith] = useState<string | null>(null);

  const fetchBookings = useCallback(async (status: BookingStatus = activeFilter) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const query = status !== "all" ? `?status=${status}` : "";
      const res = await fetch(`${BASE_URL}/bookings/vendor${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
    }
  }, [activeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchBookings(activeFilter).finally(() => setLoading(false));
  }, [activeFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBookings(activeFilter);
    setRefreshing(false);
  };

  const handleUpdateStatus = async (bookingId: string, status: "confirmed" | "rejected") => {
    const label = status === "confirmed" ? "Confirm" : "Reject";
    Alert.alert(
      `${label} Booking`,
      `Are you sure you want to ${label.toLowerCase()} this booking?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          style: status === "rejected" ? "destructive" : "default",
          onPress: async () => {
            setUpdating(bookingId);
            try {
              const token = await SecureStore.getItemAsync("token");
              const res = await fetch(`${BASE_URL}/bookings/${bookingId}/status`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status }),
              });
              const data = await res.json();
              if (res.ok) {
                setBookings((prev) =>
                  prev.map((b) => (b._id === bookingId ? { ...b, status } : b))
                );
              } else {
                Alert.alert("Error", data.message || "Failed to update booking");
              }
            } catch {
              Alert.alert("Error", "Failed to update booking");
            } finally {
              setUpdating(null);
            }
          },
        },
      ]
    );
  };

  const handleChatWithClient = async (clientId: string, bookingId: string) => {
    setChattingWith(bookingId);
    try {
      const chat = await chatService.getOrCreateDirectChat(clientId);
      router.push(`/chat/${chat._id}` as any);
    } catch {
      Alert.alert("Error", "Could not open chat");
    } finally {
      setChattingWith(null);
    }
  };

  const renderBookingCard = ({ item }: { item: Booking }) => {
    const isPending = item.status === "pending";
    const isUpdating = updating === item._id;
    const serviceImage = item.service?.images?.[0];
    const price = item.priceSnapshot?.amount ?? item.service?.price;
    const currency = item.priceSnapshot?.currency ?? item.service?.currency ?? "USD";

    return (
      <View style={styles.card}>
        {/* Service info row */}
        <View style={styles.serviceRow}>
          {serviceImage ? (
            <Image source={{ uri: serviceImage }} style={styles.serviceImage} />
          ) : (
            <View style={styles.serviceImagePlaceholder}>
              <Ionicons name="briefcase-outline" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.serviceInfo}>
            <Text style={styles.serviceName} numberOfLines={1}>
              {item.service?.name || "Unknown Service"}
            </Text>
            {item.service?.category && (
              <Text style={styles.serviceCategory}>{item.service.category}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status]}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>

        {/* Client info */}
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
            {item.client?.email && (
              <Text style={styles.clientEmail}>{item.client.email}</Text>
            )}
          </View>
          {price != null && (
            <Text style={styles.price}>
              {currency} {price.toLocaleString()}
            </Text>
          )}
        </View>

        {/* Date */}
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.detailText}>{formatDate(item.preferredDate)}</Text>
        </View>

        {/* Message */}
        {!!item.message && (
          <View style={styles.messageBox}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
            <Text style={styles.messageText} numberOfLines={3}>{item.message}</Text>
          </View>
        )}

        {/* Chat with client button for confirmed bookings */}
        {item.status === "confirmed" && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => handleChatWithClient(item.client._id, item._id)}
            disabled={chattingWith === item._id}
            activeOpacity={0.8}
          >
            {chattingWith === item._id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
                <Text style={styles.chatButtonText}>Message Client</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Actions */}
        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleUpdateStatus(item._id, "rejected")}
              disabled={isUpdating}
              activeOpacity={0.8}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <>
                  <Ionicons name="close-outline" size={16} color={colors.error} />
                  <Text style={[styles.actionText, { color: colors.error }]}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={() => handleUpdateStatus(item._id, "confirmed")}
              disabled={isUpdating}
              activeOpacity={0.8}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={16} color="#fff" />
                  <Text style={[styles.actionText, { color: "#fff" }]}>Confirm</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bookings</Text>
        <Text style={styles.headerSubtitle}>
          {bookings.length} {bookings.length === 1 ? "request" : "requests"}
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
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item._id}
          renderItem={renderBookingCard}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={52} color={colors.border} />
              <Text style={styles.emptyTitle}>No Bookings</Text>
              <Text style={styles.emptyText}>
                {activeFilter === "all"
                  ? "You haven't received any booking requests yet."
                  : `No ${activeFilter} bookings.`}
              </Text>
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
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
  clientEmail: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: c.textMuted,
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.primary,
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
  messageBox: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: c.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  actionText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
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
