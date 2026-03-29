import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import type { Chat } from "@/services/chat.service";
import { capitalize } from "@/libs/helpers";

interface ChatListItemProps {
  chat: Chat;
  currentUserId: string;
  onPress: () => void;
}

export default function ChatListItem({
  chat,
  currentUserId,
  onPress,
}: ChatListItemProps) {
  // Get chat display info
  const getChatInfo = () => {
    if (chat.type === "group") {
      return {
        name: chat.name || "Group Chat",
        image: chat.groupImage,
        icon: "people" as const,
      };
    } else {
      // Direct chat - find the other participant
      const otherUser = chat.participants.find(
        (p) => p._id !== currentUserId
      );
      return {
        name: otherUser?.username || "Unknown User",
        image: otherUser?.profilePicture,
        icon: "person" as const,
      };
    }
  };

  const chatInfo = getChatInfo();
  const unreadCount = chat.unreadCount?.[currentUserId] || 0;
  const lastMessage = chat.lastMessage;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getLastMessagePreview = () => {
    if (!lastMessage) return "No messages yet";

    const prefix =
      lastMessage.sender._id === currentUserId ? "You: " : "";

    switch (lastMessage.type) {
      case "text":
        return prefix + (lastMessage.content || "");
      case "image":
        return prefix + "📷 Photo";
      case "event":
        return prefix + "📅 Event";
      case "system":
        return lastMessage.content || "";
      default:
        return "";
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        {chatInfo.image ? (
          <Image source={{ uri: chatInfo.image }} style={styles.avatar} cachePolicy="memory-disk" transition={200} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name={chatInfo.icon} size={24} color="#9ca3af" />
          </View>
        )}
        {chat.type === "group" && (
          <View style={styles.groupBadge}>
            <Ionicons name="people" size={12} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {capitalize(chatInfo.name)}
          </Text>
          {lastMessage && (
            <Text style={styles.time}>
              {formatTime(lastMessage.createdAt)}
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text
            style={[styles.lastMessage, unreadCount > 0 && styles.unreadText]}
            numberOfLines={1}
          >
            {getLastMessagePreview()}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#1f1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  groupBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#a855f7",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1f1f2e",
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    flex: 1,
  },
  time: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginLeft: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    flex: 1,
  },
  unreadText: {
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
  },
  unreadBadge: {
    backgroundColor: "#a855f7",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  unreadCount: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
});
