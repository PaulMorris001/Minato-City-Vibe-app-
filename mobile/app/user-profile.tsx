import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import { createUserShareLink } from "@/utils/shareLinks";
import { Guide } from "@/libs/interfaces";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import followService from "@/services/follow.service";
import { Avatar } from "@/components/shared/Avatar";
import chatService from "@/services/chat.service";
import ProfileHeaderSkeleton from "@/components/skeletons/ProfileHeaderSkeleton";
import FollowButton from "@/components/shared/FollowButton";
import ReportBlockSheet from "@/components/shared/ReportBlockSheet";
import ImageViewerModal from "@/components/shared/ImageViewerModal";
import { displayName } from "@/utils/displayName";

interface UserData {
  _id: string;
  username: string;
  email: string;
  profilePicture?: string;
  bio?: string;
  isVendor?: boolean;
  businessName?: string;
  verified?: boolean;
  vendorId?: string;
  vendorName?: string;
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
  const formatPrice = useFormatPrice();
  const [user, setUser] = useState<UserData | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    SecureStore.getItemAsync("user").then((u) => {
      if (u) {
        try {
          const parsed = JSON.parse(u);
          setCurrentUserId(parsed.id || parsed._id);
        } catch {}
      }
    });
  }, []);

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

      // Fetch follow status, counts, user profile, events and guides in parallel
      const [countsRes, statusRes, userRes, eventsRes, guidesRes] = await Promise.all([
        followService.getFollowCounts(userId),
        followService.getFollowStatus(userId),
        axios.get(`${BASE_URL}/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        axios.get(`${BASE_URL}/users/${userId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        axios.get(`${BASE_URL}/users/${userId}/guides`, {
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

      if (guidesRes?.data?.guides) {
        setGuides(guidesRes.data.guides);
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

  const handleShareProfile = async () => {
    if (!userId) return;
    try {
      const url = createUserShareLink(userId);
      const name = capitalize(displayName(user) || "this profile");
      await Share.share({
        message: `Check out ${name} on OurCityvibe\n${url}`,
        url, // iOS uses this for richer share targets; Android ignores it.
        title: displayName(user),
      });
    } catch (err) {
      console.error("Share profile failed:", err);
    }
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

  const openVendorPage = () => {
    if (!user?.vendorId) return;
    router.push({
      pathname: "/vendor-details/[vendorId]",
      params: {
        vendorId: user.vendorId,
        vendorName: user.vendorName || user.businessName || "",
      },
    } as any);
  };

  const renderHeader = () => (
    <View>
      {/* Profile Header — horizontal layout */}
      <View style={styles.profileHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!user?.profilePicture}
          onPress={() => setAvatarViewerVisible(true)}
        >
          <Avatar uri={user?.profilePicture} name={displayName(user)} size={80} />
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <View style={styles.usernameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {capitalize(displayName(user))}
            </Text>
            {user?.verified && (
              <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
            )}
            {user?.isVendor && (
              <TouchableOpacity
                style={styles.vendorBadge}
                onPress={openVendorPage}
                disabled={!user?.vendorId}
                activeOpacity={0.7}
              >
                <Ionicons name="briefcase" size={10} color="#fff" />
                <Text style={styles.vendorBadgeText}>Vendor</Text>
              </TouchableOpacity>
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
            <View style={styles.statDivider} />
            <View>
              <Text style={styles.statNumber}>{guides.length}</Text>
              <Text style={styles.statLabel}>Guides</Text>
            </View>
          </View>
        </View>
      </View>

      {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}

      {/* Vendor page link */}
      {user?.isVendor && !!user?.vendorId && (
        <TouchableOpacity
          style={styles.vendorLinkRow}
          onPress={openVendorPage}
          activeOpacity={0.7}
        >
          <Ionicons name="storefront-outline" size={16} color="#a855f7" />
          <Text style={styles.vendorLinkText}>View vendor page</Text>
          <Ionicons name="chevron-forward" size={16} color="#a855f7" />
        </TouchableOpacity>
      )}

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

  const renderGuidesSection = () => {
    if (guides.length === 0) return null;
    return (
      <View style={{ marginTop: events.length > 0 ? 24 : 0 }}>
        <Text style={styles.sectionTitle}>Guides</Text>
        {guides.map((guide) => (
          <TouchableOpacity
            key={guide._id}
            style={styles.guideCard}
            onPress={() =>
              router.push({ pathname: "/guide/[id]", params: { id: guide._id } })
            }
            activeOpacity={0.7}
          >
            {guide.coverImage ? (
              <Image source={{ uri: guide.coverImage }} style={styles.eventImage} />
            ) : (
              <LinearGradient
                colors={["#a855f7", "#7c3aed"]}
                style={styles.eventImagePlaceholder}
              >
                <Ionicons name="book" size={20} color="#fff" />
              </LinearGradient>
            )}
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle} numberOfLines={1}>{guide.title}</Text>
              <Text style={styles.eventLocation} numberOfLines={1}>
                {guide.city}{guide.cityState ? `, ${guide.cityState}` : ""} • {guide.topic}
              </Text>
              <Text style={styles.guidePrice}>
                {guide.price === 0 ? "FREE" : `$${formatPrice(guide.price)}`}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

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
        <ProfileHeaderSkeleton eventCount={3} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {capitalize(user?.username || "")}
          </Text>
          <View style={styles.headerActions}>
            {userId ? (
              <TouchableOpacity
                onPress={handleShareProfile}
                style={styles.headerAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Share profile"
              >
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
            {userId && currentUserId && userId !== currentUserId ? (
              <TouchableOpacity
                onPress={() => setReportSheetVisible(true)}
                style={styles.headerAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Report or block user"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          renderItem={renderEventItem}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderGuidesSection}
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
      {userId ? (
        <ReportBlockSheet
          visible={reportSheetVisible}
          onClose={() => setReportSheetVisible(false)}
          targetType="user"
          targetId={userId}
          targetUserId={userId}
          targetUsername={user?.username}
          currentUserId={currentUserId}
          onBlocked={() => goBack()}
        />
      ) : null}
      {user?.profilePicture ? (
        <ImageViewerModal
          visible={avatarViewerVisible}
          images={[user.profilePicture]}
          onClose={() => setAvatarViewerVisible(false)}
        />
      ) : null}
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerAction: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
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
    flexShrink: 1,
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
  bio: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 20,
    marginBottom: 16,
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
  guideCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(55, 65, 81, 0.5)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  guidePrice: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#a855f7",
    marginTop: 4,
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
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  messageButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  vendorLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.2)",
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  vendorLinkText: {
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
