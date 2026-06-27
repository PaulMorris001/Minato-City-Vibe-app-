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
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BASE_URL } from "@/constants/constants";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageActionSheet from "@/components/chat/MessageActionSheet";
import ReactionsListSheet from "@/components/chat/ReactionsListSheet";
import ChatInput from "@/components/chat/ChatInput";
import { Avatar } from "@/components/shared/Avatar";
import chatService, { Message, Chat, MessageReaction } from "@/services/chat.service";
import followService, { FollowUser } from "@/services/follow.service";
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
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Long-press action menu + reactions sheet are single, screen-level instances
  // (not one per bubble) — opened for whichever message the user targeted.
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [reactionsMessage, setReactionsMessage] = useState<Message | null>(null);
  const flatListRef = useRef<FlashListRef<MessageSection>>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Older-message pagination. We load the most recent page first, then fetch
  // earlier pages on demand so full history stays reachable in busy chats.
  const [page, setPage] = useState(1);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Add-members (group invite) modal
  const [addMembersVisible, setAddMembersVisible] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [mutualResults, setMutualResults] = useState<FollowUser[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<FollowUser[]>([]);
  const [invitingMembers, setInvitingMembers] = useState(false);

  const [pinning, setPinning] = useState(false);

  // Responding to a pending invite (when the viewer was invited to this group)
  const [respondingInvite, setRespondingInvite] = useState(false);
  // Mirrors isPendingInvitee for use inside socket callbacks (which close over
  // stale state) — a pending invitee shouldn't see live messages before joining.
  const pendingInviteeRef = useRef(false);

  // ── Create-event-from-group (admin only) ──────────────────────────────────
  const [createEventVisible, setCreateEventVisible] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evLocation, setEvLocation] = useState("");
  const [evDate, setEvDate] = useState<Date>(() => new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showEvDate, setShowEvDate] = useState(false);
  const [showEvTime, setShowEvTime] = useState(false);
  const [evImage, setEvImage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

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
      const messagesData = await chatService.getChatMessages(id, 1);
      setMessages(messagesData.messages);
      setPage(1);
      setHasMoreOlder((messagesData.pagination?.totalPages || 1) > 1);
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
        // Don't surface live messages to a user who's only been invited.
        if (pendingInviteeRef.current) return;
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
      onMessageDeleted: ({ chatId, messageId }) => {
        if (chatId !== id) return;
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      },
      onMessageEdited: ({ chatId, message }) => {
        if (chatId !== id) return;
        setMessages((prev) =>
          prev.map((m) => (m._id === message._id ? { ...m, ...message } : m))
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

    socketService.on("chat-screen-pinned", {
      onChatPinnedMessage: (data) => {
        if (data.chatId !== id) return;
        setChat((prev) => prev ? { ...prev, pinnedMessage: data.pinnedMessage } : prev);
      },
    });

    return () => {
      socketService.leaveChat(id);
      socketService.off("chat-screen");
      socketService.off("chat-screen-group");
      socketService.off("chat-screen-pinned");
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

  const handleReactionsChanged = useCallback(
    (messageId: string, reactions: MessageReaction[]) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    },
    []
  );

  // Copy a message's text (from the shared action menu).
  const handleCopyMessage = useCallback(async (message: Message) => {
    try {
      await Clipboard.setStringAsync(message.content || "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Clipboard write failed (rare) — nothing useful to surface.
    }
  }, []);

  // Toggle a reaction (from the shared action menu's emoji row or the reactions
  // sheet's "tap to remove"). Reconciles via handleReactionsChanged + socket.
  const handleQuickReact = useCallback(
    async (message: Message, emoji: string) => {
      try {
        const updated = await chatService.toggleReaction(message._id, emoji);
        handleReactionsChanged(message._id, updated.reactions || []);
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Couldn't react");
      }
    },
    [handleReactionsChanged]
  );

  // Enter edit mode for one of the user's own messages. Clears any reply draft
  // so the two composer modes never overlap.
  const handleEditMessage = useCallback((message: Message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  }, []);

  // Delete a message for everyone (sender only). Optimistically remove it; the
  // socket broadcast keeps every other participant in sync.
  const handleDeleteMessage = useCallback(
    async (message: Message) => {
      setEditingMessage((cur) => (cur?._id === message._id ? null : cur));
      // Snapshot inside the updater so this callback doesn't depend on (and get
      // recreated by) every `messages` change — keeping it stable for memo.
      let snapshot: Message[] = [];
      setMessages((prev) => {
        snapshot = prev;
        return prev.filter((m) => m._id !== message._id);
      });
      try {
        await chatService.deleteMessage(message._id);
        trackEvent("message_deleted", { chatId: id });
      } catch (error: any) {
        console.error("Error deleting message:", error);
        setMessages(snapshot); // restore on failure
        Alert.alert("Couldn't delete", error?.message || "Please try again.");
      }
    },
    [id]
  );

  const handlePinMessage = useCallback(async (message: Message) => {
    if (!chat) return;
    const isPinned = (chat.pinnedMessage as any)?._id === message._id;
    const newMessageId = isPinned ? null : message._id;
    setPinning(true);
    try {
      const updated = await chatService.pinMessage(chat._id, newMessageId);
      setChat((prev) => prev ? { ...prev, pinnedMessage: updated.pinnedMessage } : prev);
    } catch (e: any) {
      Alert.alert("Couldn't pin message", e?.message || "Please try again.");
    } finally {
      setPinning(false);
    }
  }, [chat]);

  // Save an edit. Optimistically update content, then reconcile with the server.
  const handleSubmitEdit = async (message: Message, content: string) => {
    const trimmed = content.trim();
    setEditingMessage(null);
    if (!trimmed || trimmed === message.content) return;

    setMessages((prev) =>
      prev.map((m) =>
        m._id === message._id ? { ...m, content: trimmed, isEdited: true } : m
      )
    );
    try {
      const updated = await chatService.editMessage(message._id, trimmed);
      setMessages((prev) =>
        prev.map((m) => (m._id === updated._id ? { ...m, ...updated } : m))
      );
      trackEvent("message_edited", { chatId: id });
    } catch (error: any) {
      console.error("Error editing message:", error);
      // Revert to the original content on failure.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id
            ? { ...m, content: message.content, isEdited: message.isEdited }
            : m
        )
      );
      Alert.alert("Couldn't edit", error?.message || "Please try again.");
    }
  };

  // The composer's submit routes to edit when a message is being edited.
  const handleComposerSubmit = (content: string) => {
    if (editingMessage) {
      handleSubmitEdit(editingMessage, content);
    } else {
      handleSendMessage(content);
    }
  };

  // Delete (hide) this whole conversation for the current user, then leave.
  const handleRemoveMember = (member: { _id: string; username: string }) => {
    if (!chat) return;
    Alert.alert(
      "Remove member",
      `Remove ${capitalize(member.username)} from the group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const updated = await chatService.removeParticipant(chat._id, member._id);
              setChat(updated);
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Couldn't remove member");
            }
          },
        },
      ]
    );
  };

  const handleDeleteConversation = () => {
    if (!chat) return;
    Alert.alert(
      "Delete conversation",
      "This removes the conversation from your inbox. It reappears if someone sends a new message.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await chatService.deleteChat(chat._id);
              setSettingsVisible(false);
              trackEvent("conversation_deleted", { chatId: chat._id });
              if (router.canGoBack()) router.back();
              else router.replace("/messages");
            } catch (error: any) {
              Alert.alert("Couldn't delete", error?.message || "Please try again.");
            }
          },
        },
      ]
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

  const pickEventImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setEvImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const openCreateEvent = () => {
    setSettingsVisible(false);
    setEvTitle("");
    setEvLocation("");
    setEvDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    setEvImage(null);
    // Let the settings sheet finish dismissing before presenting this one.
    setTimeout(() => setCreateEventVisible(true), 320);
  };

  // Admin creates a private, free event for the whole group. Every member is
  // auto-enrolled server-side and the event is linked back to this chat.
  const handleCreateGroupEvent = async () => {
    if (!chat) return;
    if (!evTitle.trim()) {
      Alert.alert("Title required", "Give your event a name.");
      return;
    }
    if (!evLocation.trim()) {
      Alert.alert("Location required", "Add where it's happening.");
      return;
    }
    if (evDate.getTime() < Date.now()) {
      Alert.alert("Pick a future date", "The event date can't be in the past.");
      return;
    }
    setCreatingEvent(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) throw new Error("No auth token");

      // Upload the optional cover first so we send a URL, not a base64 blob.
      let imageUrl: string | undefined;
      if (evImage) {
        const uploadResult = await uploadImage(evImage, "events", token);
        imageUrl = uploadResult.url;
      }

      const res = await fetch(`${BASE_URL}/events/from-group/${chat._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: evTitle.trim(),
          date: evDate.toISOString(),
          location: evLocation.trim(),
          image: imageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Couldn't create event", data?.message || "Please try again.");
        return;
      }
      setCreateEventVisible(false);
      // Reload so the chat's event banner appears.
      await loadChatAndMessages();
      const newEventId = data.event?._id;
      Alert.alert("Event created", "Everyone in the group has been added.", [
        { text: "OK" },
        ...(newEventId
          ? [{ text: "View Event", onPress: () => router.push(`/event/${newEventId}` as any) }]
          : []),
      ]);
    } catch (error: any) {
      console.error("Create group event error:", error);
      Alert.alert("Error", error.message || "Failed to create event.");
    } finally {
      setCreatingEvent(false);
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

  type MessageItem = Message & { showSender: boolean };
  type MessageSection = MessageItem | { type: "date"; label: string; _id: string };

  const buildMessageSections = (msgs: Message[]): MessageSection[] => {
    const sections: MessageSection[] = [];
    let lastDateLabel = "";
    let lastSenderId: string | null = null;
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
      // showSender: first message in a contiguous run from the same sender.
      // Computed here (not per-row by index) so it's stable under FlashList
      // cell recycling.
      const showSender = lastSenderId !== msg.sender._id;
      lastSenderId = msg.sender._id;
      sections.push({ ...msg, showSender });
    });
    return sections;
  };

  const isGroup = chat?.type === "group";
  // Usernames in this chat, used so multi-word @mentions ("@setemi Loye") get
  // tagged and highlighted in full rather than just the first word.
  const participantUsernames = useMemo(() => {
    const names = (chat?.participants || []).map((p) => p.username).filter(Boolean) as string[];
    if (isGroup) names.unshift("all");
    return names;
  }, [chat?.participants, isGroup]);
  // Group admins can spin up an event for the whole group (the server
  // auto-enrolls every member). Available whenever the viewer is an admin.
  const isGroupAdmin = !!(isGroup && chat?.admins?.some((a) => a._id === currentUserId));

  const canAddMembers = isGroupAdmin;

  // The viewer was invited to this group but hasn't joined yet — show an
  // accept / decline banner instead of the composer.
  const isPendingInvitee = !!(
    chat &&
    currentUserId &&
    !chat.participants.some((p) => p._id === currentUserId) &&
    chat.pendingInvites?.some((inv) => inv.user?._id === currentUserId)
  );
  const inviterName = chat?.pendingInvites?.find(
    (inv) => inv.user?._id === currentUserId
  )?.invitedBy?.username;

  useEffect(() => {
    pendingInviteeRef.current = isPendingInvitee;
  }, [isPendingInvitee]);

  const handleRespondInvite = async (accept: boolean) => {
    if (!chat || respondingInvite) return;
    setRespondingInvite(true);
    try {
      const updated = await chatService.respondToGroupInvite(chat._id, accept);
      if (accept) {
        setChat(updated);
        // Now a member — load the conversation history.
        loadChatAndMessages();
      } else {
        if (router.canGoBack()) router.back();
        else router.replace("/messages");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Couldn't respond to the invite");
    } finally {
      setRespondingInvite(false);
    }
  };

  // ── Add members (group invite) helpers ─────────────────────────────────────
  const loadMutuals = useCallback(async (query: string) => {
    try {
      setLoadingMutuals(true);
      const result = await followService.getMutualFollows(query);
      setMutualResults(result.users);
    } catch (e) {
      console.error("Error loading mutual follows:", e);
    } finally {
      setLoadingMutuals(false);
    }
  }, []);

  const openAddMembers = () => {
    setSelectedToAdd([]);
    setMemberSearch("");
    setMutualResults([]);
    // Close settings first — iOS can't stack two Modals simultaneously.
    setSettingsVisible(false);
    setTimeout(() => {
      setAddMembersVisible(true);
      loadMutuals("");
    }, 350);
  };

  const closeAddMembers = () => {
    Keyboard.dismiss();
    setAddMembersVisible(false);
  };

  // Debounced search inside the add-members modal.
  useEffect(() => {
    if (!addMembersVisible) return;
    const t = setTimeout(() => loadMutuals(memberSearch), 300);
    return () => clearTimeout(t);
  }, [memberSearch, addMembersVisible, loadMutuals]);

  const toggleSelectToAdd = (user: FollowUser) => {
    setSelectedToAdd((prev) =>
      prev.some((u) => u._id === user._id)
        ? prev.filter((u) => u._id !== user._id)
        : [...prev, user]
    );
  };

  // Members and people with a pending invite shouldn't appear as add candidates.
  const addCandidates = useMemo(() => {
    if (!chat) return mutualResults;
    const excluded = new Set<string>([
      ...chat.participants.map((p) => p._id),
      ...(chat.pendingInvites || []).map((inv) => inv.user?._id).filter(Boolean) as string[],
    ]);
    return mutualResults.filter((u) => !excluded.has(u._id));
  }, [mutualResults, chat]);

  const handleInviteMembers = async () => {
    if (!chat || selectedToAdd.length === 0) return;
    setInvitingMembers(true);
    try {
      const { chat: updated, message } = await chatService.inviteToGroup(
        chat._id,
        selectedToAdd.map((u) => u._id)
      );
      setChat(updated);
      closeAddMembers();
      setSelectedToAdd([]);
      Alert.alert("Invites sent", message);
    } catch (e: any) {
      Alert.alert("Couldn't add members", e?.message || "Please try again.");
    } finally {
      setInvitingMembers(false);
    }
  };

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
      // replyTo may arrive fully populated, as a doc whose sender is just an id,
      // or (from an older backend) as a bare id string. Normalize all of these
      // so the quote always shows the real author + content.
      const r = msg.replyTo as (Message & { sender: any }) | string | undefined;
      if (!r) return msg;
      if (typeof r !== "string" && r.sender?.username) return msg; // already good

      const replyId = typeof r === "string" ? r : r._id;

      // Best: pull the full original from the loaded conversation (author + content).
      if (replyId) {
        const full = messagesById.get(replyId);
        if (full) return { ...msg, replyTo: full };
      }

      // Fallback: resolve just the author from the chat's participant list, so
      // the quote shows who wrote it even when the original isn't loaded.
      if (typeof r !== "string") {
        const senderId = typeof r.sender === "string" ? r.sender : r.sender?._id;
        const participant = chat?.participants.find((p) => p._id === senderId);
        if (participant) return { ...msg, replyTo: { ...r, sender: participant } as Message };
      }
      return msg;
    },
    [messagesById, chat]
  );

  // Build the rendered list (messages + date separators) with reply previews
  // pre-hydrated, memoized so it only recomputes when the data actually
  // changes. This keeps each item's object reference stable across scroll /
  // typing re-renders, which is what lets MessageBubble's React.memo bail out.
  const messageSections = useMemo<MessageSection[]>(() => {
    return buildMessageSections(messages).map((it) =>
      "type" in it && it.type === "date"
        ? it
        : (hydrateReply(it as MessageItem) as MessageItem)
    );
  }, [messages, hydrateReply]);

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

  // Track how far the list is scrolled up so we can offer a jump-to-latest
  // button (the list otherwise only auto-scrolls when new content arrives).
  const handleMessagesScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nearBottom = distanceFromBottom < 240;
    // Only flip state when it actually changes — otherwise this fires a full
    // screen re-render on every scroll frame (scrollEventThrottle=16 ≈ 60fps),
    // re-rendering every message bubble and causing jank.
    setShowScrollDown((prev) => (prev === !nearBottom ? prev : !nearBottom));
  };

  const scrollToBottom = () => {
    setShowScrollDown(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Fetch the next page of older messages and prepend them. Guarded so the
  // list's onContentSizeChange doesn't yank the view back to the bottom.
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true);
    try {
      const nextPage = page + 1;
      const data = await chatService.getChatMessages(id, nextPage);
      const older = data.messages || [];
      if (older.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m._id));
          const deduped = older.filter((m) => !existing.has(m._id));
          return [...deduped, ...prev];
        });
        setPage(nextPage);
      }
      setHasMoreOlder(nextPage < (data.pagination?.totalPages || nextPage));
    } catch (error) {
      console.error("Error loading older messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  }, [id, page, hasMoreOlder, loadingOlder]);

  // Stable callbacks so MessageBubble's React.memo isn't defeated by a fresh
  // arrow function on every render.
  const handleImagePress = useCallback((url: string) => setSelectedImage(url), []);
  const handleMentionPress = useCallback(
    (username: string) => {
      const p = chat?.participants.find(
        (pp) => pp.username?.toLowerCase() === username.toLowerCase()
      );
      if (p) openUserProfile(p._id);
    },
    [chat?.participants]
  );

  const pinnedMessageId = (chat?.pinnedMessage as any)?._id;

  const renderMessage = useCallback(
    ({ item }: { item: MessageSection }) => {
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
      const msg = item as MessageItem;
      const isOwnMessage = msg.sender._id === currentUserId;

      return (
        <MessageBubble
          message={msg}
          isOwnMessage={isOwnMessage}
          isGroup={!!isGroup}
          showSender={msg.showSender}
          currentUserId={currentUserId}
          isHighlighted={highlightedId === msg._id}
          onImagePress={handleImagePress}
          onLongPress={setMenuMessage}
          onReactionsPress={setReactionsMessage}
          onReply={setReplyingTo}
          onReplyPress={handleReplyPress}
          onMentionPress={handleMentionPress}
          mentionUsernames={participantUsernames}
        />
      );
    },
    [
      currentUserId,
      isGroup,
      highlightedId,
      participantUsernames,
      handleImagePress,
      handleMentionPress,
      handleReplyPress,
    ]
  );

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

          {/* Pinned message banner */}
          {chat?.pinnedMessage && (chat.pinnedMessage as any)?._id && (
            <TouchableOpacity
              style={styles.pinnedBanner}
              activeOpacity={0.85}
              onPress={() => handleReplyPress((chat.pinnedMessage as any)._id)}
            >
              <Ionicons name="pin" size={13} color="#a855f7" style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pinnedBannerLabel}>Pinned message</Text>
                <Text style={styles.pinnedBannerText} numberOfLines={1}>
                  {(chat.pinnedMessage as any).type === "image"
                    ? "📷 Photo"
                    : (chat.pinnedMessage as any).content || "Message"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handlePinMessage(chat.pinnedMessage as any)}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color="rgba(244,238,255,0.4)" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* Messages */}
          <View style={styles.listWrap}>
          <FlashList
            ref={flatListRef}
            data={messageSections}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            extraData={highlightedId}
            getItemType={(item) =>
              "type" in item && item.type === "date"
                ? "date"
                : item.type === "system"
                ? "system"
                : "message"
            }
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onScroll={handleMessagesScroll}
            scrollEventThrottle={16}
            onStartReached={loadOlderMessages}
            onStartReachedThreshold={0.15}
            // FlashList v2 anchors at the bottom and follows new messages when
            // near the bottom — this replaces all the manual scrollToEnd /
            // onContentSizeChange machinery the FlatList needed.
            maintainVisibleContentPosition={{
              startRenderingFromBottom: true,
              autoscrollToBottomThreshold: 0.2,
            }}
            ListHeaderComponent={
              hasMoreOlder ? (
                <TouchableOpacity
                  style={styles.loadOlderBtn}
                  onPress={loadOlderMessages}
                  disabled={loadingOlder}
                  activeOpacity={0.7}
                >
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={CH_PURPLE_SOFT} />
                  ) : (
                    <Text style={styles.loadOlderText}>Load earlier messages</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>👋</Text>
                <Text style={styles.emptyText}>Say hi</Text>
                <Text style={styles.emptySubtext}>Start the conversation</Text>
              </View>
            }
          />
            {showScrollDown && (
              <TouchableOpacity
                style={styles.scrollDownFab}
                onPress={scrollToBottom}
                activeOpacity={0.85}
                hitSlop={8}
              >
                <Ionicons name="chevron-down" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Typing indicator (text strip) */}
          {typingLabel && (
            <View style={styles.typingContainer}>
              <Text style={styles.typingText}>{typingLabel}</Text>
            </View>
          )}

          {/* Composer — replaced by an accept/decline banner while invited */}
          {isPendingInvitee ? (
            <View style={styles.inviteBanner}>
              <Text style={styles.inviteBannerTitle}>
                {inviterName
                  ? `${capitalize(inviterName)} invited you to this group`
                  : "You've been invited to this group"}
              </Text>
              <Text style={styles.inviteBannerHint}>
                Join to see the conversation and send messages.
              </Text>
              <View style={styles.inviteBannerActions}>
                <TouchableOpacity
                  style={[styles.inviteDeclineBtn, respondingInvite && { opacity: 0.6 }]}
                  onPress={() => handleRespondInvite(false)}
                  disabled={respondingInvite}
                  activeOpacity={0.85}
                >
                  <Text style={styles.inviteDeclineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inviteAcceptBtn, respondingInvite && { opacity: 0.6 }]}
                  onPress={() => handleRespondInvite(true)}
                  disabled={respondingInvite}
                  activeOpacity={0.85}
                >
                  {respondingInvite ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.inviteAcceptText}>Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ChatInput
              onSend={handleComposerSubmit}
              onImagePick={handleImagePick}
              onTypingChange={(isTyping) => socketService.sendTyping(id, isTyping)}
              disabled={sending}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              editingMessage={editingMessage}
              onCancelEdit={() => setEditingMessage(null)}
              currentUserId={currentUserId}
              mentionCandidates={[
                ...(isGroup ? [{ _id: "all", username: "all" }] : []),
                ...(chat?.participants || [])
                  .filter((p) => p._id !== currentUserId && p.username)
                  .map((p) => ({ _id: p._id, username: p.username })),
              ]}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Single, screen-level long-press menu + reactions sheet (opened for the
          targeted message) — replaces the per-bubble modals. */}
      <MessageActionSheet
        message={menuMessage}
        currentUserId={currentUserId}
        isPinned={!!menuMessage && pinnedMessageId === menuMessage._id}
        canPin
        onClose={() => setMenuMessage(null)}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onCopy={handleCopyMessage}
        onPin={handlePinMessage}
        onReact={handleQuickReact}
      />
      <ReactionsListSheet
        message={reactionsMessage}
        currentUserId={currentUserId}
        onClose={() => setReactionsMessage(null)}
        onReact={handleQuickReact}
      />

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

              {isGroupAdmin && (
                <TouchableOpacity
                  style={styles.createEventRow}
                  onPress={openCreateEvent}
                  activeOpacity={0.85}
                >
                  <View style={styles.createEventIcon}>
                    <Ionicons name="calendar" size={18} color={CH_PURPLE_SOFT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.createEventTitle}>Create an event</Text>
                    <Text style={styles.createEventHint}>
                      Everyone in this group is added automatically.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={CH_TEXT_MUTE} />
                </TouchableOpacity>
              )}

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
                      {isGroupAdmin && p._id !== currentUserId && (
                        <TouchableOpacity
                          onPress={() => handleRemoveMember(p)}
                          hitSlop={8}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="remove-circle-outline" size={20} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  {/* Pending invites awaiting a response */}
                  {(chat?.pendingInvites?.length ?? 0) > 0 && (
                    <>
                      <Text style={[styles.settingsLabel, { marginTop: 16 }]}>
                        Invited ({chat?.pendingInvites?.length ?? 0})
                      </Text>
                      {chat?.pendingInvites?.map((inv) => (
                        <View key={inv.user._id} style={styles.participantRow}>
                          <Avatar uri={inv.user.profilePicture} name={inv.user.username} size={32} />
                          <Text style={styles.participantName}>{inv.user.username}</Text>
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>Pending</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {canAddMembers && (
                    <TouchableOpacity
                      style={styles.addMembersRow}
                      onPress={openAddMembers}
                      activeOpacity={0.85}
                    >
                      <View style={styles.addMembersIcon}>
                        <Ionicons name="person-add" size={18} color={CH_PURPLE_SOFT} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.createEventTitle}>Add members</Text>
                        <Text style={styles.createEventHint}>
                          Invited people join once they accept.
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={CH_TEXT_MUTE} />
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Danger zone — delete (hide) this conversation */}
              <TouchableOpacity
                style={styles.deleteChatRow}
                onPress={handleDeleteConversation}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteChatText}>Delete conversation</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add members (group invite) */}
      <Modal
        visible={addMembersVisible}
        animationType="slide"
        transparent
        onRequestClose={closeAddMembers}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.settingsOverlay}>
          <TouchableOpacity
            style={styles.settingsBackdrop}
            activeOpacity={1}
            onPress={closeAddMembers}
          />
          <View style={styles.settingsSheet}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Add members</Text>
              <TouchableOpacity onPress={closeAddMembers}>
                <Ionicons name="close" size={22} color={CH_TEXT} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.memberSearchInput}
              placeholder="Search people who follow you back"
              placeholderTextColor={CH_TEXT_MUTE}
              value={memberSearch}
              onChangeText={setMemberSearch}
              autoCapitalize="none"
            />

            {selectedToAdd.length > 0 && (
              <View style={styles.selectedChipsRow}>
                {selectedToAdd.map((u) => (
                  <TouchableOpacity
                    key={u._id}
                    style={styles.selectedChip}
                    onPress={() => toggleSelectToAdd(u)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.selectedChipText}>{u.username}</Text>
                    <Ionicons name="close-circle" size={16} color={CH_TEXT_DIM} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <FlatList
              data={addCandidates}
              keyExtractor={(item) => item._id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.memberEmpty}>
                  {loadingMutuals ? (
                    <ActivityIndicator size="small" color={CH_PURPLE_SOFT} />
                  ) : (
                    <Text style={styles.memberEmptyText}>
                      {memberSearch.trim()
                        ? "No matching people"
                        : "Only people who follow you back can be added."}
                    </Text>
                  )}
                </View>
              }
              renderItem={({ item }) => {
                const selected = selectedToAdd.some((u) => u._id === item._id);
                return (
                  <TouchableOpacity
                    style={styles.memberRow}
                    onPress={() => toggleSelectToAdd(item)}
                    activeOpacity={0.7}
                  >
                    <Avatar uri={item.profilePicture} name={item.username} size={40} />
                    <Text style={styles.memberRowName}>{item.username}</Text>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={selected ? CH_PURPLE : CH_TEXT_MUTE}
                    />
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={[
                styles.evCreateBtn,
                (invitingMembers || selectedToAdd.length === 0) && { opacity: 0.6 },
              ]}
              onPress={handleInviteMembers}
              disabled={invitingMembers || selectedToAdd.length === 0}
              activeOpacity={0.85}
            >
              {invitingMembers ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.evCreateBtnText}>
                  {selectedToAdd.length > 0
                    ? `Send invite${selectedToAdd.length > 1 ? `s (${selectedToAdd.length})` : ""}`
                    : "Send invite"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create event from group (admin) */}
      <Modal
        visible={createEventVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateEventVisible(false)}
      >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsSheet}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>New group event</Text>
              <TouchableOpacity onPress={() => setCreateEventVisible(false)}>
                <Ionicons name="close" size={22} color={CH_TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.evImagePicker} onPress={pickEventImage} activeOpacity={0.85}>
                {evImage ? (
                  <Image source={{ uri: evImage }} style={styles.evImagePreview} contentFit="cover" />
                ) : (
                  <View style={styles.evImagePlaceholder}>
                    <Ionicons name="image-outline" size={26} color={CH_TEXT_MUTE} />
                    <Text style={styles.evImagePlaceholderText}>Add a cover photo (optional)</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.settingsLabel}>Event name</Text>
              <TextInput
                style={styles.evInput}
                placeholder="e.g. Saturday rooftop hang"
                placeholderTextColor={CH_TEXT_MUTE}
                value={evTitle}
                onChangeText={setEvTitle}
                maxLength={80}
              />

              <Text style={[styles.settingsLabel, { marginTop: 16 }]}>Location</Text>
              <TextInput
                style={styles.evInput}
                placeholder="Where is it?"
                placeholderTextColor={CH_TEXT_MUTE}
                value={evLocation}
                onChangeText={setEvLocation}
                maxLength={120}
              />

              <Text style={[styles.settingsLabel, { marginTop: 16 }]}>When</Text>
              <View style={styles.evDateRow}>
                <TouchableOpacity style={styles.evDateBtn} onPress={() => setShowEvDate(true)} activeOpacity={0.8}>
                  <Ionicons name="calendar-outline" size={16} color={CH_PURPLE_SOFT} />
                  <Text style={styles.evDateText}>
                    {evDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.evDateBtn} onPress={() => setShowEvTime(true)} activeOpacity={0.8}>
                  <Ionicons name="time-outline" size={16} color={CH_PURPLE_SOFT} />
                  <Text style={styles.evDateText}>
                    {evDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showEvDate && (
                <DateTimePicker
                  value={evDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={new Date()}
                  onChange={(_e, d) => {
                    setShowEvDate(Platform.OS === "ios");
                    if (d) {
                      const next = new Date(evDate);
                      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                      setEvDate(next);
                    }
                  }}
                />
              )}
              {showEvTime && (
                <DateTimePicker
                  value={evDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_e, d) => {
                    setShowEvTime(Platform.OS === "ios");
                    if (d) {
                      const next = new Date(evDate);
                      next.setHours(d.getHours(), d.getMinutes());
                      setEvDate(next);
                    }
                  }}
                />
              )}

              <TouchableOpacity
                style={[styles.evCreateBtn, creatingEvent && { opacity: 0.6 }]}
                onPress={handleCreateGroupEvent}
                disabled={creatingEvent}
                activeOpacity={0.85}
              >
                {creatingEvent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.evCreateBtnText}>
                    Create event · adds {chat?.participants.length ?? 0} people
                  </Text>
                )}
              </TouchableOpacity>
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
  listWrap: {
    flex: 1,
  },
  scrollDownFab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CH_PURPLE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  messagesList: {
    paddingVertical: 12,
    paddingBottom: 8,
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
  // Create-event entry (settings) + quick-create form
  createEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.10)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  createEventIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  createEventTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: CH_TEXT,
  },
  createEventHint: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11.5,
    color: CH_TEXT_DIM,
    marginTop: 2,
  },
  deleteChatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.28)",
  },
  deleteChatText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: "#ef4444",
  },
  evImagePicker: {
    width: "100%",
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  evImagePreview: { width: "100%", height: "100%" },
  evImagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  evImagePlaceholderText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: CH_TEXT_MUTE,
  },
  evInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: CH_TEXT,
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  evDateRow: { flexDirection: "row", gap: 10 },
  evDateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  evDateText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13.5,
    color: CH_TEXT,
  },
  evCreateBtn: {
    marginTop: 22,
    marginBottom: 28,
    height: 52,
    borderRadius: 16,
    backgroundColor: CH_PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  evCreateBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14.5,
    color: "#fff",
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
  pendingBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
  },
  pendingBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: CH_TEXT_DIM,
    letterSpacing: 0.4,
  },
  addMembersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.10)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  addMembersIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  // "Load earlier messages" header at the top of the conversation
  loadOlderBtn: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  loadOlderText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: CH_PURPLE_SOFT,
  },
  // Accept / decline invite banner (shown in place of the composer)
  inviteBanner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: CH_STROKE,
    backgroundColor: "rgba(168,85,247,0.06)",
  },
  inviteBannerTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14.5,
    color: CH_TEXT,
  },
  inviteBannerHint: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: CH_TEXT_DIM,
    marginTop: 3,
  },
  inviteBannerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  inviteDeclineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
  },
  inviteDeclineText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: CH_TEXT_DIM,
  },
  inviteAcceptBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: CH_PURPLE,
  },
  inviteAcceptText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  // Add-members modal
  memberSearchInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: CH_TEXT,
    borderWidth: 1,
    borderColor: CH_STROKE,
    marginBottom: 12,
  },
  selectedChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.30)",
  },
  selectedChipText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: CH_TEXT,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CH_STROKE,
  },
  memberRowName: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: CH_TEXT,
  },
  memberEmpty: {
    paddingVertical: 28,
    alignItems: "center",
  },
  memberEmptyText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: CH_TEXT_MUTE,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(168,85,247,0.15)",
  },
  pinnedBannerLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 10,
    color: "#a855f7",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  pinnedBannerText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: CH_TEXT_DIM,
  },
});
