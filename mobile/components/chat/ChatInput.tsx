import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Message } from "@/services/chat.service";
import { replyPreviewLabel } from "@/components/chat/MessageBubble";
import { capitalize } from "@/libs/helpers";

const CH_TEXT = "#F4EEFF";
const CH_TEXT_DIM = "rgba(244,238,255,0.62)";
const CH_TEXT_MUTE = "rgba(244,238,255,0.42)";
const CH_PURPLE_SOFT = "#C084FC";
const CH_STROKE = "rgba(255,255,255,0.08)";

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
          <Ionicons name="create-outline" size={16} color={CH_PURPLE_SOFT} />
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
            <Ionicons name="close" size={16} color={CH_TEXT_MUTE} />
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
            <Ionicons name="close" size={16} color={CH_TEXT_MUTE} />
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
                  <Ionicons name={isAll ? "people" : "at"} size={14} color={isAll ? "#f59e0b" : CH_PURPLE_SOFT} />
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
            placeholderTextColor={CH_TEXT_MUTE}
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
              <Ionicons name="camera-outline" size={20} color={CH_PURPLE_SOFT} />
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
              <Ionicons name="attach" size={20} color={CH_PURPLE_SOFT} />
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
                ? ["#A855F7", "#7C3AED"]
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

const styles = StyleSheet.create({
  outer: {
    backgroundColor: "#0B0613",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
  },
  replyBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: CH_PURPLE_SOFT,
  },
  replyName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11.5,
    color: CH_PURPLE_SOFT,
    marginBottom: 1,
  },
  replyText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: CH_TEXT_DIM,
  },
  replyClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  mentionList: {
    marginHorizontal: 14,
    marginTop: 8,
    maxHeight: 200,
    borderRadius: 14,
    backgroundColor: "rgba(20,12,38,0.96)",
    borderWidth: 1,
    borderColor: CH_STROKE,
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
    backgroundColor: "rgba(168,85,247,0.16)",
  },
  mentionUsername: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13.5,
    color: CH_TEXT,
  },
  mentionRowAll: {
    backgroundColor: "rgba(245,158,11,0.06)",
  },
  mentionAvatarAll: {
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  mentionUsernameAll: {
    color: "#f59e0b",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: CH_STROKE,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 13.5,
    color: CH_TEXT,
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
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
});
