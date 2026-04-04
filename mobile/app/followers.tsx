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
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import followService, { FollowUser } from "@/services/follow.service";
import FollowButton from "@/components/shared/FollowButton";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";

export default function FollowersScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchFollowers = async (pageNum: number = 1, refresh = false) => {
    try {
      if (!userId) return;
      const result = await followService.getFollowers(userId, pageNum);
      if (refresh || pageNum === 1) {
        setUsers(result.users);
      } else {
        setUsers((prev) => [...prev, ...result.users]);
      }
      setHasMore(pageNum < result.pages);
    } catch (error) {
      console.error("Error fetching followers:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFollowers();
  }, [userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchFollowers(1, true);
  }, [userId]);

  const loadMore = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchFollowers(nextPage);
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
      {item.profilePicture ? (
        <Image source={{ uri: item.profilePicture }} style={styles.userAvatar} />
      ) : (
        <View style={styles.userAvatarPlaceholder}>
          <Ionicons name="person" size={24} color="#a855f7" />
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{capitalize(item.username)}</Text>
        {item.isVendor && item.businessName && (
          <Text style={styles.userSub}>{item.businessName}</Text>
        )}
      </View>
      <FollowButton
        userId={item._id}
        initialIsFollowing={item.isFollowing}
        size="small"
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
        <UserListItemSkeleton count={6} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Followers</Text>
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
              tintColor="#a855f7"
              colors={["#a855f7"]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>No followers yet</Text>
            </View>
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
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
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
    borderBottomColor: "#374151",
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
  },
  userAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
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
    color: "#fff",
  },
  userSub: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#6b7280",
    marginTop: 12,
  },
});
