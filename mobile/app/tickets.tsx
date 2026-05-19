import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import TicketCard from "@/components/TicketCard";
import TicketCardSkeleton from "@/components/skeletons/TicketCardSkeleton";
import chatService from "@/services/chat.service";

const TK_BG = "#0B0613";
const TK_SURFACE = "rgba(26,16,48,0.7)";
const TK_STROKE = "rgba(255,255,255,0.08)";
const TK_STROKE_HI = "rgba(255,255,255,0.14)";
const TK_TEXT = "#F4EEFF";
const TK_TEXT_DIM = "rgba(244,238,255,0.62)";
const TK_TEXT_MUTE = "rgba(244,238,255,0.38)";
const TK_PURPLE_SOFT = "#C084FC";

interface Ticket {
  _id: string;
  event: {
    _id: string;
    title: string;
    date: string;
    location: string;
    image?: string;
    createdBy: {
      _id: string;
      username: string;
      email: string;
      profilePicture?: string;
    };
  };
  ticketPrice: number;
  purchaseDate: string;
  ticketCode: string;
  isValid: boolean;
}

interface ClientBooking {
  _id: string;
  service: { _id: string; name: string; category?: string };
  vendor: { _id: string; username: string; profilePicture?: string };
  preferredDate: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  priceSnapshot?: { amount: number; currency: string };
}

const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending: "#FCD34D",
  confirmed: "#6EE7B7",
  rejected: "#FCA5A5",
  cancelled: "#9CA3AF",
};

export default function TicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [activeTab, setActiveTab] = useState<"tickets" | "bookings">("tickets");
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chattingWith, setChattingWith] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(`${BASE_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok) {
        setTickets(data.tickets || []);
      } else {
        Alert.alert("Error", data.message || "Failed to fetch tickets");
      }
    } catch (error) {
      console.error("Fetch tickets error:", error);
      Alert.alert("Error", "Failed to load tickets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/bookings/client`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data || []);
      }
    } catch (error) {
      console.error("Fetch bookings error:", error);
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleChatWithVendor = async (vendorId: string, bookingId: string) => {
    setChattingWith(bookingId);
    try {
      const chat = await chatService.getOrCreateDirectChat(vendorId);
      router.push(`/chat/${chat._id}` as any);
    } catch {
      Alert.alert("Error", "Could not open chat");
    } finally {
      setChattingWith(null);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchBookings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTickets();
      fetchBookings();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
    fetchBookings();
  };

  const renderTab = (id: "tickets" | "bookings", label: string, count: number) => {
    const on = activeTab === id;
    return (
      <TouchableOpacity
        key={id}
        onPress={() => setActiveTab(id)}
        activeOpacity={0.8}
        style={styles.tab}
      >
        <Text style={[styles.tabLabel, on ? styles.tabLabelActive : styles.tabLabelInactive]}>
          {label}
        </Text>
        <View style={[styles.countPill, on ? styles.countPillActive : styles.countPillInactive]}>
          <Text style={[styles.countText, on ? styles.countTextActive : styles.countTextInactive]}>
            {count}
          </Text>
        </View>
        {on && (
          <LinearGradient
            colors={["#A855F7", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabUnderline}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={TK_TEXT} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Tickets</Text>
            <Text style={styles.headerSubtitle}>Tickets & service bookings</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {renderTab("tickets", "Event Tickets", tickets.length)}
          {renderTab("bookings", "Service Bookings", bookings.length)}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
        >
          {activeTab === "tickets" ? (
            loading ? (
              <TicketCardSkeleton count={3} />
            ) : tickets.length === 0 ? (
              <EmptyState
                emoji="🎟️"
                title="No tickets yet"
                subtitle={
                  bookings.length > 0
                    ? "Switch to Service Bookings to see your bookings."
                    : "When you book or buy a ticket, it'll show up here."
                }
              />
            ) : (
              <View style={styles.ticketList}>
                {tickets.map((ticket) => (
                  <TicketCard key={ticket._id} ticket={ticket} />
                ))}
              </View>
            )
          ) : bookingsLoading ? (
            <TicketCardSkeleton count={3} />
          ) : bookings.length === 0 ? (
            <EmptyState
              emoji="🧰"
              title="No bookings yet"
              subtitle={
                tickets.length > 0
                  ? "Switch to Event Tickets to see your tickets."
                  : "Book a vendor service to see your bookings here."
              }
            />
          ) : (
            <View style={styles.ticketList}>
              {bookings.map((booking) => (
                <View key={booking._id} style={styles.bookingCard}>
                  <View style={styles.bookingHeader}>
                    <Text style={styles.bookingServiceName} numberOfLines={1}>
                      {booking.service?.name || "Unknown Service"}
                    </Text>
                    <View
                      style={[
                        styles.bookingStatusBadge,
                        { backgroundColor: `${BOOKING_STATUS_COLORS[booking.status]}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.bookingStatusText,
                          { color: BOOKING_STATUS_COLORS[booking.status] },
                        ]}
                      >
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  {booking.service?.category && (
                    <Text style={styles.bookingCategory}>{booking.service.category}</Text>
                  )}
                  <View style={styles.bookingRow}>
                    <Ionicons name="person-outline" size={14} color={TK_TEXT_MUTE} />
                    <Text style={styles.bookingDetail}>{booking.vendor?.username || "Vendor"}</Text>
                  </View>
                  <View style={styles.bookingRow}>
                    <Ionicons name="calendar-outline" size={14} color={TK_TEXT_MUTE} />
                    <Text style={styles.bookingDetail}>
                      {new Date(booking.preferredDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  {booking.priceSnapshot && (
                    <View style={styles.bookingRow}>
                      <Ionicons name="cash-outline" size={14} color={TK_TEXT_MUTE} />
                      <Text style={styles.bookingDetail}>
                        {booking.priceSnapshot.currency} {booking.priceSnapshot.amount.toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {booking.status === "confirmed" && (
                    <TouchableOpacity
                      style={styles.chatVendorButton}
                      onPress={() => handleChatWithVendor(booking.vendor._id, booking._id)}
                      disabled={chattingWith === booking._id}
                      activeOpacity={0.8}
                    >
                      {chattingWith === booking._id ? (
                        <ActivityIndicator size="small" color={TK_PURPLE_SOFT} />
                      ) : (
                        <>
                          <Ionicons name="chatbubbles-outline" size={16} color={TK_PURPLE_SOFT} />
                          <Text style={styles.chatVendorButtonText}>Chat with Vendor</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  const router = useRouter();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateText}>{subtitle}</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/(tabs)/home" as any)}>
        <LinearGradient
          colors={["#A855F7", "#7C3AED", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyCta}
        >
          <Text style={styles.emptyCtaText}>Browse events</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TK_BG,
  },
  safeArea: {
    flex: 1,
  },

  // Header
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: TK_STROKE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    color: TK_TEXT,
    letterSpacing: -1,
    lineHeight: 30,
  },
  headerSubtitle: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: TK_TEXT_DIM,
    marginTop: 4,
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 22,
    borderBottomWidth: 1,
    borderBottomColor: TK_STROKE,
    marginBottom: 16,
  },
  tab: {
    position: "relative",
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabLabel: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 14,
    letterSpacing: -0.14,
  },
  tabLabelActive: {
    color: TK_TEXT,
  },
  tabLabelInactive: {
    color: TK_TEXT_MUTE,
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillActive: {
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  countPillInactive: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
  },
  countTextActive: {
    color: TK_PURPLE_SOFT,
  },
  countTextInactive: {
    color: TK_TEXT_MUTE,
  },
  tabUnderline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
  },

  // Lists
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  ticketList: {
    gap: 14,
  },

  // Empty
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 80,
    opacity: 0.3,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    color: TK_TEXT,
    marginBottom: 8,
  },
  emptyStateText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: TK_TEXT_DIM,
    textAlign: "center",
    marginBottom: 20,
  },
  emptyCta: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyCtaText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#fff",
    letterSpacing: 0.2,
  },

  // Booking card
  bookingCard: {
    backgroundColor: TK_SURFACE,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: TK_STROKE,
  },
  bookingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bookingServiceName: {
    flex: 1,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 16,
    color: TK_TEXT,
    marginRight: 8,
    letterSpacing: -0.2,
  },
  bookingStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bookingStatusText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  bookingCategory: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: TK_TEXT_MUTE,
    marginBottom: 10,
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  bookingDetail: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: TK_TEXT_DIM,
  },
  chatVendorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  chatVendorButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: TK_PURPLE_SOFT,
    letterSpacing: 0.1,
  },
});
