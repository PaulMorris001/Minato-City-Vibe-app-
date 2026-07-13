import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Message } from "@/services/chat.service";
import { replyPreviewLabel } from "@/components/chat/MessageBubble";
import { capitalize } from "@/libs/helpers";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ChatInputProps {
  onSend: (message: string) => void;
  onImagePick?: () => void;
  /** Take a live photo with the camera and send it (after confirmation). */
  onCameraCapture?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Message being replied to, shown as a preview strip above the input. */
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  /** Message being edited — pre-fills the input and switches Send into Save. */
  editingMessage?: Message | null;
  onCancelEdit?: () => void;
  currentUserId?: string;
  /** Chat members (excluding self) offered as @mention autocomplete options. */
  mentionCandidates?: { _id: string; username: string }[];
}

export default function ChatInput({
  onSend,
  onImagePick,
  onCameraCapture,
  onTypingChange,
  placeholder = "Type a message…",
  disabled = false,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  currentUserId,
  mentionCandidates = [],
}: ChatInputProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [message, setMessage] = useState("");
  const [mentionMatches, setMentionMatches] = useState<
    { _id: string; username: string }[]
  >([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Show @mention suggestions while the user is typing an @token at the end of
  // the draft. Keeping it to the trailing token avoids needing the caret index.
  const updateMentionMatches = (text: string) => {
    // Capture everything after the trailing "@" (including spaces) so usernames
    // with spaces/symbols, e.g. "@setemi Loye", can be matched and completed.
    const m = text.match(/(?:^|\s)@([^@]*)$/);
    if (!m || mentionCandidates.length === 0) {
      if (mentionMatches.length) setMentionMatches([]);
      return;
    }
    const q = m[1].toLowerCase();
    // Empty query (just "@") shows every member; otherwise prefix-match. The
    // list is scrollable, so we no longer cap the number of results.
    setMentionMatches(
      mentionCandidates.filter((c) => c.username.toLowerCase().startsWith(q))
    );
  };

  const applyMention = (username: string) => {
    setMessage((prev) =>
      prev.replace(/(^|\s)@([^@]*)$/, (_full, pre) => `${pre}@${username} `)
    );
    setMentionMatches([]);
  };

  // Entering edit mode pre-fills the composer; leaving it clears the draft.
  useEffect(() => {
    setMessage(editingMessage ? editingMessage.content || "" : "");
  }, [editingMessage]);

  const handleTextChange = (text: string) => {
    setMessage(text);
    updateMentionMatches(text);
    if (!onTypingChange) return;
    if (text.length > 0) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTypingChange(true);
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        isTypingRef.current = false;
        onTypingChange(false);
      }, 2000);
    } else {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingChange(false);
      }
    }
  };

  const handleSend = () => {
    if (message.trim() && !disabled) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingChange?.(false);
      }
      onSend(message.trim());
      setMessage("");
      setMentionMatches([]);
    }
  };

  const isOwnReply = !!replyingTo && replyingTo.sender?._id === currentUserId;

  return (
    <View style={styles.outer}>
      {editingMessage && (
        <View style={styles.replyPreview}>
          <Ionicons name="create-outline" size={16} color={colors.primaryLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyName} numberOfLines={1}>
              Editing message
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {editingMessage.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onCancelEdit}
            hitSlop={10}
            activeOpacity={0.7}
            style={styles.replyClose}
          >
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      )}
      {replyingTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyBar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyName} numberOfLines={1}>
              Replying to{" "}
              {isOwnReply ? "yourself" : capitalize(replyingTo.sender?.username || "user")}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyPreviewLabel(replyingTo)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onCancelReply}
            hitSlop={10}
            activeOpacity={0.7}
            style={styles.replyClose}
          >
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      )}
      {mentionMatches.length > 0 && (
        <ScrollView
          style={styles.mentionList}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {mentionMatches.map((c) => {
            const isAll = c._id === "all";
            return (
              <TouchableOpacity
                key={c._id}
                style={[styles.mentionRow, isAll && styles.mentionRowAll]}
                onPress={() => applyMention(c.username)}
                activeOpacity={0.7}
              >
                <View style={[styles.mentionAvatar, isAll && styles.mentionAvatarAll]}>
                  <Ionicons name={isAll ? "people" : "at"} size={14} color={isAll ? colors.warning : colors.primaryLight} />
                </View>
                <View>
                  <Text style={[styles.mentionUsername, isAll && styles.mentionUsernameAll]}>
                    {isAll ? "@all" : capitalize(c.username)}
                  </Text>
                  {isAll && <Text style={styles.mentionSubtext}>Notify everyone</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.container}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={handleTextChange}
            placeholder={editingMessage ? "Edit message…" : placeholder}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={1000}
            editable={!disabled}
          />
          {onCameraCapture && (
            <TouchableOpacity
              style={styles.paperclipBtn}
              onPress={onCameraCapture}
              disabled={disabled}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Ionicons name="camera-outline" size={20} color={colors.primaryLight} />
            </TouchableOpacity>
          )}
          {onImagePick && (
            <TouchableOpacity
              style={styles.paperclipBtn}
              onPress={onImagePick}
              disabled={disabled}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Ionicons name="attach" size={20} color={colors.primaryLight} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={handleSend}
          disabled={!message.trim() || disabled}
          activeOpacity={0.85}
          style={styles.sendWrap}
        >
          <LinearGradient
            colors={
              message.trim() && !disabled
                ? [colors.primary, colors.primaryDark]
                : ["rgba(168,85,247,0.35)", "rgba(124,58,237,0.35)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendButton}
          >
            <Ionicons name={editingMessage ? "checkmark" : "paper-plane"} size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  outer: {
    backgroundColor: c.backgroundDeep,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassFill,
  },
  replyBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: c.primaryLight,
  },
  replyName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11.5,
    color: c.primaryLight,
    marginBottom: 1,
  },
  replyText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: c.textDim,
  },
  replyClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.glassFillSubtle,
  },
  mentionList: {
    marginHorizontal: 14,
    marginTop: 8,
    maxHeight: 200,
    borderRadius: 14,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassFill,
    overflow: "hidden",
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primaryFadedStrong,
  },
  mentionUsername: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13.5,
    color: c.textBright,
  },
  mentionRowAll: {
    backgroundColor: "rgba(245,158,11,0.06)",
  },
  mentionAvatarAll: {
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  mentionUsernameAll: {
    color: c.warning,
  },
  mentionSubtext: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: "rgba(245,158,11,0.65)",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 8 : 14,
    gap: 8,
  },
  inputPill: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 6,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassFill,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    color: c.textBright,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    maxHeight: 100,
  },
  paperclipBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sendWrap: {
    width: 40,
    height: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
});
