import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import { Service } from "@/libs/interfaces";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import PressScale from "@/components/shared/PressScale";
import ImageViewerModal from "@/components/shared/ImageViewerModal";
import {
  Brand,
  Radii,
  ServicesTokens,
  useServicesTokens,
} from "@/constants/vendorServicesTheme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
// sheetBody's own horizontal padding (16 a side) — the hero spans exactly
// the sheet's content width, so a page of the image pager must match it.
const HERO_WIDTH = SCREEN_WIDTH - 32;

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

  // Which of the service's photos the hero pager is currently on, and
  // whether the full-screen swipeable/zoomable viewer is open (opens to
  // this same index — a vendor can add several photos per service, but
  // clients used to only ever see the first one).
  const [heroIndex, setHeroIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  useEffect(() => {
    if (service) {
      setShown(service);
      setHeroIndex(0);
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
  const images = shown.images || [];
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT * 0.6, 0],
  });

  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / HERO_WIDTH);
    if (i !== heroIndex) setHeroIndex(i);
  };

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
              {images.length > 0 ? (
                // A vendor can add several photos per service — this used to
                // hardcode images[0], so a client could never see the rest.
                // Swipe here for a quick look; tap a photo to open the full,
                // zoomable ImageViewerModal at that same index.
                //
                // The tap target lives on each rendered page, NOT wrapped
                // around the FlatList itself — a Touchable as the FlatList's
                // direct parent claims the touch responder and the pager
                // stops being swipeable at all.
                <FlatList
                  style={styles.heroImage}
                  data={images}
                  horizontal
                  pagingEnabled
                  scrollEnabled={images.length > 1}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  onMomentumScrollEnd={onHeroScroll}
                  getItemLayout={(_, i) => ({ length: HERO_WIDTH, offset: HERO_WIDTH * i, index: i })}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      activeOpacity={0.92}
                      style={styles.heroPage}
                      onPress={() => {
                        setHeroIndex(index);
                        setViewerVisible(true);
                      }}
                      accessibilityLabel={
                        images.length > 1
                          ? `View all ${images.length} photos`
                          : "View photo full-screen"
                      }
                    >
                      <Image source={{ uri: item }} style={styles.heroPage} contentFit="cover" />
                    </TouchableOpacity>
                  )}
                />
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
                pointerEvents="none"
              />
              <View style={styles.heroPills} pointerEvents="none">
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
              {images.length > 1 && (
                <View style={styles.dotsRow} pointerEvents="none">
                  {images.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === heroIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              )}
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

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={heroIndex}
        onClose={() => setViewerVisible(false)}
      />
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
    // One page of the hero pager — HERO_WIDTH matches the sheet's own
    // content width exactly, so pages don't peek their neighbours.
    heroPage: {
      width: HERO_WIDTH,
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
    dotsRow: {
      position: "absolute",
      right: 14,
      bottom: 16,
      flexDirection: "row",
      gap: 4,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: "rgba(255,255,255,0.45)",
    },
    dotActive: {
      backgroundColor: "#ffffff",
      width: 14,
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
