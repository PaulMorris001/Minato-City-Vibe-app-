import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { Fonts } from "@/constants/fonts";
import * as ImagePicker from "expo-image-picker";
import MessageBubble from "@/components/chat/MessageBubble";
import ChatInput from "@/components/chat/ChatInput";
import chatService, { Message, Chat } from "@/services/chat.service";
import socketService from "@/services/socket.service";
import * as SecureStore from "expo-secure-store";
import { capitalize } from "@/libs/helpers";
import { uploadImage } from "@/utils/imageUpload";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const flatListRef = useRef<FlatList>(null);

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

  const loadChatAndMessages = useCallback(async () => {
    try {
      setLoading(true);

      // Load chat details
      const chat = await chatService.getChatById(id);
      setChat(chat);

      // Load messages (backend already returns them in chronological order)
      const messagesData = await chatService.getChatMessages(id);
      setMessages(messagesData.messages);

      // Mark messages as read
      await chatService.markMessagesAsRead(id);

      // Emit socket event to notify others
      if (currentUserId) {
        socketService.markMessagesAsRead(id, currentUserId);
      }
    } catch (error: any) {
      console.error("❌ Error loading chat:", error);
      Alert.alert("Error", "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [id, currentUserId]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!id || !currentUserId) return;

    loadChatAndMessages();
    socketService.joinChat(id);

    socketService.on({
      onNewMessage: (message: Message) => {
        if (message.chat === id) {
          setMessages((prev) => {
            // prevent duplicates
            if (prev.some((m) => m._id === message._id)) return prev;
            return [...prev, message];
          });

          // Auto-mark as read if message is from someone else
          if (message.sender._id !== currentUserId && currentUserId) {
            chatService.markMessagesAsRead(id);
            socketService.markMessagesAsRead(id, currentUserId);
          }
        }
      },
    });

    return () => {
      socketService.leaveChat(id);
      socketService.off();
    };
  }, [id, currentUserId, loadChatAndMessages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || sending) return;

    try {
      setSending(true);
      await chatService.sendMessage(id, {
        type: "text",
        content: content.trim(),
      });

      // Don't add message locally - socket will handle it
      // This prevents duplicate messages

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setSending(true);
        const localUri = result.assets[0].uri;

        // Upload image to Cloudinary
        const token = await SecureStore.getItemAsync("token");
        if (!token) {
          Alert.alert("Error", "Authentication token not found");
          setSending(false);
          return;
        }

        try {
          const uploadResult = await uploadImage(
            localUri,
            "chat_images",
            token
          );

          // Send message with Cloudinary URL
          await chatService.sendMessage(id, {
            type: "image",
            imageUrl: uploadResult.url,
          });

          // Don't add message locally - socket will handle it
          // This prevents duplicate messages

          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        } catch (uploadError: any) {
          console.error("Error uploading image to Cloudinary:", uploadError);
          Alert.alert("Upload Error", "Failed to upload image");
        }
      }
    } catch (error: any) {
      console.error("Error sending image:", error);
      Alert.alert("Error", "Failed to send image");
    } finally {
      setSending(false);
    }
  };

  const getChatName = () => {
    if (!chat) return "";

    if (chat.type === "group") {
      return chat.name || "Group Chat";
    }

    // For direct chats, show the other participant's name
    const otherParticipant = chat.participants.find(
      (p) => p._id !== currentUserId
    );
    return otherParticipant?.username || "User";
  };

  const getChatAvatar = () => {
    if (!chat) return null;

    if (chat.type === "group") {
      return chat.groupImage || null;
    }

    const otherParticipant = chat.participants.find(
      (p) => p._id !== currentUserId
    );
    return otherParticipant?.profilePicture || null;
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.sender._id === currentUserId;
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const showAvatar =
      !previousMessage || previousMessage.sender._id !== item.sender._id;

    return (
      <MessageBubble
        message={item}
        isOwnMessage={isOwnMessage}
        showSender={showAvatar}
      />
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              {getChatAvatar() ? (
                <Image
                  source={{ uri: getChatAvatar()! }}
                  style={styles.headerAvatar}
                />
              ) : (
                <View style={styles.headerAvatarPlaceholder}>
                  <Ionicons
                    name={chat?.type === "group" ? "people" : "person"}
                    size={20}
                    color="#a855f7"
                  />
                </View>
              )}
              <View style={styles.headerTextContainer}>
                <Text style={styles.headerTitle}>
                  {capitalize(getChatName())}
                </Text>
                {chat?.type === "group" && (
                  <Text style={styles.headerSubtitle}>
                    {chat.participants.length} participants
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {
                // Future: Open chat settings
                Alert.alert("Coming Soon", "Chat settings");
              }}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages || []}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={64} color="#6b7280" />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>Start the conversation!</Text>
              </View>
            }
          />

          {/* Input */}
          <ChatInput
            onSend={handleSendMessage}
            onImagePick={handleImagePick}
            disabled={sending}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  moreButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
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
});
