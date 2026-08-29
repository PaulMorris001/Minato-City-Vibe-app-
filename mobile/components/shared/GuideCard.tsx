import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { formatLocation } from "@/utils/location";
import { priceLabel } from "@/constants/payments";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import MediaTile from "@/components/shared/MediaTile";

/** The guide shape returned by /guides/all and the unified /search. */
export interface GuideCardItem {
  _id: string;
  title: string;
  coverImage?: string;
  city?: string;
  cityState?: string;
  country?: string;
  authorName?: string;
  price: number;
  /** The seller's selling currency. Absent on legacy docs — defaults to USD. */
  currency?: string;
  views?: number;
}

/**
 * A guide as a result card — title, location, author, price, views.
 *
 * Note this is one of several guide presentations in the app; the city-guide
 * list, saved guides and profile all use their own row layouts with different
 * affordances (draft badges, purchase state). This is the search/browse card.
 */
export default function GuideCard({
  guide,
  onPress,
  style,
}: {
  guide: GuideCardItem;
  onPress: (guide: GuideCardItem) => void;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      activeOpacity={0.85}
      onPress={() => onPress(guide)}
    >
      {guide.coverImage ? (
        <MediaTile uri={guide.coverImage} style={styles.cover} posterOnly />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Ionicons name="book-outline" size={28} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {guide.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatLocation({
            city: guide.city,
            state: guide.cityState,
            country: guide.country || "",
          })}
        </Text>
        {!!guide.authorName && (
          <Text style={styles.author} numberOfLines={1}>
            by {guide.authorName}
          </Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.price}>
            {priceLabel(guide.price, guide.currency)}
          </Text>
          {guide.views != null && (
            <View style={styles.views}>
              <Ionicons name="eye-outline" size={13} color={colors.textDim} />
              <Text style={styles.viewsText}>{guide.views}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
    },
    cover: { width: "100%", height: 120 },
    coverPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: c.backgroundSecondary },
    body: { padding: 14, gap: 4 },
    title: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text },
    meta: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    author: { fontSize: 12, fontFamily: Fonts.regular, color: c.textMuted },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 6,
    },
    price: { fontSize: 14, fontFamily: Fonts.bold, color: c.primary },
    views: { flexDirection: "row", alignItems: "center", gap: 4 },
    viewsText: { fontSize: 12, fontFamily: Fonts.regular, color: c.textDim },
  });
