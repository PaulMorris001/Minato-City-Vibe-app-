import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router, useLocalSearchParams } from "expo-router";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import followService from "@/services/follow.service";
import chatService from "@/services/chat.service";
import FollowButton from "@/components/shared/FollowButton";

interface UserData {
  _id: string;
  username: string;
  email: string;
  profilePicture?: string;
  isVendor?: boolean;
  businessName?: string;
  verified?: boolean;
}

interface UserEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  isPublic: boolean;
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [user, setUser] = useState<UserData | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchAll();
    }
  }, [userId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      if (!userId) return;
      const token = await SecureStore.getItemAsync("token");

      // Fetch follow status, counts, user profile and events in parallel
      const [countsRes, statusRes, userRes, eventsRes] = await Promise.all([
        followService.getFollowCounts(userId),
        followService.getFollowStatus(userId),
        axios.get(`${BASE_URL}/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        axios.get(`${BASE_URL}/users/${userId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      setFollowersCount(countsRes.followersCount);
      setFollowingCount(countsRes.followingCount);
      setIsFollowing(statusRes.isFollowing);
      setIsFollowedBy(statusRes.isFollowedBy);
      setIsMutual(statusRes.isMutual);

      if (userRes?.data?.user) {
        setUser(userRes.data.user);
      }

      if (eventsRes?.data?.events) {
        setEvents(eventsRes.data.events);
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleFollowChange = (newIsFollowing: boolean, newIsMutual: boolean) => {
    setIsFollowing(newIsFollowing);
    setIsMutual(newIsMutual);
    setFollowersCount((prev) => prev + (newIsFollowing ? 1 : -1));
  };

  const handleMessage = async () => {
    if (!userId) return;
    try {
      const chat = await chatService.getOrCreateDirectChat(userId);
      router.push({
        pathname: "/chat/[id]",
        params: { id: chat._id },
      });
    } catch (error: any) {
      Alert.alert(
        "Cannot Message",
        "You can only message users who mutually follow you."
      );
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

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
          {/* Stats inline */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/followers", params: { userId } } as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/following", params: { userId } } as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{followingCount}</Text>
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

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <View style={styles.followButtonContainer}>
          <FollowButton
            userId={userId!}
            initialIsFollowing={isFollowing}
            initialIsMutual={isMutual}
            onFollowChange={handleFollowChange}
          />
        </View>
        {isMutual && (
          <TouchableOpacity
            style={styles.messageButton}
            onPress={handleMessage}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#a855f7" />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        )}
      </View>

      {isFollowedBy && !isFollowing && (
        <View style={styles.followsYouBanner}>
          <Ionicons name="person-add" size={16} color="#a855f7" />
          <Text style={styles.followsYouText}>Follows you</Text>
        </View>
      )}

      {events.length > 0 && (
        <Text style={styles.sectionTitle}>Events</Text>
      )}
    </View>
  );

  const renderEventItem = ({ item }: { item: UserEvent }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: item._id } })}
      activeOpacity={0.7}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.eventImage} />
      ) : (
        <LinearGradient
          colors={["#a855f7", "#7c3aed"]}
          style={styles.eventImagePlaceholder}
        >
          <Ionicons name="calendar" size={20} color="#fff" />
        </LinearGradient>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.eventDate}>{formatDate(item.date)}</Text>
        <Text style={styles.eventLocation} numberOfLines={1}>{item.location}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {capitalize(user?.username || "")}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          renderItem={renderEventItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchAll();
              }}
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
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  backButton: { marginRight: 16 },
  headerTitle: {
    flex: 1,
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 8,
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
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  eventImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
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
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    justifyContent: "center",
  },
  followButtonContainer: {
    flex: 1,
  },
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  messageButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  followsYouBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  followsYouText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#a855f7",
  },
});
