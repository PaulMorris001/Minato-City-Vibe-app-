import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { Message, MessageReaction } from "@/services/chat.service";
import chatService from "@/services/chat.service";
import { Avatar } from "@/components/shared/Avatar";

const CH_TEXT = "#F4EEFF";
const CH_TEXT_DIM = "rgba(244,238,255,0.62)";
const CH_TEXT_MUTE = "rgba(244,238,255,0.42)";
const CH_STROKE = "rgba(255,255,255,0.08)";
const CH_STROKE_HI = "rgba(255,255,255,0.14)";
const CH_BUBBLE_IN = "rgba(255,255,255,0.07)";
const CH_PURPLE_SOFT = "#C084FC";
const CH_BG = "#0B0613";

const QUICK_REACTIONS = ["❤️", "✨", "🔥", "👍", "😂"];

const SENDER_PALETTE = [
  "#A855F7",
  "#7C3AED",
  "#EC4899",
  "#F59E0B",
  "#22D3EE",
  "#10B981",
  "#F472B6",
  "#FB7185",
];

function senderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return SENDER_PALETTE[Math.abs(h) % SENDER_PALETTE.length];
}

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  isGroup?: boolean;
  /** True only on the first message in a contiguous run from the same sender (incoming groups). */
  showSender?: boolean;
  currentUserId?: string;
  onImagePress?: (imageUrl: string) => void;
  onReactionsChanged?: (messageId: string, reactions: MessageReaction[]) => void;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function reactionUserId(r: MessageReaction): string {
  return typeof r.user === "string" ? r.user : r.user?._id;
}

export default function MessageBubble({
  message,
  isOwnMessage,
  isGroup = false,
  showSender = false,
  currentUserId,
  onImagePress,
  onReactionsChanged,
}: MessageBubbleProps) {
  const router = useRouter();
  const [pickerVisible, setPickerVisible] = useState(false);

  // System messages render as centered pill
  if (message.type === "system") {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const reactions = message.reactions || [];

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    const map: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    for (const r of reactions) {
      const uid = reactionUserId(r);
      if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, mine: false };
      map[r.emoji].count += 1;
      if (uid && uid === currentUserId) map[r.emoji].mine = true;
    }
    return Object.values(map);
  }, [reactions, currentUserId]);

  const senderName = message.sender?.username || "";
  const senderInitial = senderName.charAt(0).toUpperCase() || "?";
  const senderTint = senderColor(message.sender?._id || senderName);

  const handleLongPress = () => setPickerVisible(true);

  const handleToggleReaction = async (emoji: string) => {
    setPickerVisible(false);
    try {
      const updated = await chatService.toggleReaction(message._id, emoji);
      onReactionsChanged?.(message._id, updated.reactions || []);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Couldn't react");
    }
  };

  const handleEventPress = () => {
    if (message.event && message.event._id) {
      router.push(`/event/${message.event._id}`);
    }
  };

  // Build the bubble body
  const renderBubbleBody = () => {
    switch (message.type) {
      case "image":
        return (
          <View>
            {message.imageUrl && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onImagePress?.(message.imageUrl!)}
                onLongPress={handleLongPress}
              >
                <Image
                  source={{ uri: message.imageUrl }}
                  style={styles.messageImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </TouchableOpacity>
            )}
            {!!message.content && (
              <View
                style={[
                  styles.imageCaptionStrip,
                  isOwnMessage ? null : styles.imageCaptionStripIncoming,
                ]}
              >
                <Text
                  style={[
                    styles.captionText,
                    isOwnMessage ? styles.ownText : styles.otherText,
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            )}
          </View>
        );

      case "event": {
        const eventData = message.event;
        const eventDate = eventData?.date ? new Date(eventData.date) : null;
        return (
          <TouchableOpacity
            style={styles.eventContainer}
            onPress={handleEventPress}
            onLongPress={handleLongPress}
            activeOpacity={0.85}
          >
            {eventData?.image ? (
              <Image
                source={{ uri: eventData.image }}
                style={styles.eventImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ) : (
              <LinearGradient
                colors={["#A855F7", "#7C3AED", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.eventImage}
              />
            )}

            <View style={styles.eventDetails}>
              <View style={styles.eventHeader}>
                <Ionicons name="calendar" size={11} color={CH_PURPLE_SOFT} />
                <Text style={styles.eventKicker}>EVENT INVITATION</Text>
              </View>

              <Text style={styles.eventTitle} numberOfLines={2}>
                {eventData?.title || message.content}
              </Text>

              {eventDate && (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="time-outline" size={12} color={CH_PURPLE_SOFT} />
                  <Text style={styles.eventMeta}>
                    {eventDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {eventDate.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              )}

              {eventData?.location && (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="location-outline" size={12} color={CH_PURPLE_SOFT} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {eventData.location}
                  </Text>
                </View>
              )}

              <LinearGradient
                colors={["#A855F7", "#7C3AED", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.eventCta}
              >
                <Text style={styles.eventCtaText}>View Event</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </LinearGradient>
            </View>
          </TouchableOpacity>
        );
      }

      case "text":
      default:
        return (
          <View>
            {message.replyTo && (
              <View style={styles.replyContainer}>
                <View style={styles.replyBar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyUsername}>
                    {message.replyTo.sender.username}
                  </Text>
                  <Text style={styles.replyText} numberOfLines={2}>
                    {message.replyTo.content}
                  </Text>
                </View>
              </View>
            )}
            <Text style={[styles.messageText, isOwnMessage ? styles.ownText : styles.otherText]}>
              {message.content}
            </Text>
            {message.isEdited && (
              <Text style={[styles.editedText, isOwnMessage ? styles.ownText : styles.otherText]}>
                edited
              </Text>
            )}
          </View>
        );
    }
  };

  // Bubble container — gradient for outgoing text/text-like; image bubble = thumbnail only;
  // event bubble = the event card (no surrounding bubble).
  const renderBubble = () => {
    if (message.type === "event") {
      // Event card stands alone — no surrounding bubble
      return renderBubbleBody();
    }
    if (message.type === "image") {
      // Image stands alone with rounded outer container
      return <View style={styles.imageBubbleOuter}>{renderBubbleBody()}</View>;
    }

    // Text bubble
    if (isOwnMessage) {
      return (
        <Pressable onLongPress={handleLongPress}>
          <LinearGradient
            colors={["#A855F7", "#7C3AED", "#EC4899"]}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.ownBubble]}
          >
            {renderBubbleBody()}
          </LinearGradient>
        </Pressable>
      );
    }
    return (
      <Pressable onLongPress={handleLongPress} style={[styles.bubble, styles.otherBubble]}>
        {renderBubbleBody()}
      </Pressable>
    );
  };

  const rowAlign = isOwnMessage ? styles.rowEnd : styles.rowStart;
  const showAvatarSlot = !isOwnMessage && isGroup;

  return (
    <View
      style={[
        styles.row,
        rowAlign,
        { marginBottom: groupedReactions.length > 0 ? 14 : 4 },
      ]}
    >
      {showAvatarSlot && (
        <View style={styles.avatarSlot}>
          {showSender && (
            <Avatar
              uri={message.sender.profilePicture}
              name={senderName}
              size={26}
              bgColor={senderTint}
            />
          )}
        </View>
      )}

      <View style={styles.bubbleColumn}>
        {isGroup && !isOwnMessage && showSender && (
          <Text style={[styles.senderLabel, { color: senderTint }]}>{senderName}</Text>
        )}

        <View style={{ position: "relative" }}>
          {renderBubble()}

          {/* Reactions chip */}
          {groupedReactions.length > 0 && (
            <View
              style={[
                styles.reactionsChip,
                isOwnMessage ? { right: 6 } : { left: 6 },
              ]}
            >
              {groupedReactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  onPress={() => handleToggleReaction(r.emoji)}
                  activeOpacity={0.7}
                  style={styles.reactionItem}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  {r.count > 1 && (
                    <Text style={[styles.reactionCount, r.mine && { color: CH_PURPLE_SOFT }]}>
                      {r.count}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Time + status */}
        <View
          style={[
            styles.timeRow,
            isOwnMessage ? styles.timeRowEnd : styles.timeRowStart,
          ]}
        >
          <Text style={styles.timeText}>{formatTime(message.createdAt)}</Text>
          {isOwnMessage && (
            <View style={{ marginLeft: 4, justifyContent: "center" }}>
              {message.status === "sending" ? (
                <Ionicons name="time-outline" size={12} color={CH_TEXT_MUTE} />
              ) : message.status === "failed" ? (
                <Ionicons name="alert-circle" size={13} color="#ef4444" />
              ) : message.status === "read" || message.status === "delivered" ? (
                <Ionicons
                  name="checkmark-done"
                  size={13}
                  color={message.status === "read" ? CH_PURPLE_SOFT : CH_TEXT_MUTE}
                />
              ) : (
                <Ionicons name="checkmark" size={13} color={CH_TEXT_MUTE} />
              )}
            </View>
          )}
        </View>
      </View>

      {/* Quick reaction picker */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerPill}>
            {QUICK_REACTIONS.map((e) => (
              <TouchableOpacity
                key={e}
                style={styles.pickerEmoji}
                onPress={() => handleToggleReaction(e)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerEmojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    gap: 8,
  },
  rowStart: {
    justifyContent: "flex-start",
  },
  rowEnd: {
    justifyContent: "flex-end",
  },
  avatarSlot: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleColumn: {
    maxWidth: "78%",
  },
  senderLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10.5,
    marginBottom: 4,
    marginLeft: 4,
  },

  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  ownBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  otherBubble: {
    backgroundColor: CH_BUBBLE_IN,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: CH_STROKE,
  },

  messageText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    lineHeight: 19,
  },
  ownText: {
    color: "#fff",
  },
  otherText: {
    color: CH_TEXT,
  },
  captionText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
  },
  editedText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 10.5,
    fontStyle: "italic",
    marginTop: 2,
    opacity: 0.7,
  },

  // Image
  imageBubbleOuter: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: CH_STROKE,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 6,
  },
  messageImage: {
    width: 220,
    height: 160,
  },
  imageCaptionStrip: {
    backgroundColor: "rgba(168,85,247,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageCaptionStripIncoming: {
    backgroundColor: "rgba(26,16,48,0.85)",
  },

  // Replies
  replyContainer: {
    flexDirection: "row",
    marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  replyBar: {
    width: 3,
    backgroundColor: CH_PURPLE_SOFT,
    borderRadius: 2,
  },
  replyUsername: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11.5,
    color: CH_PURPLE_SOFT,
    marginBottom: 2,
  },
  replyText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },

  // Event card (in-bubble)
  eventContainer: {
    width: 244,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(26,16,48,0.95)",
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 8,
  },
  eventImage: {
    width: "100%",
    height: 124,
  },
  eventDetails: {
    padding: 12,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  eventKicker: {
    fontFamily: "Outfit_700Bold",
    fontSize: 9.5,
    color: CH_PURPLE_SOFT,
    letterSpacing: 1.2,
  },
  eventTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 16,
    color: CH_TEXT,
    letterSpacing: -0.3,
    lineHeight: 19,
    marginBottom: 8,
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  eventMeta: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: CH_TEXT_DIM,
    flex: 1,
  },
  eventCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginTop: 10,
  },
  eventCtaText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
    color: "#fff",
    letterSpacing: 0.2,
  },

  // Reactions
  reactionsChip: {
    position: "absolute",
    bottom: -10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(11,6,19,0.95)",
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  reactionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    color: CH_TEXT_DIM,
  },

  // Time + status
  timeRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  timeRowEnd: {
    justifyContent: "flex-end",
  },
  timeRowStart: {
    justifyContent: "flex-start",
    marginLeft: 4,
  },
  timeText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 10,
    color: CH_TEXT_MUTE,
  },

  // System
  systemContainer: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemBubble: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  systemText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11.5,
    color: CH_TEXT_DIM,
    textAlign: "center",
  },

  // Reaction picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerPill: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(26,16,48,0.98)",
    borderWidth: 1,
    borderColor: CH_STROKE_HI,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  pickerEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmojiText: {
    fontSize: 26,
  },
});

export { CH_TEXT, CH_TEXT_DIM, CH_TEXT_MUTE, CH_STROKE, CH_STROKE_HI, CH_BUBBLE_IN, CH_PURPLE_SOFT, CH_BG };
