import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Chat } from "@/services/chat.service";
import { capitalize } from "@/libs/helpers";
import { displayName } from "@/utils/displayName";
import { Avatar } from "@/components/shared/Avatar";

const CH_TEXT = "#F4EEFF";
const CH_TEXT_DIM = "rgba(244,238,255,0.62)";
const CH_TEXT_MUTE = "rgba(244,238,255,0.42)";
const CH_PURPLE_SOFT = "#C084FC";

interface ChatListItemProps {
  chat: Chat;
  currentUserId: string;
  isTyping?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH < 24) return `${diffH}h`;
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getMapValue<T>(obj: any, key: string): T | undefined {
  if (!obj) return undefined;
  if (typeof obj.get === "function") return obj.get(key);
  return obj[key];
}

export default function ChatListItem({
  chat,
  currentUserId,
  isTyping = false,
  onPress,
  onLongPress,
}: ChatListItemProps) {
  const getChatInfo = () => {
    if (chat.type === "group") {
      return {
        name: chat.name || "Group Chat",
        image: chat.groupImage,
      };
    } else {
      const otherUser = chat.participants.find((p) => p._id !== currentUserId);
      return {
        name: displayName(otherUser) || "Unknown User",
        image: otherUser?.profilePicture,
      };
    }
  };

  const chatInfo = getChatInfo();
  const unreadCount = (getMapValue<number>(chat.unreadCount, currentUserId) as number) || 0;
  const lastMessage = chat.lastMessage;
  const isUnread = unreadCount > 0;
  const isPinned = (chat.pinnedBy || []).some((p) => p === currentUserId);
  const isMuted = !!getMapValue<boolean>(chat.isMuted, currentUserId);
  const eventRef = chat.event;

  const lastFromMe = lastMessage?.sender?._id === currentUserId;
  const lastIsRead = (lastMessage as any)?.read === true || lastMessage?.status === "read";

  const getLastMessagePreview = () => {
    if (!lastMessage) return null;
    switch (lastMessage.type) {
      case "text":
        return lastMessage.content || "";
      case "image":
        return "📷 Photo";
      case "event":
        return "📅 Event";
      case "system":
        return lastMessage.content || "";
      default:
        return "";
    }
  };

  const previewText = getLastMessagePreview();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isUnread && !isMuted ? styles.containerUnread : null,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
    >
      {isPinned && (
        <LinearGradient
          colors={["#A855F7", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.pinnedBar}
        />
      )}

      <View style={styles.avatarWrap}>
        <Avatar uri={chatInfo.image} name={chatInfo.name} size={48} />
        {chat.type === "group" && (
          <View style={styles.groupGlyphWrap}>
            <LinearGradient
              colors={["#A855F7", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.groupGlyph}
            >
              <Ionicons name="people" size={9} color="#fff" />
            </LinearGradient>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text
            style={[
              styles.name,
              isMuted ? styles.nameMuted : null,
            ]}
            numberOfLines={1}
          >
            {capitalize(chatInfo.name)}
          </Text>
          {isPinned && (
            <Ionicons name="star" size={11} color={CH_PURPLE_SOFT} style={{ marginLeft: 4 }} />
          )}
          {isMuted && (
            <Ionicons name="notifications-off" size={11} color={CH_TEXT_MUTE} style={{ marginLeft: 4 }} />
          )}
          {eventRef && chat.type === "group" && (
            <View style={styles.eventTag}>
              <Text style={styles.eventTagText} numberOfLines={1}>
                🎟 {(() => {
                  if (!eventRef.date) return "EVENT";
                  const d = new Date(eventRef.date);
                  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
                })()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footerRow}>
          {isTyping ? (
            <Text style={[styles.preview, styles.previewTyping]} numberOfLines={1}>
              typing…
            </Text>
          ) : previewText !== null ? (
            <View style={styles.previewRow}>
              {lastFromMe && lastMessage?.type !== "system" && (
                <Ionicons
                  name={lastIsRead ? "checkmark-done" : "checkmark"}
                  size={12}
                  color={lastIsRead ? CH_PURPLE_SOFT : CH_TEXT_MUTE}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text
                style={[
                  styles.preview,
                  isUnread && !isMuted ? styles.previewUnread : null,
                ]}
                numberOfLines={1}
              >
                {previewText}
              </Text>
            </View>
          ) : (
            <Text style={[styles.preview, styles.previewEmpty]} numberOfLines={1}>
              Say hi 👋
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightCol}>
        {lastMessage ? (
          <Text style={[styles.time, isUnread && !isMuted ? styles.timeUnread : null]}>
            {formatTime(lastMessage.createdAt)}
          </Text>
        ) : (
          <View style={{ height: 12 }} />
        )}
        {unreadCount > 0 ? (
          isMuted ? (
            <View style={[styles.unreadPill, styles.unreadPillMuted]}>
              <Text style={styles.unreadCountMuted}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : (
            <LinearGradient
              colors={["#A855F7", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.unreadPill}
            >
              <Text style={styles.unreadCount}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </LinearGradient>
          )
        ) : (
          <View style={styles.unreadPlaceholder} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  containerUnread: {
    backgroundColor: "rgba(168,85,247,0.07)",
    borderColor: "rgba(192,132,252,0.18)",
  },
  pinnedBar: {
    position: "absolute",
    left: -6,
    top: "50%",
    marginTop: -11,
    width: 3,
    height: 22,
    borderRadius: 2,
  },

  avatarWrap: {
    position: "relative",
    width: 48,
    height: 48,
  },
  groupGlyphWrap: {
    position: "absolute",
    right: -2,
    bottom: -2,
  },
  groupGlyph: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#0B0613",
  },

  content: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    gap: 4,
  },
  name: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15.5,
    color: CH_TEXT,
    letterSpacing: -0.15,
    flexShrink: 1,
  },
  nameMuted: {
    color: CH_TEXT_DIM,
  },
  eventTag: {
    marginLeft: "auto",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.15)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.3)",
  },
  eventTagText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 9,
    color: CH_PURPLE_SOFT,
    letterSpacing: 0.4,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  preview: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: CH_TEXT_DIM,
  },
  previewUnread: {
    fontFamily: "Outfit_600SemiBold",
    color: CH_TEXT,
  },
  previewTyping: {
    fontFamily: "Outfit_600SemiBold",
    color: CH_PURPLE_SOFT,
  },
  previewEmpty: {
    fontStyle: "italic",
    color: CH_TEXT_MUTE,
  },

  rightCol: {
    alignItems: "flex-end",
    gap: 5,
    minWidth: 38,
  },
  time: {
    fontFamily: "Outfit_500Medium",
    fontSize: 10.5,
    color: CH_TEXT_MUTE,
  },
  timeUnread: {
    fontFamily: "Outfit_700Bold",
    color: CH_PURPLE_SOFT,
  },
  unreadPill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  unreadPillMuted: {
    backgroundColor: "rgba(255,255,255,0.12)",
    shadowOpacity: 0,
  },
  unreadCount: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  unreadCountMuted: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  unreadPlaceholder: {
    width: 20,
    height: 20,
  },
});
