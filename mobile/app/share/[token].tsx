import React, { useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { Avatar } from "@/components/shared/Avatar";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

interface Event {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  shareToken: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsRemaining?: number;
  createdBy: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
  invitedUsers: { _id: string }[];
}

export default function ShareEventScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    loadUser();
    fetchEvent();
  }, [token]);

  const loadUser = async () => {
    try {
      const userJson = await SecureStore.getItemAsync("user");
      const authToken = await SecureStore.getItemAsync("token");
      if (userJson && authToken) {
        const user = JSON.parse(userJson);
        setCurrentUserId(user.id);
        setIsAuthenticated(true);
      }
    } catch {}
  };

  const fetchEvent = async () => {
    try {
      const response = await fetch(`${BASE_URL}/events/share/${token}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setEvent(data.event);
      } else {
        const title = response.status === 410 ? "Unavailable" : "Not Found";
        const fallback =
          response.status === 410
            ? "This event is no longer available."
            : "We couldn't find this event. The link may be incorrect.";
        Alert.alert(title, data?.message || fallback, [
          { text: "OK", onPress: () => router.replace("/(tabs)/home") },
        ]);
      }
    } catch {
      Alert.alert("Error", "Failed to load event details.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!isAuthenticated) {
      Alert.alert(
        "Login Required",
        "You need to log in to join this event.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Log In", onPress: () => router.push("/login") },
        ]
      );
      return;
    }

    setJoining(true);
    try {
      const authToken = await SecureStore.getItemAsync("token");
      const response = await fetch(`${BASE_URL}/events/share/${token}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Joined!", "You've been added to the event.", [
          { text: "View Event", onPress: () => router.replace(`/event/${event?._id}` as any) },
        ]);
      } else {
        Alert.alert("Info", data.message || "Could not join event.");
      }
    } catch {
      Alert.alert("Error", "Failed to join event.");
    } finally {
      setJoining(false);
    }
  };

  const isCreator = event?.createdBy._id === currentUserId;
  const alreadyJoined =
    event?.invitedUsers.some((u) => u._id === currentUserId) || isCreator;

  if (loading) {
    return (
      <LinearGradient colors={["#0f0f1a", "#1a1a2e"]} style={styles.container}>
        <ActivityIndicator size="large" color="#a855f7" style={{ flex: 1 }} />
      </LinearGradient>
    );
  }

  if (!event) return null;

  const eventDate = new Date(event.date);

  return (
    <LinearGradient colors={["#0f0f1a", "#1a1a2e"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/(tabs)/home")}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Invite</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {event.image ? (
          <Image source={{ uri: event.image }} style={styles.eventImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="calendar-outline" size={64} color="#6b7280" />
          </View>
        )}

        <View style={styles.content}>
          {/* Badge */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, event.isPublic ? styles.badgePublic : styles.badgePrivate]}>
              <Text style={styles.badgeText}>{event.isPublic ? "Public" : "Private"}</Text>
            </View>
            {event.isPaid && (
              <View style={[styles.badge, styles.badgePaid]}>
                <Text style={styles.badgeText}>£{event.ticketPrice}</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{event.title}</Text>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={18} color="#a855f7" />
            <Text style={styles.detailText}>
              {eventDate.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              at{" "}
              {eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location" size={18} color="#a855f7" />
            <Text style={styles.detailText}>{event.location}</Text>
          </View>

          {event.description ? (
            <Text style={styles.description}>{event.description}</Text>
          ) : null}

          {/* Organiser */}
          <View style={styles.organiserCard}>
            <Avatar uri={event.createdBy.profilePicture} name={event.createdBy.username} size={40} />
            <View>
              <Text style={styles.organiserLabel}>Organised by</Text>
              <Text style={styles.organiserName}>{event.createdBy.username}</Text>
            </View>
          </View>

          {/* CTA */}
          {isCreator ? (
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => router.push(`/event/${event._id}` as any)}
            >
              <Text style={styles.viewButtonText}>View Event</Text>
            </TouchableOpacity>
          ) : alreadyJoined ? (
            <View style={styles.joinedBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.joinedText}>You're already attending this event</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.joinButton}
              onPress={handleJoin}
              disabled={joining}
            >
              <LinearGradient
                colors={["#a855f7", "#7c3aed"]}
                style={styles.joinGradient}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="enter-outline" size={20} color="#fff" />
                    <Text style={styles.joinButtonText}>Join Event</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: scaleFontSize(18), fontFamily: Fonts.bold, color: "#fff" },
  scroll: { paddingBottom: 40 },
  eventImage: { width: "100%", height: 240, resizeMode: "cover" },
  placeholderImage: {
    width: "100%",
    height: 240,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: getResponsivePadding() },
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgePublic: { backgroundColor: "rgba(16, 185, 129, 0.15)" },
  badgePrivate: { backgroundColor: "rgba(168, 85, 247, 0.15)" },
  badgePaid: { backgroundColor: "rgba(245, 158, 11, 0.15)" },
  badgeText: { fontSize: scaleFontSize(12), fontFamily: Fonts.semiBold, color: "#e5e7eb" },
  title: {
    fontSize: scaleFontSize(26),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 16,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  detailText: { fontSize: scaleFontSize(15), fontFamily: Fonts.regular, color: "#d1d5db", flex: 1 },
  description: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 21,
    marginTop: 12,
    marginBottom: 4,
  },
  organiserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#374151",
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  organiserLabel: { fontSize: scaleFontSize(12), fontFamily: Fonts.regular, color: "#9ca3af" },
  organiserName: { fontSize: scaleFontSize(15), fontFamily: Fonts.semiBold, color: "#fff" },
  joinButton: { borderRadius: 14, overflow: "hidden" },
  joinGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  joinButtonText: { fontSize: scaleFontSize(16), fontFamily: Fonts.bold, color: "#fff" },
  joinedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#10b981",
  },
  joinedText: { fontSize: scaleFontSize(14), fontFamily: Fonts.semiBold, color: "#10b981" },
  viewButton: {
    backgroundColor: "#1f1f2e",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  viewButtonText: { fontSize: scaleFontSize(16), fontFamily: Fonts.semiBold, color: "#e5e7eb" },
});
