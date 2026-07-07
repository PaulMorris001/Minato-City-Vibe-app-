import React, { useState, useRef } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import followService from "@/services/follow.service";

interface FollowButtonProps {
  userId: string;
  initialIsFollowing: boolean;
  initialIsMutual?: boolean;
  onFollowChange?: (isFollowing: boolean, isMutual: boolean) => void;
  size?: "small" | "medium";
}

export default function FollowButton({
  userId,
  initialIsFollowing,
  initialIsMutual = false,
  onFollowChange,
  size = "medium",
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isMutual, setIsMutual] = useState(initialIsMutual);
  const processing = useRef(false);

  const handlePress = () => {
    if (processing.current) return;

    const prevFollowing = isFollowing;
    const prevMutual = isMutual;

    // Optimistic update — UI changes instantly
    processing.current = true;
    setIsFollowing(!isFollowing);
    if (isFollowing) setIsMutual(false);

    if (prevFollowing) {
      followService.unfollowUser(userId)
        .then(() => {
          onFollowChange?.(false, false);
        })
        .catch(() => {
          setIsFollowing(prevFollowing);
          setIsMutual(prevMutual);
        })
        .finally(() => { processing.current = false; });
    } else {
      followService.followUser(userId)
        .then((result) => {
          setIsMutual(result.isMutual);
          onFollowChange?.(true, result.isMutual);
        })
        .catch(() => {
          setIsFollowing(prevFollowing);
          setIsMutual(prevMutual);
        })
        .finally(() => { processing.current = false; });
    }
  };

  const isSmall = size === "small";

  if (isFollowing) {
    return (
      <TouchableOpacity
        style={[
          styles.outlinedButton,
          isSmall ? styles.smallButton : styles.mediumButton,
          isMutual && styles.mutualButton,
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {isMutual && (
          <Ionicons
            name="checkmark-circle"
            size={isSmall ? 12 : 14}
            color="#a855f7"
            style={{ marginRight: 4 }}
          />
        )}
        <Text
          style={[
            styles.outlinedButtonText,
            isSmall && styles.smallButtonText,
          ]}
        >
          {isMutual ? "Mutual" : "Following"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <LinearGradient
        colors={["#a855f7", "#7c3aed"]}
        style={[styles.gradientButton, isSmall ? styles.smallButton : styles.mediumButton]}
      >
        <Text
          style={[
            styles.gradientButtonText,
            isSmall && styles.smallButtonText,
          ]}
        >
          Follow
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradientButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  gradientButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: Fonts.semiBold,
  },
  outlinedButton: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  outlinedButtonText: {
    color: "#9ca3af",
    fontSize: 14,
    fontFamily: Fonts.semiBold,
  },
  mutualButton: {
    borderColor: "rgba(168, 85, 247, 0.3)",
    backgroundColor: "rgba(168, 85, 247, 0.08)",
  },
  // Fixed height so all medium states (Follow / Following / Mutual) match the
  // profile screen's Message button exactly, border or no border.
  mediumButton: {
    height: 40,
    paddingVertical: 0,
  },
  smallButton: {
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  smallButtonText: {
    fontSize: 12,
  },
});
