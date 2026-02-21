import React, { useState, useEffect, useCallback } from "react";
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
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { router } from "expo-router";
import ChatListItem from "@/components/chat/ChatListItem";
import chatService, { Chat } from "@/services/chat.service";
import { BASE_URL } from "@/constants/constants";
import * as SecureStore from "expo-secure-store";
import { capitalize } from "@/libs/helpers";
import { scaleFontSize } from "@/utils/responsive";
import socketService from "@/services/socket.service";

interface SearchUser {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
  isVendor: boolean;
  businessName?: string;
}

export default function VendorChatsTab() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<SearchUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const fetchChats = async () => {
    try {
      const chats = await chatService.getUserChats();
      setChats(chats);
      setFilteredChats(chats);
    } catch (error: any) {
      console.error("Error fetching chats:", error);
      Alert.alert("Error", "Failed to load chats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      fetchChats();
    }
  }, [currentUserId]);

  useEffect(() => {
    socketService.on({
      onNewMessage: (message) => {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat._id !== message.chat) return chat;

            const isFromCurrentUser = message.sender._id === currentUserId;
            const unreadObj =
              (chat.unreadCount as unknown as Record<string, number>) || {};
            const currentUnread = unreadObj[currentUserId] || 0;

            return {
              ...chat,
              lastMessage: message,
              unreadCount: isFromCurrentUser
                ? chat.unreadCount
                : ({
                    ...unreadObj,
                    [currentUserId]: currentUnread + 1,
                  } as unknown as Map<string, number>),
            };
          })
        );
      },

      onMessageRead: ({ chatId }) => {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat._id !== chatId || !chat.lastMessage) return chat;
            if (chat.lastMessage.sender._id !== currentUserId) return chat;

            const unreadObj =
              (chat.unreadCount as unknown as Record<string, number>) || {};

            return {
              ...chat,
              lastMessage: {
                ...chat.lastMessage,
                read: true,
              },
              unreadCount: {
                ...unreadObj,
                [currentUserId]: 0,
              } as unknown as Map<string, number>,
            };
          })
        );
      },
    });

    return () => socketService.off();
  }, [currentUserId]);

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
    if (!chats) return;

    if (searchQuery.trim() === "") {
      setFilteredChats(chats);
    } else {
      const filtered = chats.filter((chat) => {
        const chatName = chat.name || "Direct Chat";
        return chatName.toLowerCase().includes(searchQuery.toLowerCase());
      });
      setFilteredChats(filtered);
    }
  }, [searchQuery, chats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChats();
  }, []);

  const handleChatPress = (chat: Chat) => {
    router.push({
      pathname: "/chat/[id]",
      params: { id: chat._id },
    });
  };

  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }

    try {
      setSearchingUsers(true);
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(
        `${BASE_URL}/users/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setSearchedUsers(data.users);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleUserSelect = async (user: SearchUser) => {
    try {
      setNewChatModalVisible(false);
      setUserSearchQuery("");
      setSearchedUsers([]);

      const chat = await chatService.getOrCreateDirectChat(user.id);

      router.push({
        pathname: "/chat/[id]",
        params: { id: chat._id },
      });
    } catch (error) {
      console.error("Error creating chat:", error);
      Alert.alert("Error", "Failed to start chat");
    }
  };

  useEffect(() => {
    if (userSearchQuery.trim().length >= 2) {
      const debounce = setTimeout(() => {
        searchUsers(userSearchQuery);
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchedUsers([]);
    }
  }, [userSearchQuery]);

  const renderChatItem = ({ item }: { item: Chat }) => (
    <ChatListItem
      chat={item}
      currentUserId={currentUserId}
      onPress={() => handleChatPress(item)}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={64} color="#6b7280" />
      <Text style={styles.emptyText}>No conversations yet</Text>
      <Text style={styles.emptySubtext}>
        Start messaging your customers
      </Text>
      <TouchableOpacity
        style={styles.startChatButton}
        onPress={() => setNewChatModalVisible(true)}
      >
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={styles.startChatButtonText}>Start a Chat</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customer Messages</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={() => setNewChatModalVisible(true)}
        >
          <Ionicons name="create-outline" size={24} color="#a855f7" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#6b7280"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Chat List */}
      <FlatList
        data={filteredChats || []}
        renderItem={renderChatItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[
          styles.listContent,
          (!filteredChats || filteredChats.length === 0) &&
            styles.emptyListContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#a855f7"
            colors={["#a855f7"]}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

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
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons
                name="search"
                size={20}
                color="#6b7280"
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users by username or email..."
                placeholderTextColor="#6b7280"
                value={userSearchQuery}
                onChangeText={setUserSearchQuery}
                autoFocus
              />
            </View>

            {searchingUsers && (
              <View style={styles.searchLoadingContainer}>
                <ActivityIndicator size="small" color="#a855f7" />
              </View>
            )}

            <FlatList
              data={searchedUsers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => handleUserSelect(item)}
                >
                  {item.profilePicture ? (
                    <Image
                      source={{ uri: item.profilePicture }}
                      style={styles.userAvatar}
                    />
                  ) : (
                    <View style={styles.userAvatarPlaceholder}>
                      <Ionicons name="person" size={24} color="#a855f7" />
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {capitalize(item.username)}
                    </Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !searchingUsers && userSearchQuery.length >= 2 ? (
                  <View style={styles.emptySearchContainer}>
                    <Ionicons name="people-outline" size={48} color="#6b7280" />
                    <Text style={styles.emptySearchText}>No users found</Text>
                  </View>
                ) : !searchingUsers && userSearchQuery.length < 2 ? (
                  <View style={styles.emptySearchContainer}>
                    <Ionicons name="search-outline" size={48} color="#6b7280" />
                    <Text style={styles.emptySearchText}>
                      Search for customers to message
                    </Text>
                  </View>
                ) : null
              }
              contentContainerStyle={styles.userListContent}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  newChatButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 20,
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 8,
  },
  startChatButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#a855f7",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  startChatButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    height: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  modalSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: "#374151",
    borderRadius: 12,
    height: 48,
  },
  searchLoadingContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  userListContent: {
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
  userEmail: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  emptySearchContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptySearchText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
  },
});
