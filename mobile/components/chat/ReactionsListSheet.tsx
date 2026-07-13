import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { Message } from "@/services/chat.service";
import { groupReactions } from "@/utils/reactions";
import { Avatar } from "@/components/shared/Avatar";
import { openUserProfile } from "@/utils/userNavigation";
import BottomSheetModal from "@/components/shared/BottomSheetModal";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface ReactionsListSheetProps {
  /** The message whose reactions to list, or null when closed. */
  message: Message | null;
  currentUserId?: string;
  onClose: () => void;
  /** Toggle the current user's reaction (used to remove your own). */
  onReact: (message: Message, emoji: string) => void;
}

/**
 * Single, screen-level "who reacted" sheet. Previously every MessageBubble
 * mounted its own BottomSheetModal for this even when hidden.
 */
export default function ReactionsListSheet({
  message,
  currentUserId,
  onClose,
  onReact,
}: ReactionsListSheetProps) {
  const styles = useThemedStyles(createStyles);
  const grouped = useMemo(
    () => groupReactions(message?.reactions, currentUserId),
    [message, currentUserId]
  );

  return (
    <BottomSheetModal
      visible={!!message}
      onClose={onClose}
      title="Reactions"
      maxHeight="60%"
    >
      {grouped.map((g) => (
        <View key={g.emoji} style={styles.reactSheetGroup}>
          {g.users.map((u, idx) => {
            const isMe = !!currentUserId && u._id === currentUserId;
            return (
              <TouchableOpacity
                key={`${g.emoji}-${u._id}-${idx}`}
                style={styles.reactSheetRow}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  if (isMe && message) onReact(message, g.emoji);
                  else openUserProfile(u._id);
                }}
              >
                <Avatar uri={u.profilePicture} name={u.username} size={38} />
                <Text style={styles.reactSheetName} numberOfLines={1}>
                  {isMe ? "You · tap to remove" : u.username || "User"}
                </Text>
                <Text style={styles.reactSheetEmoji}>{g.emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </BottomSheetModal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  reactSheetGroup: {
    marginBottom: 4,
  },
  reactSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  reactSheetName: {
    flex: 1,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: c.text,
  },
  reactSheetEmoji: {
    fontSize: 20,
  },
});
