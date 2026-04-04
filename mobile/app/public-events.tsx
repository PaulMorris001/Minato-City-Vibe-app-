import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import * as SecureStore from "expo-secure-store";
import { BASE_URL, CITIES } from "@/constants/constants";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import { useStripePayment } from "@/hooks/useStripePayment";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";

export default function PublicEventsPage() {
  const router = useRouter();
  const { payForTicket } = useStripePayment();
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const EVENTS_PER_PAGE = 10;

  const fetchPublicEvents = async (pageNum: number, isRefresh = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      }

      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const cityParam = selectedCity ? `&city=${encodeURIComponent(selectedCity)}` : "";
      const response = await fetch(
        `${BASE_URL}/events/public/explore?page=${pageNum}&limit=${EVENTS_PER_PAGE}${cityParam}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        const newEvents = data.events || [];

        if (isRefresh || pageNum === 1) {
          setPublicEvents(newEvents);
        } else {
          setPublicEvents((prev) => [...prev, ...newEvents]);
        }

        setTotalEvents(data.total || newEvents.length);
        setHasMore(newEvents.length === EVENTS_PER_PAGE);
      } else {
        Alert.alert("Error", data.message || "Failed to load events");
      }
    } catch (error) {
      console.error("Fetch public events error:", error);
      Alert.alert("Error", "Failed to load events. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true);
  }, [selectedCity]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPublicEvents(nextPage);
    }
  }, [loading, hasMore, page]);

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }

    // Confirm with backend — this actually creates the ticket in the DB
    const token = await SecureStore.getItemAsync("token");
    const confirmRes = await fetch(`${BASE_URL}/stripe/confirm/ticket/${eventId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
    });

    if (confirmRes.ok) {
      Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
      // Notify event creator that a ticket was sold
      fetch(`${BASE_URL}/notifications/sold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ticket", id: eventId }),
      }).catch(() => {});
      fetchPublicEvents(1, true);
      setPage(1);
    } else {
      const d = await confirmRes.json();
      Alert.alert("Error", d.message || "Payment succeeded but ticket could not be issued. Please contact support.");
    }
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const response = await fetch(`${BASE_URL}/events/${eventId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success!", `You've joined "${eventTitle}"`);
        // Refresh the current page to show updated status
        fetchPublicEvents(1, true);
        setPage(1);
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch (error) {
      console.error("Join event error:", error);
      Alert.alert("Error", "Failed to join event");
    }
  };

  const renderEventItem = ({ item, index }: { item: PublicEvent; index: number }) => {
    // Calculate if this is left or right column
    const isLeftColumn = index % 2 === 0;

    return (
      <View
        style={[
          styles.eventCardWrapper,
          isLeftColumn ? styles.leftColumn : styles.rightColumn,
        ]}
      >
        <PublicEventCard
          event={item}
          onPurchaseTicket={handlePurchaseTicket}
          onJoinFreeEvent={handleJoinFreeEvent}
        />
      </View>
    );
  };

  const renderFooter = () => {
    if (!loading || page === 1) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#a855f7" />
        <Text style={styles.loadingText}>Loading more events...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Public Events</Text>
        <Text style={styles.emptyText}>
          There are no public events available at the moment. Check back later!
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={["#0f0f1a", "#1a1a2e", "#16213e"]}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Public Events</Text>
          <Text style={styles.headerSubtitle}>
            {totalEvents} {totalEvents === 1 ? "event" : "events"} available
          </Text>
        </View>
      </LinearGradient>

      {/* City Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedCity && styles.filterChipActive]}
          onPress={() => setSelectedCity(null)}
        >
          <Text style={[styles.filterChipText, !selectedCity && styles.filterChipTextActive]}>
            All Cities
          </Text>
        </TouchableOpacity>
        {CITIES.map((city) => (
          <TouchableOpacity
            key={city._id}
            style={[styles.filterChip, selectedCity === city.name && styles.filterChipActive]}
            onPress={() => setSelectedCity(selectedCity === city.name ? null : city.name)}
          >
            <Text style={[styles.filterChipText, selectedCity === city.name && styles.filterChipTextActive]}>
              {city.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events List */}
      {loading && page === 1 ? (
        <EventCardSkeleton count={6} />
      ) : (
        <FlatList
          data={publicEvents}
          renderItem={renderEventItem}
          keyExtractor={(item) => item._id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#a855f7"
              colors={["#a855f7"]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 20 : 60,
    paddingBottom: 24,
    paddingHorizontal: getResponsivePadding(),
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  backButton: {
    padding: 4,
    marginBottom: 4,
  },
  headerContent: {},
  headerTitle: {
    fontSize: scaleFontSize(28),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  listContent: {
    padding: getResponsivePadding(),
    paddingTop: 16,
  },
  eventCardWrapper: {
    flex: 1,
    marginBottom: 16,
  },
  leftColumn: {
    marginRight: 8,
  },
  rightColumn: {
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 12,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 22,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
  },
  filterChipActive: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  filterChipText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.medium,
    color: "#9ca3af",
  },
  filterChipTextActive: {
    color: "#fff",
  },
});
