import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  FlatList,
  TextInput,
  Share,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import chatService, { Chat } from "@/services/chat.service";
import { Avatar } from "@/components/shared/Avatar";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import { GlassIconButton } from "@/components/shared/GlassBackButton";
import type { ThemeColors } from "@/constants/theme";

export type ShareTarget =
  | { kind: "event"; eventId: string; title: string; externalUrl: string }
  | { kind: "guide"; guideId: string; title: string; externalUrl: string };

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  target: ShareTarget | null;
}

/**
 * Bottom sheet that lets the user pick how to share an event or a guide.
 *
 *   Stage 1 — choice screen:
 *     · "Send in a chat"  → loads the user's chats, opens the picker
 *     · "Share externally" → opens the OS Share Sheet with the URL
 *
 *   Stage 2 — chat picker:
 *     A searchable list of the user's chats. Tapping one sends the
 *     event/guide as a chat message of type `event` / `guide`, which
 *     MessageBubble renders as a card.
 */
export default function ShareSheet({ visible, onClose, target }: ShareSheetProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [stage, setStage] = useState<"choice" | "picker">("choice");
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [query, setQuery] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // Reset to choice screen whenever the sheet is reopened.
  useEffect(() => {
    if (visible) {
      setStage("choice");
      setQuery("");
    }
  }, [visible]);

  useEffect(() => {
    SecureStore.getItemAsync("user").then((raw) => {
      if (!raw) return;
      try {
        const u = JSON.parse(raw);
        setCurrentUserId(u.id || u._id || "");
      } catch {}
    });
  }, []);

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const list = await chatService.getUserChats();
      setChats(list);
    } catch (err) {
      console.error("Load chats for share failed:", err);
      Alert.alert("Couldn't load chats", "Try again in a moment.");
    } finally {
      setLoadingChats(false);
    }
  };

  const handleExternalShare = async () => {
    if (!target) return;
    onClose();
    // Wait for the modal to dismiss before presenting the OS share sheet —
    // iOS won't present a new modal while another is still transitioning out.
    setTimeout(async () => {
      try {
        const headline =
          target.kind === "event"
            ? `Check out this event on OurCityvibe: ${target.title}`
            : `Check out this OurCityvibe guide: ${target.title}`;
        await Share.share({
          message: `${headline}\n${target.externalUrl}`,
          title: target.title,
        });
      } catch (err) {
        console.error("External share failed:", err);
      }
    }, 320);
  };

  const handlePickChats = async () => {
    setStage("picker");
    if (chats.length === 0) await loadChats();
  };

  const handleSend = async (chat: Chat) => {
    if (!target || sendingTo) return;
    setSendingTo(chat._id);
    try {
      const payload =
        target.kind === "event"
          ? { type: "event" as const, eventId: target.eventId, content: target.title }
          : { type: "guide" as const, guideId: target.guideId, content: target.title };
      await chatService.sendMessage(chat._id, payload);
      onClose();
    } catch (err: any) {
      console.error("Send to chat failed:", err);
      Alert.alert("Couldn't send", err?.message || "Try again in a moment.");
    } finally {
      setSendingTo(null);
    }
  };

  const filteredChats = useMemo(() => {
    if (!query.trim()) return chats;
    const q = query.toLowerCase();
    return chats.filter((c) => {
      if (c.type === "group") return (c.name || "").toLowerCase().includes(q);
      const other = c.participants.find((p) => p._id !== currentUserId);
      return (other?.username || "").toLowerCase().includes(q);
    });
  }, [chats, query, currentUserId]);

  const renderChatRow = ({ item }: { item: Chat }) => {
    const isGroup = item.type === "group";
    const other = isGroup ? null : item.participants.find((p) => p._id !== currentUserId);
    const displayName = isGroup ? item.name || "Group chat" : other?.username || "User";
    const avatarUri = isGroup ? item.groupImage : other?.profilePicture;

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => handleSend(item)}
        disabled={!!sendingTo}
        activeOpacity={0.7}
      >
        <Avatar uri={avatarUri} name={displayName} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.chatName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.chatSub} numberOfLines={1}>
            {isGroup ? `${item.participants.length} members` : "Direct message"}
          </Text>
        </View>
        {sendingTo === item._id ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={styles.sendBadge}>
            <Ionicons name="send" size={14} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (!target) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.grabber} />

          {stage === "choice" ? (
            <>
              <Text style={styles.headerLabel}>
                Share {target.kind === "event" ? "event" : "guide"}
              </Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {target.title}
              </Text>

              <SheetOption
                icon="chatbubbles-outline"
                label="Send in a chat"
                hint="Pick a friend or group"
                onPress={handlePickChats}
              />
              <SheetOption
                icon="share-outline"
                label="Copy Link"
                hint="Share to iMessage, WhatsApp, Instagram…"
                onPress={handleExternalShare}
              />
              <SheetOption icon="close" label="Cancel" muted onPress={onClose} />
            </>
          ) : (
            <>
              <View style={styles.pickerHeader}>
                <GlassIconButton
                  icon="chevron-back"
                  size={32}
                  onPress={() => setStage("choice")}
                  accessibilityLabel="Back"
                />
                <Text style={styles.pickerTitle}>Send to a chat</Text>
                <View style={{ width: 32 }} />
              </View>

              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search chats"
                  placeholderTextColor={colors.textFaint}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
              </View>

              {loadingChats ? (
                <ActivityIndicator color={colors.primary} style={{ paddingVertical: 28 }} />
              ) : filteredChats.length === 0 ? (
                <Text style={styles.empty}>
                  {chats.length === 0
                    ? "You don't have any chats yet."
                    : "No chats match that name."}
                </Text>
              ) : (
                <FlatList
                  data={filteredChats}
                  keyExtractor={(c) => c._id}
                  renderItem={renderChatRow}
                  style={{ maxHeight: 360 }}
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function SheetOption({
  icon,
  label,
  hint,
  onPress,
  muted,
}: {
  icon: any;
  label: string;
  hint?: string;
  onPress: () => void;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.optionRow}>
      <View style={[styles.optionIcon, muted && { backgroundColor: colors.glassFillSubtle }]}>
        <Ionicons
          name={icon}
          size={20}
          color={muted ? colors.textDim : colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, muted && { color: colors.textDim }]}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
      {!muted ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: c.backgroundDeep,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: c.glassStrokeStrong,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.glassStrokeStrong,
    marginBottom: 14,
  },

  headerLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.textFaint,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: c.textBright,
    marginBottom: 14,
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: c.glassFill,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: c.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: c.textBright,
  },
  optionHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textDim,
    marginTop: 2,
  },

  // Picker stage
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginBottom: 8,
  },
  pickerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: c.textBright,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.glassFillSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.glassFill,
  },
  searchInput: {
    flex: 1,
    color: c.textBright,
    fontFamily: Fonts.regular,
    fontSize: 14,
    padding: 0,
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: c.textDim,
    textAlign: "center",
    paddingVertical: 28,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderColor: c.glassFill,
  },
  chatName: {
    fontFamily: Fonts.semiBold,
    fontSize: 14.5,
    color: c.textBright,
  },
  chatSub: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textDim,
    marginTop: 2,
  },
  sendBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
