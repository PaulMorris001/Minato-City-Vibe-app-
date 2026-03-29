import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

interface ChatInputProps {
  onSend: (message: string) => void;
  onImagePick?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInput({
  onSend,
  onImagePick,
  onTypingChange,
  placeholder = "Type a message...",
  disabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleTextChange = (text: string) => {
    setMessage(text);

    if (!onTypingChange) return;

    if (text.length > 0) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTypingChange(true);
      }
      // Reset stop-typing timer
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
      // Stop typing when message is sent
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingChange?.(false);
      }
      onSend(message.trim());
      setMessage("");
    }
  };

  return (
      <View style={styles.container}>
        {onImagePick && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onImagePick}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Ionicons name="image-outline" size={24} color="#a855f7" />
          </TouchableOpacity>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={handleTextChange}
            placeholder={placeholder}
            placeholderTextColor="#6b7280"
            multiline
            maxLength={1000}
            editable={!disabled}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.sendButton,
            message.trim() && !disabled
              ? styles.sendButtonActive
              : styles.sendButtonInactive,
          ]}
          onPress={handleSend}
          disabled={!message.trim() || disabled}
          activeOpacity={0.7}
        >
          <Ionicons
            name="send"
            size={20}
            color={message.trim() && !disabled ? "#fff" : "#6b7280"}
          />
        </TouchableOpacity>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "android" ? 32 : 24,
    backgroundColor: "#1f1f2e",
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendButtonActive: {
    backgroundColor: "#a855f7",
  },
  sendButtonInactive: {
    backgroundColor: "#374151",
  },
});
