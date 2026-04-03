import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function notifIcon(type: string) {
  switch (type) {
    case "ticket_sold": return "ticket";
    case "guide_sold": return "book";
    case "event_invite": return "mail";
    case "invite_accepted": return "checkmark-circle";
    case "event_update": return "calendar";
    case "new_follower": return "person-add";
    case "verification_approved": return "shield-checkmark";
    case "verification_rejected": return "shield-outline";
    default: return "notifications";
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) { router.replace("/login"); return; }
      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setNotifications(data.notifications || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markAllRead = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      await fetch(`${BASE_URL}/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      await fetch(`${BASE_URL}/notifications/${id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
    } catch {}
  };

  useFocusEffect(useCallback(() => { fetchNotifications(); }, []));

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotifPress = (item: Notification) => {
    markRead(item._id);
    if (item.type === "new_follower" && item.data?.followerId) {
      router.push({ pathname: "/user-profile", params: { userId: item.data.followerId } } as any);
    } else if (item.type === "event_invite" && item.data?.eventId) {
      router.push({ pathname: "/event/[id]", params: { id: item.data.eventId } } as any);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifItem, !item.read && styles.notifItemUnread]}
      onPress={() => handleNotifPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.notifIcon, !item.read && styles.notifIconUnread]}>
        <Ionicons name={notifIcon(item.type) as any} size={20} color={item.read ? "#6b7280" : "#a855f7"} />
      </View>
      <View style={styles.notifBody}>
        <Text style={styles.notifTitle}>{item.title}</Text>
        <Text style={styles.notifText}>{item.body}</Text>
        <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#0f0f1a", "#1a1a2e", "#16213e"]} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor="#a855f7"
              colors={["#a855f7"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={64} color="#374151" />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>
                You'll see ticket sales, event updates, and more here.
              </Text>
            </View>
          }
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
  headerContent: { flex: 1 },
  headerTitle: {
    fontSize: scaleFontSize(26),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.regular,
    color: "#a855f7",
    marginTop: 2,
  },
  markAllBtn: { paddingBottom: 4 },
  markAllText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.medium,
    color: "#a855f7",
  },
  list: { padding: getResponsivePadding(), gap: 8, paddingBottom: 40 },
  notifItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f2e",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  notifItemUnread: {
    borderColor: "rgba(168,85,247,0.3)",
    backgroundColor: "rgba(168,85,247,0.05)",
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  notifIconUnread: { backgroundColor: "rgba(168,85,247,0.15)" },
  notifBody: { flex: 1 },
  notifTitle: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginBottom: 2,
  },
  notifText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 18,
  },
  notifTime: {
    fontSize: scaleFontSize(11),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#a855f7",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
});
