import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Fonts } from "@/constants/fonts";
import { Avatar } from "./Avatar";
import FollowButton from "./FollowButton";
import { displayName } from "@/utils/displayName";
import { capitalize } from "@/libs/helpers";
import { openUserProfile } from "@/utils/userNavigation";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/** The user shape returned by /users/search and the unified /search. */
export interface UserRowItem {
  id: string;
  username: string;
  email?: string;
  profilePicture?: string;
  isVendor?: boolean;
  businessName?: string;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isMutual?: boolean;
}

/**
 * A user as a list row — avatar, name, secondary line, follow button. Used by
 * the people search screen and the unified search results.
 */
export default function UserRow({
  user,
  onPress,
}: {
  user: UserRowItem;
  /** Defaults to opening their profile. */
  onPress?: (user: UserRowItem) => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => (onPress ? onPress(user) : openUserProfile(user.id))}
    >
      <Avatar uri={user.profilePicture} name={displayName(user)} size={48} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {capitalize(displayName(user))}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {user.isVendor && user.businessName ? `@${user.username}` : user.email}
        </Text>
        {user.isFollowedBy && !user.isFollowing && (
          <Text style={styles.followsYou}>Follows you</Text>
        )}
      </View>
      <FollowButton
        userId={user.id}
        initialIsFollowing={!!user.isFollowing}
        initialIsMutual={!!user.isMutual}
        size="small"
      />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text },
    sub: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    followsYou: { fontSize: 11, fontFamily: Fonts.regular, color: c.textMuted },
  });
