import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
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

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Availability pill on the hero — colour and copy follow the service state. */
function availabilityPill(availability?: string) {
  switch (availability) {
    case "available":
      return { label: "Available", bg: "rgba(34,201,165,0.9)", ink: Brand.tealInk };
    case "coming_soon":
      return { label: "Coming soon", bg: "rgba(245,185,66,0.92)", ink: "#3a2a05" };
    default:
      return { label: "Unavailable", bg: "rgba(239,83,80,0.92)", ink: "#ffffff" };
  }
}

/** Second meta tile: duration for services, unit or lead time for products. */
function secondTile(service: Service): { label: string; value: string } | null {
  if (service.duration?.value)
    return { label: "Duration", value: `${service.duration.value} ${service.duration.unit}` };
  if (service.unit) return { label: "Unit", value: service.unit };
  if (service.leadTime?.value)
    return { label: "Lead time", value: `${service.leadTime.value} ${service.leadTime.unit}` };
  return null;
}

interface ServiceDetailSheetProps {
  service: Service | null;
  categoryName?: string;
  inCart: boolean;
  onClose: () => void;
  onToggleCart: () => void;
}

/**
 * Detail sheet for a single service: hero, copy, price/duration tiles and the
 * cart toggle. Rises over the list, scrim taps dismiss.
 */
export default function ServiceDetailSheet({
  service,
  categoryName,
  inCart,
  onClose,
  onToggleCart,
}: ServiceDetailSheetProps) {
  const router = useRouter();
  const t = useServicesTokens();
  const styles = React.useMemo(() => createStyles(t), [t]);
  const formatPrice = useFormatPrice();

  // Keep the last service around while the sheet animates out so the content
  // doesn't blank mid-flight.
  const [shown, setShown] = useState<Service | null>(service);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (service) {
      setShown(service);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [service, progress]);

  if (!shown) return null;

  const pill = availabilityPill(shown.availability);
  const tile = secondTile(shown);
  const image = shown.images?.[0];
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.6, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetBody}
            bounces={false}
          >
            <View style={styles.hero}>
              {image ? (
                <Image source={{ uri: image }} style={styles.heroImage} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={[Brand.violet, "#5b21b6", "#2a1150"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroImage}
                />
              )}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.45)"]}
                style={styles.heroScrim}
              />
              <View style={styles.heroPills}>
                {!!categoryName && (
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryPillText}>{categoryName}</Text>
                  </View>
                )}
                <View style={[styles.availabilityPill, { backgroundColor: pill.bg }]}>
                  <Text style={[styles.availabilityPillText, { color: pill.ink }]}>
                    {pill.label}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.copy}>
              <Text style={styles.title}>{shown.name}</Text>
              {!!shown.description && <Text style={styles.description}>{shown.description}</Text>}
            </View>

            <View style={styles.tiles}>
              <View style={styles.tile}>
                <Text style={styles.tileEyebrow}>PRICE</Text>
                <Text style={styles.tileValue}>
                  {shown.currency} {formatPrice(shown.price)}
                </Text>
              </View>
              {!!tile && (
                <View style={styles.tile}>
                  <Text style={styles.tileEyebrow}>{tile.label.toUpperCase()}</Text>
                  <Text style={styles.tileValue}>{tile.value}</Text>
                </View>
              )}
            </View>

            {shown.availability === "available" && (
              <>
                <PressScale style={styles.cta} onPress={onToggleCart} accessibilityRole="button">
                  <LinearGradient
                    colors={[...Brand.gradient]}
                    start={Brand.gradientStart}
                    end={Brand.gradientEnd}
                    style={styles.ctaInner}
                  >
                    <Text style={styles.ctaText}>{inCart ? "Added to cart" : "Add to cart"}</Text>
                  </LinearGradient>
                </PressScale>
                {inCart && (
                  <PressScale
                    style={styles.checkoutBtn}
                    onPress={() => {
                      onClose();
                      router.push("/cart" as any);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.checkoutText}>Go to cart</Text>
                  </PressScale>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (t: ServicesTokens) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(4,2,8,0.55)",
    },
    sheet: {
      maxHeight: "88%",
      backgroundColor: t.card,
      borderTopLeftRadius: Radii.sheet,
      borderTopRightRadius: Radii.sheet,
      borderBottomLeftRadius: 44,
      borderBottomRightRadius: 44,
      borderTopWidth: 1,
      borderTopColor: t.line,
      paddingTop: 10,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: Radii.pill,
      backgroundColor: t.t3,
      opacity: 0.5,
    },
    sheetBody: {
      padding: 16,
      paddingBottom: 26,
      gap: 16,
    },
    hero: {
      height: 168,
      borderRadius: Radii.bar,
      overflow: "hidden",
      backgroundColor: t.card2,
    },
    heroImage: {
      width: "100%",
      height: "100%",
    },
    heroScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "60%",
    },
    heroPills: {
      position: "absolute",
      left: 14,
      bottom: 12,
      flexDirection: "row",
      gap: 8,
    },
    categoryPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.pill,
      backgroundColor: "rgba(11,8,19,0.5)",
    },
    categoryPillText: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: "#ffffff",
    },
    availabilityPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.pill,
    },
    availabilityPillText: {
      fontSize: 11.5,
      fontFamily: Fonts.bold,
    },
    copy: {
      gap: 8,
    },
    title: {
      fontSize: 22,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    description: {
      fontSize: 14,
      lineHeight: 22,
      fontFamily: Fonts.regular,
      color: t.t2,
    },
    tiles: {
      flexDirection: "row",
      gap: 10,
    },
    tile: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radii.thumb,
      backgroundColor: t.card2,
      gap: 3,
    },
    tileEyebrow: {
      fontSize: 10.5,
      letterSpacing: 1.5,
      fontFamily: Fonts.semiBold,
      color: t.t3,
    },
    tileValue: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    cta: {
      height: 54,
      borderRadius: 16,
      overflow: "hidden",
      // iOS only draws a shadow when the layer is opaque; the gradient child is
      // clipped on top of this fill.
      backgroundColor: Brand.violet,
      shadowColor: Brand.violet,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 28,
      elevation: 8,
    },
    checkoutBtn: {
      marginTop: 12,
      height: 52,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: Brand.black,
      shadowColor: Brand.black,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 6,
    },
    checkoutText: {
      fontSize: 15,
      fontFamily: Fonts.semiBold,
      color: "#ffffff",
      letterSpacing: 0.15,
    },
    ctaInner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaText: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: "#ffffff",
    },
  });
