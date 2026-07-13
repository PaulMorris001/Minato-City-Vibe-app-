import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import { useStripePayment } from "@/hooks/useStripePayment";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function FavoritesPage() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { payForTicket } = useStripePayment();
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`${BASE_URL}/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
      } else {
        Alert.alert("Error", data.message || "Failed to load favorites");
      }
    } catch {
      Alert.alert("Error", "Failed to load favorites");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchFavorites(); }, []));

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    // The hook runs checkout AND confirms server-side before returning.
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }
    Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
    fetchFavorites();
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/events/${eventId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success!", `You've joined "${eventTitle}"`);
        fetchFavorites();
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch {
      Alert.alert("Error", "Failed to join event");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <LinearGradient
        colors={[colors.background, colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.header}
      >
        <GlassBackButton style={styles.backButton} />
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Favorites</Text>
          <Text style={styles.headerSubtitle}>
            {events.length} saved {events.length === 1 ? "event" : "events"}
          </Text>
        </View>
      </LinearGradient>

      {loading && events.length === 0 ? (
        <EventCardSkeleton count={4} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.cardWrapper}>
              <PublicEventCard
                event={item}
                onPurchaseTicket={handlePurchaseTicket}
                onJoinFreeEvent={handleJoinFreeEvent}
              />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={64} color={colors.border} />
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptyText}>
                Tap the heart icon on any event to save it here.
              </Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push("/public-events" as any)}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.browseGradient}
                >
                  <Text style={styles.browseText}>Browse Events</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchFavorites(); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
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
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 16 : 60,
    paddingBottom: 20,
    paddingHorizontal: getResponsivePadding(),
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  backButton: {
    padding: 4,
    marginBottom: 2,
  },
  headerContent: {},
  headerTitle: {
    fontSize: scaleFontSize(26),
    fontFamily: Fonts.bold,
    color: c.text,
  },
  headerSubtitle: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 2,
  },
  listContent: {
    padding: getResponsivePadding(),
    paddingBottom: 40,
    gap: 16,
  },
  cardWrapper: {
    width: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: scaleFontSize(22),
    fontFamily: Fonts.bold,
    color: c.text,
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  browseButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  browseGradient: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  browseText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: c.text,
  },
});
