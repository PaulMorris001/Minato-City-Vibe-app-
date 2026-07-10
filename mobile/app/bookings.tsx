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
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import TicketCardSkeleton from "@/components/skeletons/TicketCardSkeleton";
import chatService from "@/services/chat.service";
import { useStripePayment } from "@/hooks/useStripePayment";

const TK_BG = "#0B0613";
const TK_SURFACE = "rgba(26,16,48,0.7)";
const TK_STROKE = "rgba(255,255,255,0.08)";
const TK_TEXT = "#F4EEFF";
const TK_TEXT_DIM = "rgba(244,238,255,0.62)";
const TK_TEXT_MUTE = "rgba(244,238,255,0.38)";
const TK_PURPLE_SOFT = "#C084FC";

interface ClientBooking {
  _id: string;
  service: { _id: string; name: string; category?: string };
  vendor: { _id: string; username: string; profilePicture?: string };
  preferredDate: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  paymentStatus?: "unpaid" | "paid" | "refunded";
  priceSnapshot?: { amount: number; currency: string };
}

const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending: "#FCD34D",
  confirmed: "#6EE7B7",
  rejected: "#FCA5A5",
  cancelled: "#9CA3AF",
};

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chattingWith, setChattingWith] = useState<string | null>(null);
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const { payForBooking } = useStripePayment();

  const handlePayBooking = async (bookingId: string) => {
    setPayingFor(bookingId);
    try {
      const result = await payForBooking(bookingId);
      if (!result.success) {
        if (result.error) Alert.alert("Payment Failed", result.error);
        return;
      }
      Alert.alert("Payment complete", "Your booking is paid. The vendor has been notified.");
      fetchBookings();
    } finally {
      setPayingFor(null);
    }
  };

  const fetchBookings = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }
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
      setRefreshing(false);
    }
  };

  const handleChatWithVendor = async (vendorId: string, bookingId: string) => {
    setChattingWith(bookingId);
    try {
      // Client → business conversation: shows in this user's client inbox
      // and in the vendor's dashboard chats
      const chat = await chatService.getOrCreateDirectChat(vendorId, {
        context: "vendor",
        vendorUserId: vendorId,
      });
      router.push(`/chat/${chat._id}` as any);
    } catch {
      Alert.alert("Error", "Could not open chat");
    } finally {
      setChattingWith(null);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={TK_TEXT} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Bookings</Text>
            <Text style={styles.headerSubtitle}>Your service bookings</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/passes" as any)}
            style={styles.passesButton}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={16} color={TK_PURPLE_SOFT} />
            <Text style={styles.passesButtonText}>Passes</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
        >
          {bookingsLoading ? (
            <TicketCardSkeleton count={3} />
          ) : bookings.length === 0 ? (
            <EmptyState
              emoji="🧰"
              title="No bookings yet"
              subtitle="Book a vendor service to see your bookings here."
            />
          ) : (
            <View style={styles.bookingList}>
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
                  {booking.status === "confirmed" &&
                    booking.paymentStatus !== "paid" && (
                      <TouchableOpacity
                        style={styles.payButton}
                        onPress={() => handlePayBooking(booking._id)}
                        disabled={payingFor === booking._id}
                        activeOpacity={0.85}
                      >
                        {payingFor === booking._id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="card-outline" size={16} color="#fff" />
                            <Text style={styles.payButtonText}>
                              Pay {booking.priceSnapshot?.currency || ""}{" "}
                              {booking.priceSnapshot?.amount?.toLocaleString() || ""}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                  {booking.paymentStatus === "paid" && (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#6EE7B7" />
                      <Text style={styles.paidBadgeText}>Paid</Text>
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
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/(tabs)/vendors" as any)}>
        <LinearGradient
          colors={["#A855F7", "#7C3AED", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyCta}
        >
          <Text style={styles.emptyCtaText}>Browse vendors</Text>
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
    marginBottom: 16,
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
  passesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  passesButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 12.5,
    color: TK_PURPLE_SOFT,
    letterSpacing: 0.1,
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

  // Lists
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  bookingList: {
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
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#A855F7",
  },
  payButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#fff",
    letterSpacing: 0.1,
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  paidBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: "#6EE7B7",
  },
});
