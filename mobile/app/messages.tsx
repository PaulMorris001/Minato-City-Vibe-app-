import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import ChatListItem from "@/components/chat/ChatListItem";
import { Avatar } from "@/components/shared/Avatar";
import chatService, { Chat } from "@/services/chat.service";
import followService, { FollowUser } from "@/services/follow.service";
import * as SecureStore from "expo-secure-store";
import { capitalize } from "@/libs/helpers";
import socketService from "@/services/socket.service";
import ChatListItemSkeleton from "@/components/skeletons/ChatListItemSkeleton";

const CH_BG = "#0B0613";
const CH_TEXT = "#F4EEFF";
const CH_TEXT_DIM = "rgba(244,238,255,0.62)";
const CH_TEXT_MUTE = "rgba(244,238,255,0.42)";
const CH_STROKE = "rgba(255,255,255,0.08)";
const CH_STROKE_HI = "rgba(255,255,255,0.14)";
const CH_PURPLE = "#A855F7";
const CH_PURPLE_SOFT = "#C084FC";

function sortChats(chats: Chat[], currentUserId: string): Chat[] {
  const pinned: Chat[] = [];
  const others: Chat[] = [];
  for (const c of chats) {
    const isPinned = (c.pinnedBy || []).some((p) => p === currentUserId);
    if (isPinned) pinned.push(c);
    else others.push(c);
  }
  const byTime = (a: Chat, b: Chat) => {
    const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
    const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
    return tb - ta;
  };
  return [...pinned.sort(byTime), ...others.sort(byTime)];
}

export default function MessagesScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<FollowUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [typingByChat, setTypingByChat] = useState<Record<string, Set<string>>>({});

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChats = async (silent = false) => {
    try {
      const list = await chatService.getUserChats();
      setChats(list);
    } catch (error: any) {
      console.error("Error fetching chats:", error);
      if (!silent) Alert.alert("Error", "Failed to load chats");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const user = JSON.parse(userJson);
        setCurrentUserId(user.id);
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    fetchChats();
    intervalRef.current = setInterval(() => fetchChats(true), 30000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") fetchChats(true);
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [currentUserId]);

  // Socket: keep inbox in sync
  useEffect(() => {
    socketService.on("messages-screen", {
      onNewMessage: (message) => {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat._id !== message.chat) return chat;
            const isFromCurrentUser = message.sender._id === currentUserId;
            const unreadObj = (chat.unreadCount as unknown as Record<string, number>) || {};
            const currentUnread = unreadObj[currentUserId] || 0;
            return {
              ...chat,
              lastMessage: message,
              unreadCount: isFromCurrentUser
                ? chat.unreadCount
                : ({ ...unreadObj, [currentUserId]: currentUnread + 1 } as unknown as Map<string, number>),
            };
          })
        );
      },

      onMessageRead: ({ chatId }) => {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat._id !== chatId || !chat.lastMessage) return chat;
            if (chat.lastMessage.sender._id !== currentUserId) return chat;
            const unreadObj = (chat.unreadCount as unknown as Record<string, number>) || {};
            return {
              ...chat,
              lastMessage: { ...chat.lastMessage, read: true } as any,
              unreadCount: { ...unreadObj, [currentUserId]: 0 } as unknown as Map<string, number>,
            };
          })
        );
      },

      onTypingStart: ({ chatId, userId }: { chatId: string; userId: string }) => {
        if (!currentUserId || userId === currentUserId) return;
        setTypingByChat((prev) => {
          const next = { ...prev };
          const set = new Set(next[chatId] || []);
          set.add(userId);
          next[chatId] = set;
          return next;
        });
      },
      onTypingStop: ({ chatId, userId }: { chatId: string; userId: string }) => {
        setTypingByChat((prev) => {
          const next = { ...prev };
          const set = new Set(next[chatId] || []);
          set.delete(userId);
          if (set.size === 0) delete next[chatId];
          else next[chatId] = set;
          return next;
        });
      },

      onChatPinned: ({ chatId, pinned }) => {
        setChats((prev) =>
          prev.map((c) => {
            if (c._id !== chatId) return c;
            const pinnedBy = new Set(c.pinnedBy || []);
            if (pinned) pinnedBy.add(currentUserId);
            else pinnedBy.delete(currentUserId);
            return { ...c, pinnedBy: Array.from(pinnedBy) };
          })
        );
      },
      onChatMuted: ({ chatId, muted }) => {
        setChats((prev) =>
          prev.map((c) => {
            if (c._id !== chatId) return c;
            const isMutedMap = { ...(c.isMuted as unknown as Record<string, boolean>) };
            isMutedMap[currentUserId] = muted;
            return { ...c, isMuted: isMutedMap as unknown as Map<string, boolean> };
          })
        );
      },
    });

    return () => socketService.off("messages-screen");
  }, [currentUserId]);

  useEffect(() => {
    if (!chats) return;
    const sorted = sortChats(chats, currentUserId);
    if (searchQuery.trim() === "") {
      setFilteredChats(sorted);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredChats(
        sorted.filter((chat) => {
          const otherUser = chat.participants.find((p) => p._id !== currentUserId);
          const name = chat.type === "group"
            ? (chat.name || "")
            : (otherUser?.username || "");
          return name.toLowerCase().includes(q);
        })
      );
    }
  }, [searchQuery, chats, currentUserId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChats();
  }, []);

  const handleChatPress = (chat: Chat) => {
    router.push({ pathname: "/chat/[id]", params: { id: chat._id } });
  };

  const searchMutualFollows = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const result = await followService.getMutualFollows(query);
      setSearchedUsers(result.users);
    } catch (error) {
      console.error("Error searching mutual follows:", error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleUserSelect = async (user: FollowUser) => {
    try {
      setNewChatModalVisible(false);
      setUserSearchQuery("");
      setSearchedUsers([]);
      const chat = await chatService.getOrCreateDirectChat(user._id);
      router.push({ pathname: "/chat/[id]", params: { id: chat._id } });
    } catch (error: any) {
      console.error("Error creating chat:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to start chat. Make sure you mutually follow each other."
      );
    }
  };

  useEffect(() => {
    if (userSearchQuery.trim().length >= 2) {
      const debounce = setTimeout(() => {
        searchMutualFollows(userSearchQuery);
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchedUsers([]);
    }
  }, [userSearchQuery]);

  const renderChatItem = ({ item }: { item: Chat }) => {
    const typingSet = typingByChat[item._id];
    const isTyping = !!(typingSet && typingSet.size > 0);
    return (
      <ChatListItem
        chat={item}
        currentUserId={currentUserId}
        isTyping={isTyping}
        onPress={() => handleChatPress(item)}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>💬</Text>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>Tap ✎ to start one.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Aurora glow */}
        <View style={styles.aurora} pointerEvents="none" />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={CH_TEXT} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Messages</Text>
              <Text style={styles.headerSubtitle}>
                {chats.length} conversation{chats.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setNewChatModalVisible(true)}
          >
            <LinearGradient
              colors={["#A855F7", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.composeBtn}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={14} color={CH_TEXT_MUTE} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats…"
            placeholderTextColor={CH_TEXT_MUTE}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={CH_TEXT_MUTE} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.skeletonWrap}>
            <ChatListItemSkeleton count={6} />
          </View>
        ) : (
          <FlatList
            data={filteredChats || []}
            renderItem={renderChatItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[
              styles.listContent,
              (!filteredChats || filteredChats.length === 0) && styles.emptyListContent,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={CH_PURPLE}
                colors={[CH_PURPLE]}
              />
            }
            ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/* New Chat Modal */}
      <Modal
        visible={newChatModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setNewChatModalVisible(false);
          setUserSearchQuery("");
          setSearchedUsers([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Message</Text>
              <TouchableOpacity
                onPress={() => {
                  setNewChatModalVisible(false);
                  setUserSearchQuery("");
                  setSearchedUsers([]);
                }}
              >
                <Ionicons name="close" size={22} color={CH_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={14} color={CH_TEXT_MUTE} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search mutual follows…"
                placeholderTextColor={CH_TEXT_MUTE}
                value={userSearchQuery}
                onChangeText={setUserSearchQuery}
                autoFocus
              />
            </View>

            {searchingUsers && (
              <View style={styles.searchingContainer}>
                <ActivityIndicator size="small" color={CH_PURPLE} />
              </View>
            )}

            <FlatList
              data={searchedUsers}
              keyExtractor={(item) => item._id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => handleUserSelect(item)}
                  activeOpacity={0.8}
                >
                  <Avatar uri={item.profilePicture} name={item.username} size={44} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {capitalize(item.username)}
                    </Text>
                    <Text style={styles.userEmail}>
                      {item.isVendor && item.businessName ? item.businessName : item.email}
                    </Text>
                  </View>
                  <View style={styles.mutualBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={CH_PURPLE_SOFT} />
                    <Text style={styles.mutualBadgeText}>Mutual</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !searchingUsers && userSearchQuery.length >= 2 ? (
                  <View style={styles.emptySearchContainer}>
                    <Ionicons name="people-outline" size={42} color={CH_TEXT_MUTE} />
                    <Text style={styles.emptySearchText}>No mutual follows found</Text>
                    <Text style={styles.emptySearchSubtext}>
                      You can only message users who follow you back.
                    </Text>
                  </View>
                ) : !searchingUsers && userSearchQuery.length < 2 ? (
                  <View style={styles.emptySearchContainer}>
                    <Ionicons name="search-outline" size={42} color={CH_TEXT_MUTE} />
                    <Text style={styles.emptySearchText}>
                      Search mutual follows to start chatting.
                    </Text>
                  </View>
                ) : null
              }
              contentContainerStyle={styles.userListContent}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CH_BG,
  },
  safeArea: {
    flex: 1,
  },
  aurora: {
    position: "absolute",
    top: -180,
    left: -60,
    right: -60,
    height: 300,
    borderRadius: 9999,
    backgroundColor: "rgba(168,85,247,0.18)",
    opacity: 0.7,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    color: CH_TEXT,
    letterSpacing: -1,
    lineHeight: 30,
  },
  headerSubtitle: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11.5,
    color: CH_TEXT_DIM,
    marginTop: 4,
  },
  composeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 22,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: CH_TEXT,
    paddingVertical: 0,
  },

  // List
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 24,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 20,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    opacity: 0.4,
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    color: CH_TEXT,
  },
  emptySubtitle: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: CH_TEXT_DIM,
    marginTop: 6,
  },

  // New chat modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#15101F",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    height: "85%",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  modalTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: CH_TEXT,
    letterSpacing: -0.6,
  },
  modalSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 22,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  searchingContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },

  userListContent: {
    paddingHorizontal: 22,
    paddingBottom: 30,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    color: CH_TEXT,
    letterSpacing: -0.1,
  },
  userEmail: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: CH_TEXT_DIM,
    marginTop: 2,
  },
  mutualBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.15)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.3)",
  },
  mutualBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: CH_PURPLE_SOFT,
  },
  emptySearchContainer: {
    paddingVertical: 50,
    alignItems: "center",
  },
  emptySearchText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: CH_TEXT_DIM,
    marginTop: 12,
    textAlign: "center",
  },
  emptySearchSubtext: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: CH_TEXT_MUTE,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 30,
  },
});
