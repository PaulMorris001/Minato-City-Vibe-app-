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
import { goBack } from "@/utils/navigation";
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

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function BlockedUsersScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
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
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <LinearGradient colors={[colors.background, colors.backgroundSecondary, colors.backgroundTertiary]} style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Blocked Users</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="ban-outline" size={48} color={colors.textMuted} />
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
                  <ActivityIndicator color={colors.primary} />
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

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
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
    color: c.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    color: c.text,
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    marginTop: 16,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  list: { padding: getResponsivePadding() },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  username: {
    flex: 1,
    marginLeft: 12,
    color: c.text,
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.primary,
  },
  unblockText: {
    color: c.primary,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
});
