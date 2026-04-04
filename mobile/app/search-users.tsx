import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router } from "expo-router";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import * as SecureStore from "expo-secure-store";
import FollowButton from "@/components/shared/FollowButton";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";

interface SearchUser {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
  isVendor: boolean;
  businessName?: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isMutual: boolean;
}

export default function SearchUsersScreen() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const searchUsers = async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setUsers([]);
      return;
    }

    try {
      setSearching(true);
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(
        `${BASE_URL}/users/search?query=${encodeURIComponent(searchQuery)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (query.trim().length >= 2) {
      const debounce = setTimeout(() => searchUsers(query), 300);
      return () => clearTimeout(debounce);
    } else {
      setUsers([]);
    }
  }, [query]);

  const renderUserItem = ({ item }: { item: SearchUser }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() =>
        router.push({
          pathname: "/user-profile",
          params: { userId: item.id },
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
        <Text style={styles.userSub}>
          {item.isVendor && item.businessName ? item.businessName : item.email}
        </Text>
        {item.isFollowedBy && !item.isFollowing && (
          <Text style={styles.followsYou}>Follows you</Text>
        )}
      </View>
      <FollowButton
        userId={item.id}
        initialIsFollowing={item.isFollowing}
        initialIsMutual={item.isMutual}
        size="small"
      />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find People</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username or email..."
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {searching && <UserListItemSkeleton count={4} />}

        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !searching && query.length >= 2 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : !searching && query.length < 2 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>
                  Search for people to follow
                </Text>
              </View>
            ) : null
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: "#374151",
    borderRadius: 12,
    height: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  searchingContainer: {
    paddingVertical: 20,
    alignItems: "center",
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
  followsYou: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#a855f7",
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
  },
});
