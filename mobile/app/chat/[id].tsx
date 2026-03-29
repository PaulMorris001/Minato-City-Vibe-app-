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
  Modal,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { trackEvent } from "@/utils/analytics";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupImage, setEditGroupImage] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
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

      // Track chat opened
      trackEvent("chat_opened", { chatId: id, chatType: chat.type });

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

    socketService.on("chat-screen", {
      onNewMessage: (message: Message) => {
        if (message.chat === id) {
          setMessages((prev) => {
            // prevent duplicates (covers both socket delivery and optimistic add)
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
      onTypingStart: (data: { chatId: string; userId: string }) => {
        if (data.chatId === id && data.userId !== currentUserId) {
          setTypingUsers((prev) => new Set(prev).add(data.userId));
        }
      },
      onTypingStop: (data: { chatId: string; userId: string }) => {
        if (data.chatId === id) {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
        }
      },
    });

    socketService.on("chat-screen-group", {
      onGroupUpdated: (data) => {
        if (data.chatId === id) {
          setChat((prev) =>
            prev
              ? { ...prev, name: data.name ?? prev.name, groupImage: data.groupImage ?? prev.groupImage }
              : prev
          );
        }
      },
    });

    return () => {
      socketService.leaveChat(id);
      socketService.off("chat-screen");
      socketService.off("chat-screen-group");
    };
  }, [id, currentUserId, loadChatAndMessages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || sending) return;

    try {
      setSending(true);
      const newMessage = await chatService.sendMessage(id, {
        type: "text",
        content: content.trim(),
      });

      // Add message to UI immediately so the sender always sees it.
      // The dedup check in the socket handler prevents it showing twice
      // if the socket also delivers it.
      setMessages((prev) => {
        if (prev.some((m) => m._id === newMessage._id)) return prev;
        return [...prev, newMessage];
      });
      trackEvent("message_sent", { chatId: id, type: "text" });

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
        allowsEditing: false,
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
          const newImageMessage = await chatService.sendMessage(id, {
            type: "image",
            imageUrl: uploadResult.url,
          });

          // Add immediately so the sender sees it without waiting for socket
          setMessages((prev) => {
            if (prev.some((m) => m._id === newImageMessage._id)) return prev;
            return [...prev, newImageMessage];
          });

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

  const openGroupSettings = () => {
    if (!chat || chat.type !== "group") return;
    setEditGroupName(chat.name || "");
    setEditGroupImage(chat.groupImage || null);
    setSettingsVisible(true);
  };

  const pickGroupImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setEditGroupImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const saveGroupSettings = async () => {
    if (!chat) return;
    setSavingGroup(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const updates: { name?: string; groupImage?: string } = {};

      if (editGroupName.trim() && editGroupName.trim() !== chat.name) {
        updates.name = editGroupName.trim();
      }

      // If a new local image was picked, upload it first
      if (editGroupImage && editGroupImage !== chat.groupImage) {
        if (!token) throw new Error("No auth token");
        const uploadResult = await uploadImage(editGroupImage, "group_images", token);
        updates.groupImage = uploadResult.url;
      }

      if (Object.keys(updates).length === 0) {
        setSettingsVisible(false);
        return;
      }

      const updatedChat = await chatService.updateGroupChat(chat._id, updates);
      setChat(updatedChat);
      setSettingsVisible(false);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save changes");
    } finally {
      setSavingGroup(false);
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

  type MessageSection = Message | { type: "date"; label: string; _id: string };

  const buildMessageSections = (msgs: Message[]): MessageSection[] => {
    const sections: MessageSection[] = [];
    let lastDateLabel = "";

    msgs.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let label: string;
      if (msgDate.toDateString() === today.toDateString()) {
        label = "Today";
      } else if (msgDate.toDateString() === yesterday.toDateString()) {
        label = "Yesterday";
      } else {
        label = msgDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }

      if (label !== lastDateLabel) {
        lastDateLabel = label;
        sections.push({ type: "date", label, _id: `date-${msg._id}` });
      }
      sections.push(msg);
    });

    return sections;
  };

  const messageSections = buildMessageSections(messages);

  const renderMessage = ({ item, index }: { item: MessageSection; index: number }) => {
    if ("type" in item && item.type === "date") {
      return (
        <View style={styles.dateSeparatorContainer}>
          <View style={styles.dateSeparatorPill}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const msg = item as Message;
    const isOwnMessage = msg.sender._id === currentUserId;
    // Find previous non-date item
    let prevMsg: Message | null = null;
    for (let i = index - 1; i >= 0; i--) {
      const prev = messageSections[i];
      if (!("type" in prev)) { prevMsg = prev as Message; break; }
    }
    const showAvatar = !prevMsg || prevMsg.sender._id !== msg.sender._id;

    return (
      <MessageBubble
        message={msg}
        isOwnMessage={isOwnMessage}
        showSender={showAvatar}
        onImagePress={(url) => setSelectedImage(url)}
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
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
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
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
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

            {chat?.type === "group" && (
              <TouchableOpacity
                style={styles.moreButton}
                onPress={openGroupSettings}
              >
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messageSections}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={64} color="#6b7280" />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>Start the conversation!</Text>
              </View>
            }
          />

          {/* Typing indicator */}
          {typingUsers.size > 0 && (() => {
            const typingNames = Array.from(typingUsers)
              .map((uid) => chat?.participants.find((p) => p._id === uid)?.username)
              .filter(Boolean);
            const label =
              typingNames.length === 1
                ? `${typingNames[0]} is typing...`
                : `${typingNames.length} people are typing...`;
            return (
              <View style={styles.typingContainer}>
                <Text style={styles.typingText}>{label}</Text>
              </View>
            );
          })()}

          {/* Input */}
          <ChatInput
            onSend={handleSendMessage}
            onImagePick={handleImagePick}
            onTypingChange={(isTyping) => socketService.sendTyping(id, isTyping)}
            disabled={sending}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Full-screen Image Viewer */}
      <Modal
        visible={!!selectedImage}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedImage(null)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.imageViewerOverlay}
          onPress={() => setSelectedImage(null)}
        >
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
          )}
          <TouchableOpacity
            style={[styles.imageViewerClose, { top: insets.top + 8 }]}
            onPress={() => setSelectedImage(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Group Settings Modal */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.settingsOverlay}>
          <TouchableOpacity
            style={styles.settingsBackdrop}
            activeOpacity={1}
            onPress={() => setSettingsVisible(false)}
          />
          <View style={styles.settingsSheet}>
            {/* Modal header */}
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Group Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsBody}>
              {/* Group image picker */}
              <TouchableOpacity style={styles.groupImagePicker} onPress={pickGroupImage}>
                {editGroupImage ? (
                  <Image source={{ uri: editGroupImage }} style={styles.groupImagePreview} contentFit="cover" />
                ) : (
                  <View style={styles.groupImagePlaceholder}>
                    <Ionicons name="people" size={36} color="#6b7280" />
                  </View>
                )}
                <View style={styles.groupImageOverlay}>
                  <Ionicons name="camera" size={18} color="#fff" />
                  <Text style={styles.groupImageOverlayText}>Change Photo</Text>
                </View>
              </TouchableOpacity>

              {/* Group name input */}
              <Text style={styles.settingsLabel}>Group Name</Text>
              <TextInput
                style={styles.settingsInput}
                value={editGroupName}
                onChangeText={setEditGroupName}
                placeholder="Enter group name"
                placeholderTextColor="#6b7280"
                maxLength={50}
              />

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveButton, savingGroup && styles.saveButtonDisabled]}
                onPress={saveGroupSettings}
                disabled={savingGroup}
              >
                {savingGroup ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>

              {/* Participants */}
              <Text style={[styles.settingsLabel, { marginTop: 24 }]}>
                Members ({chat?.participants.length ?? 0})
              </Text>
              {chat?.participants.map((p) => (
                <View key={p._id} style={styles.participantRow}>
                  {p.profilePicture ? (
                    <Image source={{ uri: p.profilePicture }} style={styles.participantAvatar} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                  ) : (
                    <View style={styles.participantAvatarPlaceholder}>
                      <Ionicons name="person" size={16} color="#a855f7" />
                    </View>
                  )}
                  <Text style={styles.participantName}>{p.username}</Text>
                  {chat.admins?.some((a) => a._id === p._id) && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  // Date separator
  dateSeparatorContainer: {
    alignItems: "center",
    marginVertical: 12,
  },
  dateSeparatorPill: {
    backgroundColor: "rgba(55, 65, 81, 0.7)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  // Typing indicator
  typingContainer: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    backgroundColor: "transparent",
  },
  typingText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  // Full-screen image viewer
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageViewerClose: {
    position: "absolute",
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  // Group Settings Modal
  settingsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  settingsBackdrop: { flex: 1 },
  settingsSheet: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  settingsTitle: {
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  settingsBody: {
    padding: 20,
    paddingBottom: 40,
  },
  groupImagePicker: {
    alignSelf: "center",
    marginBottom: 24,
    position: "relative",
  },
  groupImagePreview: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#374151",
  },
  groupImagePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  groupImageOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#a855f7",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  groupImageOverlayText: {
    fontSize: scaleFontSize(11),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  settingsLabel: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  settingsInput: {
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#4b5563",
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: "#a855f7",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  participantAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#374151" },
  participantAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  participantName: {
    flex: 1,
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  adminBadge: {
    backgroundColor: "rgba(168,85,247,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a855f7",
  },
  adminBadgeText: {
    fontSize: scaleFontSize(11),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
});
