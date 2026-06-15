import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";
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
}

export default function ChatInput({
  onSend,
  onImagePick,
  onTypingChange,
  placeholder = "Type a message…",
  disabled = false,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  currentUserId,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Entering edit mode pre-fills the composer; leaving it clears the draft.
  useEffect(() => {
    setMessage(editingMessage ? editingMessage.content || "" : "");
  }, [editingMessage]);

  const handleTextChange = (text: string) => {
    setMessage(text);
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
