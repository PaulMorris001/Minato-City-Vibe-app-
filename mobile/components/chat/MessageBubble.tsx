import React, { useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { parseMessageSegments } from "@/utils/messageText";
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
import type { Message } from "@/services/chat.service";
import { groupReactions } from "@/utils/reactions";
import { openUserProfile } from "@/utils/userNavigation";
import { Avatar } from "@/components/shared/Avatar";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

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
  /** Fired on long-press — opens the shared, screen-level action menu. */
  onLongPress?: (message: Message) => void;
  /** Fired when the reaction chip is tapped — opens the shared reactions sheet. */
  onReactionsPress?: (message: Message) => void;
  /** Fired when the user swipes the message to reply/reference it. */
  onReply?: (message: Message) => void;
  /** Fired when the quoted reply preview is tapped (jump to original). */
  onReplyPress?: (messageId: string) => void;
  /** Fired when an @mention in the message body is tapped. */
  onMentionPress?: (username: string) => void;
  /** Known usernames in this chat, so multi-word @mentions tag in full. */
  mentionUsernames?: string[];
  /** Briefly flag this bubble after the user jumps to it from a reply. */
  isHighlighted?: boolean;
}

/**
 * Short label for a quoted/replied message (handles non-text types, and the
 * degraded case where replyTo arrived as a bare id / without content).
 */
export function replyPreviewLabel(msg: any): string {
  if (!msg || typeof msg === "string") return "Message";
  if (msg.content && String(msg.content).trim()) return msg.content;
  switch (msg.type) {
    case "image":
      return "📷 Photo";
    case "event":
      return "📅 Event";
    case "guide":
      return "📖 Guide";
    default:
      return "Message";
  }
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MessageBubble({
  message,
  isOwnMessage,
  isGroup = false,
  showSender = false,
  currentUserId,
  onImagePress,
  onLongPress,
  onReactionsPress,
  onReply,
  onReplyPress,
  onMentionPress,
  mentionUsernames,
  isHighlighted = false,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  // NOTE: all hooks must run unconditionally (no early return before them) —
  // FlashList recycles cell instances, so a system message and a text message
  // can share one instance; a differing hook count would crash. The
  // system-message branch is taken at the end, after every hook has run.

  // Group reactions by emoji for the in-bubble chip (and so a tap can open the
  // shared "who reacted" sheet). Cheap when there are no reactions.
  const groupedReactions = useMemo(
    () => groupReactions(message.reactions, currentUserId),
    [message.reactions, currentUserId]
  );

  // Parse links / @mentions once per content change, not on every render — this
  // was a measurable cost across dozens of visible bubbles.
  const textSegments = useMemo(
    () => parseMessageSegments(message.content || "", mentionUsernames),
    [message.content, mentionUsernames]
  );

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

  // System messages render as a centered pill. This branch is taken only after
  // every hook above has run (required for FlashList cell recycling).
  if (message.type === "system") {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const senderName = message.sender?.username || "";
  const senderInitial = senderName.charAt(0).toUpperCase() || "?";
  const senderTint = senderColor(message.sender?._id || senderName);

  // A pending (temp) message has no server id yet — no menu until it lands.
  const isTemp = message._id.startsWith("temp_");

  // Long-press opens the single, screen-level action menu (see MessageActionSheet).
  const handleLongPress = () => {
    if (isTemp) return;
    onLongPress?.(message);
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
                colors={[colors.primary, colors.primaryDark, colors.accentPink]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.eventImage}
              />
            )}

            <View style={styles.eventDetails}>
              <View style={styles.eventHeader}>
                <Ionicons name="calendar" size={11} color={colors.primaryLight} />
                <Text style={styles.eventKicker}>EVENT INVITATION</Text>
              </View>

              <Text style={styles.eventTitle} numberOfLines={2}>
                {eventData?.title || message.content}
              </Text>

              {eventDate && (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="time-outline" size={12} color={colors.primaryLight} />
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
                  <Ionicons name="location-outline" size={12} color={colors.primaryLight} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {eventData.location}
                  </Text>
                </View>
              )}

              <LinearGradient
                colors={[colors.primary, colors.primaryDark, colors.accentPink]}
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
              colors={[colors.primaryDark, colors.primary, colors.accentPink]}
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
                <Ionicons name="book-outline" size={11} color={colors.primaryLight} />
                <Text style={styles.eventKicker}>CITY GUIDE</Text>
              </View>

              <Text style={styles.eventTitle} numberOfLines={2}>
                {guideData?.title || message.content || "Untitled guide"}
              </Text>

              {cityLine ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="location-outline" size={12} color={colors.primaryLight} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {cityLine}
                  </Text>
                </View>
              ) : null}

              {guideData?.authorName ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="person-outline" size={12} color={colors.primaryLight} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    by {guideData.authorName}
                  </Text>
                </View>
              ) : null}

              {priceLine ? (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="pricetag-outline" size={12} color={colors.primaryLight} />
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {priceLine}
                  </Text>
                </View>
              ) : null}

              <LinearGradient
                colors={[colors.primary, colors.primaryDark, colors.accentPink]}
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
            {message.replyTo && (() => {
              const rt: any = message.replyTo;
              const isStringRef = typeof rt === "string";
              const replyName =
                !isStringRef && rt.sender?._id === currentUserId
                  ? "You"
                  : !isStringRef
                  ? rt.sender?.username
                  : undefined;
              const replyId = isStringRef ? rt : rt._id;
              return (
                <TouchableOpacity
                  style={styles.replyContainer}
                  activeOpacity={0.7}
                  onPress={() => replyId && onReplyPress?.(replyId)}
                >
                  <View style={styles.replyBar} />
                  {/* flexShrink (not flex:1) so the quote sizes to its content
                      and widens the bubble — otherwise a short message text
                      collapses the quote to one char per line. */}
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    {!!replyName && (
                      <Text style={styles.replyUsername} numberOfLines={1}>
                        {replyName}
                      </Text>
                    )}
                    <Text style={styles.replyText} numberOfLines={2}>
                      {replyPreviewLabel(message.replyTo)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })()}
            <Text style={[styles.messageText, isOwnMessage ? styles.ownText : styles.otherText]}>
              {textSegments.map((seg, i) => {
                if (seg.kind === "link") {
                  return (
                    <Text
                      key={i}
                      style={isOwnMessage ? styles.linkOwn : styles.linkOther}
                      onPress={() => Linking.openURL(seg.url).catch(() => {})}
                    >
                      {seg.value}
                    </Text>
                  );
                }
                if (seg.kind === "mention") {
                  return (
                    <Text
                      key={i}
                      style={isOwnMessage ? styles.mentionOwn : styles.mentionOther}
                      onPress={() => onMentionPress?.(seg.username)}
                    >
                      {seg.value}
                    </Text>
                  );
                }
                return <Text key={i}>{seg.value}</Text>;
              })}
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
            colors={[colors.primary, colors.primaryDark, colors.accentPink]}
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
            <Ionicons name="arrow-undo" size={16} color={colors.primaryLight} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.swipeRow, rowSwipeStyle]}>
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
                        onPress={() => onReactionsPress?.(message)}
                        activeOpacity={0.7}
                        style={styles.reactionItem}
                      >
                        <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                        {r.count > 1 && (
                          <Text style={[styles.reactionCount, r.mine && { color: colors.primaryLight }]}>
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
                      <Ionicons name="time-outline" size={12} color={colors.textFaint} />
                    ) : message.status === "failed" ? (
                      <Ionicons name="alert-circle" size={13} color={colors.error} />
                    ) : message.status === "read" || message.status === "delivered" ? (
                      <Ionicons
                        name="checkmark-done"
                        size={13}
                        color={message.status === "read" ? colors.primaryLight : colors.textFaint}
                      />
                    ) : (
                      <Ionicons name="checkmark" size={13} color={colors.textFaint} />
                    )}
                  </View>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// Memoized: with hundreds of messages in a list, re-rendering every bubble on
// each parent state change (scroll, typing, etc.) is what makes the chat jank.
// A stable `message` reference + stable callbacks let most bubbles bail out.
export default React.memo(MessageBubble);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  swipeWrap: {
    position: "relative",
    width: "100%",
  },
  // The animated row must stay full-width; otherwise the bubble's maxWidth: "78%"
  // resolves against a collapsed width and the text stacks one char per line.
  swipeRow: {
    width: "100%",
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
    backgroundColor: c.primaryFadedStrong,
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
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  otherBubble: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: c.glassFill,
  },

  messageText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    lineHeight: 19,
  },
  ownText: {
    color: c.text,
  },
  otherText: {
    color: c.textBright,
  },
  linkOwn: {
    color: c.text,
    textDecorationLine: "underline",
  },
  linkOther: {
    color: c.primaryLight,
    textDecorationLine: "underline",
  },
  mentionOwn: {
    color: c.text,
    fontFamily: "Outfit_700Bold",
  },
  mentionOther: {
    color: c.primaryLight,
    fontFamily: "Outfit_700Bold",
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
    borderColor: c.glassFill,
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
    backgroundColor: c.primaryLight,
    borderRadius: 2,
  },
  replyUsername: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11.5,
    color: c.primaryLight,
    marginBottom: 2,
  },
  replyText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: c.textDim,
  },

  // Event card (in-bubble)
  eventContainer: {
    width: 244,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(26,16,48,0.95)",
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
    shadowColor: c.primaryDark,
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
    color: c.primaryLight,
    letterSpacing: 1.2,
  },
  eventTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 16,
    color: c.textBright,
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
    color: c.textDim,
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
    color: c.white,
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
    borderColor: c.glassStrokeStrong,
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
    color: c.textDim,
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
    color: c.textFaint,
  },

  // System
  systemContainer: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemBubble: {
    backgroundColor: c.glassFillSubtle,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: c.glassFill,
  },
  systemText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11.5,
    color: c.textDim,
    textAlign: "center",
  },
});

