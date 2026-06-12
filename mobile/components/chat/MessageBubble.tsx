import React, { useState, useMemo, useEffect } from "react";
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
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import type { Message, MessageReaction } from "@/services/chat.service";
import chatService from "@/services/chat.service";
import { openUserProfile } from "@/utils/userNavigation";
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

// Swipe-to-reply tuning (WhatsApp-style): how far the bubble can slide and the
// point past which releasing fires the reply action.
const REPLY_MAX_SLIDE = 80;
const REPLY_THRESHOLD = 52;

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  isGroup?: boolean;
  /** True only on the first message in a contiguous run from the same sender (incoming groups). */
  showSender?: boolean;
  currentUserId?: string;
  onImagePress?: (imageUrl: string) => void;
  onReactionsChanged?: (messageId: string, reactions: MessageReaction[]) => void;
  /** Fired when the user swipes the message to reply/reference it. */
  onReply?: (message: Message) => void;
  /** Fired when the quoted reply preview is tapped (jump to original). */
  onReplyPress?: (messageId: string) => void;
  /** Briefly flag this bubble after the user jumps to it from a reply. */
  isHighlighted?: boolean;
}

/** Short label for a quoted/replied message (handles non-text types). */
export function replyPreviewLabel(msg: Pick<Message, "type" | "content">): string {
  if (msg.content && msg.content.trim()) return msg.content;
  switch (msg.type) {
    case "image":
      return "📷 Photo";
    case "event":
      return "📅 Event";
    case "guide":
      return "📖 Guide";
    default:
      return "";
  }
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
  onReply,
  onReplyPress,
  isHighlighted = false,
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

  // ---- Swipe-to-reply (WhatsApp-style) -------------------------------------
  // A short right-swipe slides the bubble and, past a threshold, fires onReply.
  // activeOffsetX / failOffsetY keep vertical list scrolling untouched.
  const translateX = useSharedValue(0);
  const reachedThreshold = useSharedValue(false);

  const fireHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const notifyReply = () => onReply?.(message);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onReply && !message._id.startsWith("temp_"))
        .activeOffsetX(12)
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          "worklet";
          const x = Math.min(Math.max(e.translationX, 0), REPLY_MAX_SLIDE);
          translateX.value = x;
          if (x >= REPLY_THRESHOLD && !reachedThreshold.value) {
            reachedThreshold.value = true;
            runOnJS(fireHaptic)();
          } else if (x < REPLY_THRESHOLD && reachedThreshold.value) {
            reachedThreshold.value = false;
          }
        })
        .onEnd(() => {
          "worklet";
          if (translateX.value >= REPLY_THRESHOLD) {
            runOnJS(notifyReply)();
          }
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
          reachedThreshold.value = false;
        }),
    // message identity is what matters for the reply payload
    [message._id, onReply]
  );

  const rowSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, REPLY_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          translateX.value,
          [0, REPLY_THRESHOLD],
          [0.4, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // Brief halo when the user jumps to this message from a quoted reply.
  const highlightOpacity = useSharedValue(0);
  useEffect(() => {
    highlightOpacity.value = withTiming(isHighlighted ? 1 : 0, {
      duration: isHighlighted ? 160 : 450,
    });
  }, [isHighlighted]);
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));

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

  const handleGuidePress = () => {
    if (message.guide && message.guide._id) {
      router.push(`/guide/${message.guide._id}` as any);
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

      case "guide": {
        const guideData = message.guide;
        const cityLine = guideData?.city
          ? `${guideData.city}${guideData.cityState ? `, ${guideData.cityState}` : ""}`
          : "";
        const priceLine =
          typeof guideData?.price === "number"
            ? guideData.price > 0
              ? `$${guideData.price}`
              : "Free"
            : null;
        return (
          <TouchableOpacity
            style={styles.eventContainer}
            onPress={handleGuidePress}
            onLongPress={handleLongPress}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={["#7C3AED", "#A855F7", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.eventImage}
            >
              <View style={styles.guideCoverInner}>
                <Ionicons name="book" size={36} color="rgba(255,255,255,0.85)" />
              </View>
            </LinearGradient>

            <View style={styles.eventDetails}>
              <View style={styles.eventHeader}>
                <Ionicons name="book-outline" size={11} color={CH_PURPLE_SOFT} />
                <Text style={styles.eventKicker}>CITY GUIDE</Text>
              </View>

              <Text style={styles.eventTitle} numberOfLines={2}>
                {guideData?.title || message.content || "Untitled guide"}
              </Text>

              {cityLine ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="location-outline" size={12} color={CH_PURPLE_SOFT} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {cityLine}
                  </Text>
                </View>
              ) : null}

              {guideData?.authorName ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="person-outline" size={12} color={CH_PURPLE_SOFT} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    by {guideData.authorName}
                  </Text>
                </View>
              ) : null}

              {priceLine ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="pricetag-outline" size={12} color={CH_PURPLE_SOFT} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {priceLine}
                  </Text>
                </View>
              ) : null}

              <LinearGradient
                colors={["#A855F7", "#7C3AED", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.eventCta}
              >
                <Text style={styles.eventCtaText}>Read Guide</Text>
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
              <TouchableOpacity
                style={styles.replyContainer}
                activeOpacity={0.7}
                onPress={() => message.replyTo && onReplyPress?.(message.replyTo._id)}
              >
                <View style={styles.replyBar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyUsername}>
                    {message.replyTo.sender?._id === currentUserId
                      ? "You"
                      : message.replyTo.sender?.username || "Unknown"}
                  </Text>
                  <Text style={styles.replyText} numberOfLines={2}>
                    {replyPreviewLabel(message.replyTo)}
                  </Text>
                </View>
              </TouchableOpacity>
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
    if (message.type === "event" || message.type === "guide") {
      // Event / guide card stands alone — no surrounding bubble
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
    <GestureDetector gesture={swipeGesture}>
      <View
        style={[
          styles.swipeWrap,
          { marginBottom: groupedReactions.length > 0 ? 14 : 4 },
        ]}
      >
        {/* Reply affordance — fades/scales in as the bubble slides right */}
        <Animated.View
          style={[styles.replyIconUnderlay, replyIconStyle]}
          pointerEvents="none"
        >
          <View style={styles.replyIconCircle}>
            <Ionicons name="arrow-undo" size={16} color={CH_PURPLE_SOFT} />
          </View>
        </Animated.View>

        <Animated.View style={rowSwipeStyle}>
          <View style={[styles.row, rowAlign]}>
            {showAvatarSlot && (
              <View style={styles.avatarSlot}>
                {showSender && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => openUserProfile(message.sender?._id)}
                  >
                    <Avatar
                      uri={message.sender.profilePicture}
                      name={senderName}
                      size={26}
                      bgColor={senderTint}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.bubbleColumn}>
              {isGroup && !isOwnMessage && showSender && (
                <Text
                  style={[styles.senderLabel, { color: senderTint }]}
                  onPress={() => openUserProfile(message.sender?._id)}
                >
                  {senderName}
                </Text>
              )}

              <View style={{ position: "relative" }}>
                <Animated.View
                  style={[styles.highlightFill, highlightStyle]}
                  pointerEvents="none"
                />
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
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    justifyContent: "center",
  },
  replyIconUnderlay: {
    position: "absolute",
    left: 18,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  replyIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightFill: {
    position: "absolute",
    top: -6,
    bottom: -6,
    left: -10,
    right: -10,
    borderRadius: 20,
    backgroundColor: "rgba(168,85,247,0.22)",
  },
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
  guideCoverInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
