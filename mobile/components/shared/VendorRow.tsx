import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import MediaTile from "@/components/shared/MediaTile";

/**
 * The populated vendor shape returned by both /vendors (browse) and
 * /vendors/search. They were divergent until the search endpoint was
 * normalized — one shape, one row component.
 */
export interface VendorRowItem {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { _id?: string; name?: string; icon?: string } | string;
  city?: { name?: string; state?: string; country?: string };
}

/** Vendor type is populated to an object, but legacy payloads sent a bare string. */
function typeName(vendorType: VendorRowItem["vendorType"]): string {
  if (!vendorType) return "Vendor";
  return (typeof vendorType === "string" ? vendorType : vendorType.name) || "Vendor";
}

/**
 * A vendor as a list row — used by search results and the vendors tab's search
 * mode. The horizontal carousel card on the vendors tab is a different
 * component by design; this is the compact list form.
 */
export default function VendorRow({
  vendor,
  onPress,
}: {
  vendor: VendorRowItem;
  onPress: (vendor: VendorRowItem) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const city = vendor.city?.name;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => onPress(vendor)}>
      {vendor.images && vendor.images.length > 0 ? (
        <MediaTile uri={vendor.images[0]} style={styles.image} posterOnly />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="business" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {vendor.name}
          </Text>
          {vendor.verified && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          )}
        </View>
        <Text style={styles.type} numberOfLines={1}>
          {typeName(vendor.vendorType)}
        </Text>
        {!!city && (
          <Text style={styles.location} numberOfLines={1}>
            {city}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
    image: { width: 56, height: 56, borderRadius: 12, backgroundColor: c.card },
    imagePlaceholder: { alignItems: "center", justifyContent: "center" },
    body: { flex: 1, gap: 2 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    name: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text, flexShrink: 1 },
    type: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    location: { fontSize: 12, fontFamily: Fonts.regular, color: c.textMuted },
  });
