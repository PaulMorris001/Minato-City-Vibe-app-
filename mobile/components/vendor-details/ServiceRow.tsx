import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Service } from "@/libs/interfaces";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import PressScale from "@/components/shared/PressScale";
import {
  Brand,
  Radii,
  ServicesTokens,
  useServicesTokens,
} from "@/constants/vendorServicesTheme";

/** Dot next to the title: teal available, gold coming soon, red unavailable. */
export function availabilityColor(availability?: string): string {
  switch (availability) {
    case "available":
      return Brand.teal;
    case "coming_soon":
      return Brand.gold;
    case "unavailable":
      return Brand.red;
    default:
      return Brand.red;
  }
}

/** Price is always shown; the second slot is duration (services) or unit (products). */
function metaSuffix(item: Service): string | null {
  if (item.duration?.value) return `${item.duration.value} ${item.duration.unit}`;
  if (item.unit) return item.unit;
  return null;
}

interface ServiceRowProps {
  item: Service;
  inCart: boolean;
  onPress: () => void;
  onToggleCart: () => void;
}

/**
 * Compact service row: 76pt thumb, title + availability dot, one-line
 * description, price · duration, and an add/remove cart button.
 */
export default function ServiceRow({
  item,
  inCart,
  onPress,
  onToggleCart,
}: ServiceRowProps) {
  const t = useServicesTokens();
  const styles = React.useMemo(() => createStyles(t), [t]);
  const formatPrice = useFormatPrice();

  const image = item.images?.[0];
  const suffix = metaSuffix(item);

  return (
    <PressScale
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.thumb}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[Brand.violet, "#5b21b6", "#2a1150"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.thumbImage}
          />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.35)"]}
          style={styles.thumbScrim}
        />
      </View>

      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.name}
          </Text>
          <View
            style={[styles.dot, { backgroundColor: availabilityColor(item.availability) }]}
          />
        </View>
        {!!item.description && (
          <Text style={styles.description} numberOfLines={1}>
            {item.description}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.price}>
            {item.currency} {formatPrice(item.price)}
          </Text>
          {!!suffix && (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText} numberOfLines={1}>
                {suffix}
              </Text>
            </>
          )}
        </View>
      </View>

      {item.availability === "available" && (
        <PressScale
          style={[styles.addButton, inCart && styles.addButtonInCart]}
          onPress={onToggleCart}
          accessibilityRole="button"
          accessibilityLabel={inCart ? `Remove ${item.name} from cart` : `Add ${item.name} to cart`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {inCart ? (
            <View style={styles.addInner}>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
            </View>
          ) : (
            <LinearGradient
              colors={[...Brand.gradient]}
              start={Brand.gradientStart}
              end={Brand.gradientEnd}
              style={styles.addInner}
            >
              <Ionicons name="add" size={22} color="#ffffff" />
            </LinearGradient>
          )}
        </PressScale>
      )}
    </PressScale>
  );
}

const createStyles = (t: ServicesTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: Radii.row,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    thumb: {
      width: 76,
      height: 76,
      borderRadius: Radii.thumb,
      overflow: "hidden",
      backgroundColor: t.card2,
    },
    thumbImage: {
      width: "100%",
      height: "100%",
    },
    thumbScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "50%",
    },
    middle: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    title: {
      flexShrink: 1,
      fontSize: 15.5,
      fontFamily: Fonts.semiBold,
      color: t.t1,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: Radii.pill,
    },
    description: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: t.t2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    price: {
      fontSize: 15,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: Radii.pill,
      backgroundColor: t.t3,
    },
    metaText: {
      flexShrink: 1,
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: t.t2,
    },
    addButton: {
      width: 42,
      height: 42,
      borderRadius: Radii.thumb,
      overflow: "hidden",
      // Opaque fill so iOS renders the glow; the gradient child clips over it.
      backgroundColor: Brand.violet,
      shadowColor: Brand.violet,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 6,
    },
    addButtonInCart: {
      backgroundColor: Brand.teal,
      shadowOpacity: 0,
      elevation: 0,
    },
    addInner: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
  });
