import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { formatLocation } from "@/utils/location";
import { priceLabel } from "@/constants/payments";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/** The guide shape returned by /guides/all and the unified /search. */
export interface GuideCardItem {
  _id: string;
  title: string;
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
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
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
