import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Message } from "@/services/chat.service";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const QUICK_REACTIONS = ["❤️", "✨", "🔥", "👍", "😂"];

// Messages can only be edited within 10 minutes of being sent.
const EDIT_WINDOW_MS = 10 * 60 * 1000;

interface MessageActionSheetProps {
  /** The message the menu was opened for, or null when closed. */
  message: Message | null;
  currentUserId?: string;
  /** Whether `message` is currently the chat's pinned message. */
  isPinned?: boolean;
  /** Whether pinning is available in this chat (group/admin rules live upstream). */
  canPin?: boolean;
  onClose: () => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onCopy: (message: Message) => void;
  onPin: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  /** Report someone else's message as objectionable (Apple Guideline 1.2). */
  onReport?: (message: Message) => void;
}

/**
 * Single, screen-level long-press menu for chat messages. Previously every
 * MessageBubble mounted its own <Modal> for this (dozens at once); hoisting it
 * to one instance is the biggest chat-list performance win.
 */
export default function MessageActionSheet({
  message,
  currentUserId,
  isPinned = false,
  canPin = false,
  onClose,
  onEdit,
  onDelete,
  onCopy,
  onPin,
  onReact,
  onReport,
}: MessageActionSheetProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [menuMode, setMenuMode] = useState<"actions" | "react">("actions");

  const isTemp = !!message && message._id.startsWith("temp_");
  const isOwnMessage = !!message && message.sender?._id === currentUserId;
  const withinEditWindow =
    !!message && Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
  const canEdit = isOwnMessage && !isTemp && message?.type === "text" && withinEditWindow;
  const canDelete = isOwnMessage && !isTemp;
  const canCopy = !isTemp && message?.type === "text" && !!message?.content;
  const canReport = !isOwnMessage && !isTemp && !!onReport;

  // Open on the action list, unless there are no actions at all (e.g. someone
  // else's image with no pin) — then jump straight to the emoji picker.
  useEffect(() => {
    if (!message) return;
    setMenuMode(canEdit || canDelete || canCopy || canPin || canReport ? "actions" : "react");
  }, [message, canEdit, canDelete, canCopy, canPin, canReport]);

  const handleDelete = () => {
    if (!message) return;
    onClose();
    Alert.alert(
      "Delete message",
      "This message will be removed for everyone. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(message) },
      ]
    );
  };

  return (
    <Modal
      visible={!!message}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        {menuMode === "react" ? (
          <View style={styles.pickerPill}>
            {QUICK_REACTIONS.map((e) => (
              <TouchableOpacity
                key={e}
                style={styles.pickerEmoji}
                onPress={() => {
                  if (message) onReact(message, e);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerEmojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.actionMenu}>
            {canEdit && (
              <>
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    if (message) onEdit(message);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textBright} />
                  <Text style={styles.actionLabel}>Edit</Text>
                </TouchableOpacity>
                <View style={styles.actionDivider} />
              </>
            )}

            {canCopy && (
              <>
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    if (message) onCopy(message);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={18} color={colors.textBright} />
                  <Text style={styles.actionLabel}>Copy</Text>
                </TouchableOpacity>
                <View style={styles.actionDivider} />
              </>
            )}

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => setMenuMode("react")}
              activeOpacity={0.7}
            >
              <Ionicons name="happy-outline" size={18} color={colors.textBright} />
              <Text style={styles.actionLabel}>React</Text>
            </TouchableOpacity>

            {canPin && (
              <>
                <View style={styles.actionDivider} />
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    if (message) onPin(message);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isPinned ? "pin" : "pin-outline"}
                    size={18}
                    color={isPinned ? colors.primary : colors.textBright}
                  />
                  <Text style={[styles.actionLabel, isPinned && { color: colors.primary }]}>
                    {isPinned ? "Unpin" : "Pin"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {canReport && (
              <>
                <View style={styles.actionDivider} />
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    if (message) onReport?.(message);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flag-outline" size={18} color={colors.error} />
                  <Text style={[styles.actionLabel, styles.actionLabelDanger]}>
                    Report
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {canDelete && (
              <>
                <View style={styles.actionDivider} />
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleDelete}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={[styles.actionLabel, styles.actionLabelDanger]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
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
  actionMenu: {
    minWidth: 230,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  actionLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: c.textBright,
  },
  actionLabelDanger: {
    color: c.error,
  },
  actionDivider: {
    height: 1,
    backgroundColor: c.glassFill,
  },
});
