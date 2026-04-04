import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router, useFocusEffect } from "expo-router";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import ProfileHeaderSkeleton from "@/components/skeletons/ProfileHeaderSkeleton";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import followService from "@/services/follow.service";

interface UserProfile {
  _id: string;
  username: string;
  email: string;
  profilePicture?: string;
  isVendor?: boolean;
  verified?: boolean;
  followersCount: number;
  followingCount: number;
}

interface UserEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  userStatus: string;
  invitedUsers: any[];
}

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const res = await axios.get(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = res.data.user;
      setUser({
        _id: userData._id,
        username: userData.username,
        email: userData.email,
        profilePicture: userData.profilePicture || "",
        isVendor: userData.isVendor,
        verified: userData.verified || false,
        followersCount: userData.followersCount || 0,
        followingCount: userData.followingCount || 0,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchEvents = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const res = await axios.get(`${BASE_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Show events that the user created or accepted
      const allEvents = res.data.events || [];
      const filtered = allEvents.filter(
        (e: any) => e.userStatus === "creator" || e.userStatus === "accepted"
      );
      setEvents(filtered);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([fetchProfile(), fetchEvents()]);
    if (!silent) setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderEventItem = ({ item }: { item: UserEvent }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() =>
        router.push({ pathname: "/event/[id]", params: { id: item._id } })
      }
      activeOpacity={0.7}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.eventImage} />
      ) : (
        <LinearGradient
          colors={["#a855f7", "#7c3aed"]}
          style={styles.eventImagePlaceholder}
        >
          <Ionicons name="calendar" size={24} color="#fff" />
        </LinearGradient>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.eventDate}>{formatDate(item.date)}</Text>
        <Text style={styles.eventLocation} numberOfLines={1}>
          {item.location}
        </Text>
      </View>
      <View style={styles.eventBadge}>
        <Text style={styles.eventBadgeText}>
          {item.userStatus === "creator" ? "Created" : "Attended"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View>
      {/* Profile Header — horizontal layout */}
      <View style={styles.profileHeader}>
        {user?.profilePicture ? (
          <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
        ) : (
          <LinearGradient
            colors={["#a855f7", "#7c3aed"]}
            style={styles.avatarPlaceholder}
          >
            <Ionicons name="person" size={36} color="#fff" />
          </LinearGradient>
        )}
        <View style={styles.profileInfo}>
          <View style={styles.usernameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {capitalize(user?.username || "")}
            </Text>
            {user?.verified && (
              <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
            )}
            {user?.isVendor && (
              <View style={styles.vendorBadge}>
                <Ionicons name="briefcase" size={10} color="#fff" />
                <Text style={styles.vendorBadgeText}>Vendor</Text>
              </View>
            )}
          </View>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          {/* Stats inline */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/followers", params: { userId: user?._id } } as any)
              }
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{user?.followersCount || 0}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/following", params: { userId: user?._id } } as any)
              }
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{user?.followingCount || 0}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View>
              <Text style={styles.statNumber}>{events.length}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>
        </View>
      </View>



      {/* Search Users */}
      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => router.push("/search-users" as any)}
        activeOpacity={0.7}
      >
        <Ionicons name="search" size={20} color="#6b7280" />
        <Text style={styles.searchPlaceholder}>Search for users to follow...</Text>
      </TouchableOpacity>

      {/* Events Section Header */}
      <Text style={styles.sectionTitle}>My Events</Text>
    </View>
  );

  const renderEmptyEvents = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={48} color="#6b7280" />
      <Text style={styles.emptyText}>No events yet</Text>
      <Text style={styles.emptySubtext}>
        Create or join events to see them here
      </Text>
    </View>
  );

  if (loading) {
    return (
      <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
        <ProfileHeaderSkeleton eventCount={3} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push("/messages" as any)}
            >
              <Ionicons name="chatbubbles-outline" size={22} color="#a855f7" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push("/settings")}
            >
              <Ionicons name="settings-outline" size={22} color="#a855f7" />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={events}
          renderItem={renderEventItem}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyEvents}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#a855f7"
              colors={["#a855f7"]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    gap: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#a855f7",
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#a855f7",
    flexShrink: 0,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  username: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  email: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  vendorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#a855f7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  vendorBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#4b5563",
  },
  statNumber: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.2)",
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 10,
  },
  searchPlaceholder: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#6b7280",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(55, 65, 81, 0.5)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  eventImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  eventImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  eventInfo: {
    flex: 1,
    marginLeft: 12,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  eventDate: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  eventLocation: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  eventBadge: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eventBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 4,
  },
});
