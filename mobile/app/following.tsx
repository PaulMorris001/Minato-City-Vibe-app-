import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import followService, { FollowUser } from "@/services/follow.service";
import { displayName } from "@/utils/displayName";
import FollowButton from "@/components/shared/FollowButton";
import { Avatar } from "@/components/shared/Avatar";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function FollowingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchFollowing = async (pageNum: number = 1, refresh = false) => {
    try {
      if (!userId) return;
      const result = await followService.getFollowing(userId, pageNum);
      if (refresh || pageNum === 1) {
        setUsers(result.users);
      } else {
        setUsers((prev) => [...prev, ...result.users]);
      }
      setHasMore(pageNum < result.pages);
    } catch (error) {
      console.error("Error fetching following:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFollowing();
  }, [userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchFollowing(1, true);
  }, [userId]);

  const loadMore = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchFollowing(nextPage);
    }
  };

  const renderUserItem = ({ item }: { item: FollowUser }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() =>
        router.push({
          pathname: "/user-profile",
          params: { userId: item._id },
        } as any)
      }
      activeOpacity={0.7}
    >
      <Avatar uri={item.profilePicture} name={displayName(item)} size={48} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{capitalize(displayName(item))}</Text>
        {item.isMutual && (
          <Text style={styles.mutualLabel}>Follows you back</Text>
        )}
      </View>
      <FollowButton
        userId={item._id}
        initialIsFollowing={item.isFollowing}
        initialIsMutual={item.isMutual}
        size="small"
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <LinearGradient colors={[colors.backgroundSecondary, colors.backgroundTertiary]} style={styles.container}>
        <UserListItemSkeleton count={6} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.backgroundSecondary, colors.backgroundTertiary]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Following</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Not following anyone yet</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: c.text,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.border,
  },
  userAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.text,
  },
  mutualLabel: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.primary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.textMuted,
    marginTop: 12,
  },
});
