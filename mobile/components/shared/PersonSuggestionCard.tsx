import React, { useRef } from "react";
import { Animated, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Avatar } from "./Avatar";
import FollowButton from "./FollowButton";
import VerifiedBadge from "./VerifiedBadge";
import { displayName } from "@/utils/displayName";
import { capitalize } from "@/libs/helpers";
import { openUserProfile } from "@/utils/userNavigation";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import type { SuggestedPerson } from "@/services/people.service";

/**
 * Guide topics (guide.model.js) → the emoji + short label shown on a
 * suggestion card. Anything unmapped falls back to a sparkle so a new topic
 * never renders blank.
 */
const TOPIC_META: Record<string, string> = {
  Chefs: "👨‍🍳 Chefs",
  "Food and Restaurants": "🍽 Food",
  "Music and Bands": "🎵 Music",
  "Bars and Clubs": "🍸 Nightlife",
  Casinos: "🎰 Casinos",
  Concerts: "🎤 Concerts",
  Events: "🎉 Events",
  Transportation: "🚗 Transport",
  Venues: "🏛 Venues",
  Florists: "💐 Florists",
  Decorations: "🎈 Decor",
  Desserts: "🍰 Desserts",
  Beverages: "🥤 Drinks",
  "Grocery stores": "🛒 Groceries",
  Museums: "🖼 Museums",
  Parks: "🌳 Parks",
  Hotels: "🏨 Hotels",
  Spas: "💆 Spas",
  "Hair and Nail Salons": "💅 Salons",
  "Barber Shops": "💈 Barbers",
};

const tagLabel = (topic: string) => TOPIC_META[topic] || `✨ ${topic}`;

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * A suggested person on the Discover People screen and the profile-tab
 * preview: avatar, name, @username, an emoji interest tagline, the reason
 * they're being suggested, and a Follow button.
 *
 * `compact` is the fixed-width vertical form used in the profile carousel;
 * the default is a full-width row for the standalone screen's rails.
 */
export default function PersonSuggestionCard({
  person,
  compact = false,
  onFollowed,
}: {
  person: SuggestedPerson;
  compact?: boolean;
  /** Fired once the follow has persisted — lets the list drop the card so a
   *  followed person doesn't linger in "people to add". */
  onFollowed?: (userId: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const name = capitalize(displayName(person));
  const tagline = (person.tagline || []).map(tagLabel).join("  ·  ");

  // On follow: hold on the "Following" state for a beat, then fade + shrink the
  // card out before the list actually drops it, so it doesn't just blink away.
  const anim = useRef(new Animated.Value(1)).current;
  const handleFollowChange = (isFollowing: boolean) => {
    if (!isFollowing || !onFollowed) return;
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(anim, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onFollowed(person._id));
  };

  const animStyle = {
    opacity: anim,
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };

  if (compact) {
    return (
      <AnimatedTouchable
        style={[styles.compactCard, animStyle]}
        activeOpacity={0.85}
        onPress={() => openUserProfile(person._id)}
      >
        {/* Fixed-height card + the button pinned via marginTop:auto keeps every
            Follow button on the same baseline no matter how much text a card
            has. */}
        <View style={styles.compactBody}>
          <Avatar uri={person.profilePicture} name={name} size={56} />
          <View style={styles.nameRowCentered}>
            <Text style={styles.compactName} numberOfLines={1}>
              {name}
            </Text>
            <VerifiedBadge verified={person.verified} size={13} />
          </View>
          <Text style={[styles.handle, styles.centerText]} numberOfLines={1}>
            @{person.username}
          </Text>
          {!!tagline && (
            <Text style={[styles.tagline, styles.centerText]} numberOfLines={1}>
              {tagline}
            </Text>
          )}
          {!!person.reason && (
            <Text style={[styles.reason, styles.centerText]} numberOfLines={1}>
              {person.reason}
            </Text>
          )}
        </View>
        <View style={styles.compactButton}>
          <FollowButton
            userId={person._id}
            initialIsFollowing={person.isFollowing}
            initialIsMutual={person.isMutual}
            onFollowChange={handleFollowChange}
            size="small"
          />
        </View>
      </AnimatedTouchable>
    );
  }

  return (
    <AnimatedTouchable
      style={[styles.row, animStyle]}
      activeOpacity={0.7}
      onPress={() => openUserProfile(person._id)}
    >
      <Avatar uri={person.profilePicture} name={name} size={52} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <VerifiedBadge verified={person.verified} />
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{person.username}
        </Text>
        {!!tagline && (
          <Text style={styles.tagline} numberOfLines={1}>
            {tagline}
          </Text>
        )}
        {!!person.reason && (
          <View style={styles.reasonRow}>
            <Ionicons name="people-outline" size={12} style={styles.reasonIcon} />
            <Text style={styles.reason} numberOfLines={1}>
              {person.reason}
            </Text>
          </View>
        )}
      </View>
      <FollowButton
        userId={person._id}
        initialIsFollowing={person.isFollowing}
        initialIsMutual={person.isMutual}
        onFollowChange={handleFollowChange}
        size="small"
      />
    </AnimatedTouchable>
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
    name: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text, flexShrink: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    nameRowCentered: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      alignSelf: "stretch",
      // Was on compactName; on the row instead so the badge sits on the same
      // baseline as the text rather than being pushed up by it.
      marginTop: 8,
    },
    handle: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    tagline: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 2 },
    reasonRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    reasonIcon: { color: c.primary },
    reason: { fontSize: 12, fontFamily: Fonts.medium, color: c.primary, flexShrink: 1 },
    centerText: { textAlign: "center" },

    compactCard: {
      width: 168,
      // Fixed so every card in the rail is the same height and the Follow
      // buttons line up; content that runs short just leaves space above the
      // pinned button.
      height: 208,
      backgroundColor: c.backgroundSecondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.glassStroke,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    compactBody: { alignItems: "center", gap: 2, alignSelf: "stretch" },
    compactName: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: c.text,
      textAlign: "center",
      // Truncates rather than shoving the badge past the card edge.
      flexShrink: 1,
    },
    compactButton: { marginTop: "auto", alignSelf: "stretch", paddingTop: 10 },
  });
