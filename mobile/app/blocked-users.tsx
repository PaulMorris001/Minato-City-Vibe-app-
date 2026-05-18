import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Fonts } from "@/constants/fonts";
import { Avatar } from "@/components/shared/Avatar";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import {
  getBlockedUsers,
  unblockUser,
  type BlockedUser,
} from "@/services/moderation.service";

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getBlockedUsers();
      setUsers(list);
    } catch (err: any) {
      Alert.alert("Couldn't load", err?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      `Unblock @${user.username}?`,
      "They'll be able to see your content again, and theirs will reappear in your feed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(user._id);
            try {
              await unblockUser(user._id);
              setUsers((prev) => prev.filter((u) => u._id !== user._id));
            } catch (err: any) {
              Alert.alert("Couldn't unblock", err?.message || "Please try again.");
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#0f0f1a", "#1a1a2e", "#16213e"]} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#a855f7" />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="ban-outline" size={48} color="#6b7280" />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptyText}>
            People you block will appear here. You can unblock them at any time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar uri={item.profilePicture} name={item.username} size={40} />
              <Text style={styles.username}>@{item.username}</Text>
              <TouchableOpacity
                style={styles.unblockButton}
                onPress={() => handleUnblock(item)}
                disabled={unblockingId === item._id}
              >
                {unblockingId === item._id ? (
                  <ActivityIndicator color="#a855f7" />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 16 : 60,
    paddingBottom: 20,
    paddingHorizontal: getResponsivePadding(),
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  backButton: { padding: 4, marginBottom: 2 },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    color: "#fff",
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    marginTop: 16,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  list: { padding: getResponsivePadding() },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#a855f7",
    alignItems: "center",
    justifyContent: "center",
  },
  username: {
    flex: 1,
    marginLeft: 12,
    color: "#fff",
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a855f7",
  },
  unblockText: {
    color: "#a855f7",
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
});
