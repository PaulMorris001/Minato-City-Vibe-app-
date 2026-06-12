import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Switch,
  BackHandler,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import MessageBubble from "@/components/chat/MessageBubble";
import ChatInput from "@/components/chat/ChatInput";
import { Avatar } from "@/components/shared/Avatar";
import chatService, { Message, Chat, MessageReaction } from "@/services/chat.service";
import socketService from "@/services/socket.service";
import * as SecureStore from "expo-secure-store";
import { capitalize } from "@/libs/helpers";
import { uploadImage } from "@/utils/imageUpload";
import { openUserProfile } from "@/utils/userNavigation";
import { trackEvent } from "@/utils/analytics";

const CH_BG = "#0B0613";
const CH_TEXT = "#F4EEFF";
const CH_TEXT_DIM = "rgba(244,238,255,0.62)";
const CH_TEXT_MUTE = "rgba(244,238,255,0.42)";
const CH_STROKE = "rgba(255,255,255,0.08)";
const CH_STROKE_HI = "rgba(255,255,255,0.14)";
const CH_PURPLE = "#A855F7";
const CH_PURPLE_SOFT = "#C084FC";

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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const c = await chatService.getChatById(id);
      setChat(c);
      const messagesData = await chatService.getChatMessages(id);
      setMessages(messagesData.messages);
      trackEvent("chat_opened", { chatId: id, chatType: c.type });
      await chatService.markMessagesAsRead(id);
      if (currentUserId) {
        socketService.markMessagesAsRead(id, currentUserId);
      }
    } catch (error: any) {
      console.error("Error loading chat:", error, "id=", id);
      // Surface the real reason (status code / server message / id problem)
      // so we can diagnose "Failed to open chat" reports from real devices.
      const detail = error?.message ? `\n\n${error.message}` : "";
      Alert.alert("Couldn't open chat", `We couldn't load this conversation.${detail}`);
    } finally {
      setLoading(false);
    }
  }, [id, currentUserId]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  // Leaving a chat should always land on the chats list. When the chat was
  // opened from a push notification (cold start), there's no back stack, so
  // router.back() would silently no-op — fall back to /messages in that case.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/messages");
    }
  }, []);

  // Android hardware back button: route to the chats list too (otherwise a
  // notification cold-start would exit the app instead of opening the inbox).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  useEffect(() => {
    if (!id || !currentUserId) return;

    loadChatAndMessages();
    socketService.joinChat(id);

    socketService.on("chat-screen", {
      onNewMessage: (message: Message) => {
        if (message.chat === id) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === message._id)) return prev;
            if (message.sender._id === currentUserId) {
              const tempIdx = prev.findIndex((m) => m._id.startsWith("temp_"));
              if (tempIdx !== -1) {
                const next = [...prev];
                next[tempIdx] = message;
                return next;
              }
            }
            return [...prev, message];
          });
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
      onMessageReaction: ({ chatId, messageId, reactions }) => {
        if (chatId !== id) return;
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
        );
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
    const tempId = `temp_${Date.now()}`;
    const senderProfile = chat?.participants.find((p) => p._id === currentUserId)
      ?? { _id: currentUserId, username: "", email: "" };

    // Capture and clear the reply target up front so the composer resets
    // immediately and a follow-up message isn't accidentally threaded.
    const replyTarget = replyingTo;
    setReplyingTo(null);

    const tempMessage: Message = {
      _id: tempId,
      chat: id as string,
      sender: senderProfile,
      type: "text",
      content: content.trim(),
      status: "sending",
      isDeleted: false,
      isEdited: false,
      replyTo: replyTarget ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      setSending(true);
      const newMessage = await chatService.sendMessage(id as string, {
        type: "text",
        content: content.trim(),
        replyTo: replyTarget?._id,
      });
      setMessages((prev) => {
        if (prev.some((m) => m._id === newMessage._id)) {
          return prev.filter((m) => m._id !== tempId);
        }
        return prev.map((m) => (m._id === tempId ? newMessage : m));
      });
      trackEvent("message_sent", { chatId: id, type: "text" });
    } catch (error: any) {
      console.error("Error sending message:", error);
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...m, status: "failed" } : m)
      );
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
        const token = await SecureStore.getItemAsync("token");
        if (!token) {
          Alert.alert("Error", "Authentication token not found");
          setSending(false);
          return;
        }
        try {
          const uploadResult = await uploadImage(localUri, "chat_images", token);
          const newImageMessage = await chatService.sendMessage(id, {
            type: "image",
            imageUrl: uploadResult.url,
          });
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

  const handleReactionsChanged = (messageId: string, reactions: MessageReaction[]) => {
    setMessages((prev) =>
      prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
    );
  };

  const openSettings = () => {
    if (!chat) return;
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
    } catch {
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

  const togglePinned = async () => {
    if (!chat) return;
    const isPinned = (chat.pinnedBy || []).some((p) => p === currentUserId);
    try {
      const updated = await chatService.setChatPinned(chat._id, !isPinned);
      setChat({ ...chat, pinnedBy: updated.pinnedBy || [] });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to toggle pin");
    }
  };

  const toggleMuted = async () => {
    if (!chat) return;
    const isMuted = !!(chat.isMuted as any)?.[currentUserId];
    try {
      const updated = await chatService.setChatMuted(chat._id, !isMuted);
      setChat({ ...chat, isMuted: updated.isMuted });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to toggle mute");
    }
  };

  const getChatName = () => {
    if (!chat) return "";
    if (chat.type === "group") return chat.name || "Group Chat";
    const otherParticipant = chat.participants.find((p) => p._id !== currentUserId);
    return otherParticipant?.username || "User";
  };

  const getChatAvatar = () => {
    if (!chat) return null;
    if (chat.type === "group") return chat.groupImage || null;
    const otherParticipant = chat.participants.find((p) => p._id !== currentUserId);
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
  const isGroup = chat?.type === "group";

  // Lookup of loaded messages by id, used to "hydrate" a reply preview whose
  // replyTo.sender wasn't populated by the server (the original is almost
  // always already loaded since it lives in this same conversation).
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m._id, m);
    return map;
  }, [messages]);

  const hydrateReply = useCallback(
    (msg: Message): Message => {
      const r = msg.replyTo;
      if (r && !r.sender?.username) {
        const full = messagesById.get(r._id);
        if (full) return { ...msg, replyTo: full };
      }
      return msg;
    },
    [messagesById]
  );

  // Tap a quoted reply → scroll to (and briefly highlight) the original message.
  const handleReplyPress = useCallback(
    (messageId: string) => {
      const index = messageSections.findIndex((it) => it._id === messageId);
      if (index < 0) return;
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      setHighlightedId(messageId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
    },
    [messageSections]
  );

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const renderMessage = ({ item, index }: { item: MessageSection; index: number }) => {
    if ("type" in item && item.type === "date") {
      return (
        <View style={styles.dateSeparatorContainer}>
          <View style={styles.dateSeparatorLine} />
          <View style={styles.dateSeparatorPill}>
            <Text style={styles.dateSeparatorText}>
              {String(item.label).toUpperCase()}
            </Text>
          </View>
          <View style={styles.dateSeparatorLine} />
        </View>
      );
    }
    const msg = item as Message;
    const isOwnMessage = msg.sender._id === currentUserId;
    let prevMsg: Message | null = null;
    for (let i = index - 1; i >= 0; i--) {
      const prev = messageSections[i];
      if (!("type" in prev)) { prevMsg = prev as Message; break; }
    }
    const showSender = !prevMsg || prevMsg.sender._id !== msg.sender._id;

    return (
      <MessageBubble
        message={hydrateReply(msg)}
        isOwnMessage={isOwnMessage}
        isGroup={!!isGroup}
        showSender={showSender}
        currentUserId={currentUserId}
        isHighlighted={highlightedId === msg._id}
        onImagePress={(url) => setSelectedImage(url)}
        onReactionsChanged={handleReactionsChanged}
        onReply={setReplyingTo}
        onReplyPress={handleReplyPress}
      />
    );
  };

  // Compute typing indicator label
  const typingLabel = (() => {
    if (typingUsers.size === 0) return null;
    const names = Array.from(typingUsers)
      .map((uid) => chat?.participants.find((p) => p._id === uid)?.username)
      .filter(Boolean) as string[];
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  })();

  const isPinned = !!(chat?.pinnedBy || []).some((p) => p === currentUserId);
  const isMuted = !!(chat && (chat.isMuted as any)?.[currentUserId]);
  const eventRef = chat?.event;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CH_PURPLE} />
          <Text style={styles.loadingText}>Loading messages…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color={CH_TEXT} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerCenter}
              activeOpacity={isGroup ? 1 : 0.7}
              onPress={() => {
                if (isGroup) return;
                const other = chat?.participants.find((p) => p._id !== currentUserId);
                openUserProfile(other?._id);
              }}
            >
              <Avatar uri={getChatAvatar()} name={getChatName()} size={38} />
              <View style={styles.headerText}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {capitalize(getChatName())}
                </Text>
                {isGroup && (
                  <Text style={styles.headerSubtitle}>
                    {chat?.participants.length ?? 0} participants
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={openSettings}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={18} color={CH_TEXT} />
            </TouchableOpacity>
          </View>

          {/* Event banner — only when this is an event-linked group */}
          {isGroup && eventRef && (
            <TouchableOpacity
              style={styles.eventBannerWrap}
              activeOpacity={0.85}
              onPress={() => router.push(`/event/${eventRef._id}` as any)}
            >
              <LinearGradient
                colors={["rgba(168,85,247,0.18)", "rgba(236,72,153,0.12)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.eventBanner}
              >
                <View style={styles.eventBannerThumb}>
                  {eventRef.image ? (
                    <Image
                      source={{ uri: eventRef.image }}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={["#A855F7", "#7C3AED", "#EC4899"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventBannerKicker}>EVENT CHAT</Text>
                  <Text style={styles.eventBannerTitle} numberOfLines={1}>
                    {eventRef.title}
                    {eventRef.date && (
                      <>
                        {"  ·  "}
                        {new Date(eventRef.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </>
                    )}
                  </Text>
                </View>
                <View style={styles.eventBannerCta}>
                  <Text style={styles.eventBannerCtaText}>View →</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messageSections}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onScrollToIndexFailed={(info) => {
              // Rows have variable heights and no getItemLayout, so a target
              // that isn't measured yet can fail — approximate, then retry.
              flatListRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.4,
                });
              }, 250);
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>👋</Text>
                <Text style={styles.emptyText}>Say hi</Text>
                <Text style={styles.emptySubtext}>Start the conversation</Text>
              </View>
            }
          />

          {/* Typing indicator (text strip) */}
          {typingLabel && (
            <View style={styles.typingContainer}>
              <Text style={styles.typingText}>{typingLabel}</Text>
            </View>
          )}

          {/* Composer */}
          <ChatInput
            onSend={handleSendMessage}
            onImagePick={handleImagePick}
            onTypingChange={(isTyping) => socketService.sendTyping(id, isTyping)}
            disabled={sending}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            currentUserId={currentUserId}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Full-screen image viewer */}
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
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Chat Settings Modal */}
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
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>
                {isGroup ? "Group Settings" : "Chat Settings"}
              </Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={22} color={CH_TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsBody}>
              {isGroup && (
                <>
                  <TouchableOpacity style={styles.groupImagePicker} onPress={pickGroupImage}>
                    {editGroupImage ? (
                      <Image source={{ uri: editGroupImage }} style={styles.groupImagePreview} contentFit="cover" />
                    ) : (
                      <View style={styles.groupImagePlaceholder}>
                        <Ionicons name="people" size={36} color={CH_TEXT_MUTE} />
                      </View>
                    )}
                    <View style={styles.groupImageOverlay}>
                      <Ionicons name="camera" size={14} color="#fff" />
                      <Text style={styles.groupImageOverlayText}>Change Photo</Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.settingsLabel}>Group Name</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={editGroupName}
                    onChangeText={setEditGroupName}
                    placeholder="Enter group name"
                    placeholderTextColor={CH_TEXT_MUTE}
                    maxLength={50}
                  />

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
                </>
              )}

              {/* Pin / Mute toggles — available for all chats */}
              <Text style={[styles.settingsLabel, { marginTop: isGroup ? 24 : 4 }]}>
                Preferences
              </Text>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Pin to top</Text>
                  <Text style={styles.toggleHint}>
                    Pinned chats stay at the top of your inbox (max 3).
                  </Text>
                </View>
                <Switch
                  value={isPinned}
                  onValueChange={togglePinned}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: CH_PURPLE }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Mute notifications</Text>
                  <Text style={styles.toggleHint}>
                    Don't get push alerts for this chat.
                  </Text>
                </View>
                <Switch
                  value={isMuted}
                  onValueChange={toggleMuted}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: CH_PURPLE }}
                  thumbColor="#fff"
                />
              </View>

              {isGroup && (
                <>
                  <Text style={[styles.settingsLabel, { marginTop: 24 }]}>
                    Members ({chat?.participants.length ?? 0})
                  </Text>
                  {chat?.participants.map((p) => (
                    <View key={p._id} style={styles.participantRow}>
                      <Avatar uri={p.profilePicture} name={p.username} size={32} />
                      <Text style={styles.participantName}>{p.username}</Text>
                      {chat.admins?.some((a) => a._id === p._id) && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
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
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: CH_TEXT_DIM,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
    gap: 10,
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
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    color: CH_TEXT,
    letterSpacing: -0.15,
  },
  headerSubtitle: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: CH_TEXT_DIM,
    marginTop: 2,
  },

  // Event banner
  eventBannerWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  eventBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.3)",
  },
  eventBannerThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  eventBannerKicker: {
    fontFamily: "Outfit_700Bold",
    fontSize: 9.5,
    color: CH_PURPLE_SOFT,
    letterSpacing: 1.2,
  },
  eventBannerTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 13,
    color: CH_TEXT,
    letterSpacing: -0.15,
    marginTop: 2,
  },
  eventBannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
  },
  eventBannerCtaText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10.5,
    color: CH_TEXT,
  },

  // Messages
  messagesList: {
    paddingVertical: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    opacity: 0.5,
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    color: CH_TEXT,
  },
  emptySubtext: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: CH_TEXT_DIM,
    marginTop: 6,
  },

  // Date separator
  dateSeparatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dateSeparatorPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  dateSeparatorText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: CH_TEXT_DIM,
    letterSpacing: 0.6,
  },

  // Typing
  typingContainer: {
    paddingHorizontal: 22,
    paddingVertical: 4,
  },
  typingText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 12,
    color: CH_PURPLE_SOFT,
    fontStyle: "italic",
  },

  // Image viewer
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageViewerClose: {
    position: "absolute",
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },

  // Settings modal
  settingsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  settingsBackdrop: { flex: 1 },
  settingsSheet: {
    backgroundColor: "#15101F",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
  },
  settingsTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    color: CH_TEXT,
    letterSpacing: -0.5,
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
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  groupImagePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
    justifyContent: "center",
    alignItems: "center",
  },
  groupImageOverlay: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: CH_PURPLE,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  groupImageOverlayText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  settingsLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: CH_TEXT_DIM,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  settingsInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: CH_TEXT,
    borderWidth: 1,
    borderColor: CH_STROKE,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: CH_PURPLE,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
  },
  toggleLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: CH_TEXT,
  },
  toggleHint: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11.5,
    color: CH_TEXT_DIM,
    marginTop: 2,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
  },
  participantName: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: CH_TEXT,
  },
  adminBadge: {
    backgroundColor: "rgba(168,85,247,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CH_PURPLE,
  },
  adminBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: CH_PURPLE_SOFT,
    letterSpacing: 0.4,
  },
});
