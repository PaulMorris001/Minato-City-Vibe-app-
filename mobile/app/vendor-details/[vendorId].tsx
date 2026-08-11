import React, { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { fetchVendorServices, fetchVendorCategories } from "@/libs/api";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { Service, CatalogueCategory } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { BASE_URL } from "@/constants/constants";
import { useCart } from "@/contexts/CartContext";
import { currencyPrefix } from "@/constants/payments";
import { openUserProfile } from "@/utils/userNavigation";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";
import GlassBackButton from "@/components/shared/GlassBackButton";
import PressScale from "@/components/shared/PressScale";
import ServiceRow from "@/components/vendor-details/ServiceRow";
import ServiceDetailSheet from "@/components/vendor-details/ServiceDetailSheet";
import {
  Brand,
  Radii,
  ServicesTokens,
  useServicesTokens,
} from "@/constants/vendorServicesTheme";

interface Review {
  _id: string;
  // Null when the reviewer's account has been deleted.
  user: { _id: string; username: string; profilePicture?: string } | null;
  rating: number;
  review: string;
  createdAt: string;
}

interface VendorOwner {
  _id: string;
  username?: string;
  profilePicture?: string;
  businessName?: string;
}

/** Services beyond this many collapse behind the category's "See all". */
const COLLAPSED_COUNT = 4;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Rating stars. Filled gold up to `rating`; the remainder is a filled faint
 * star when read-only and an outline when the row is a picker.
 */
function StarRow({
  rating,
  size = 14,
  faint,
  onPress,
}: {
  rating: number;
  size?: number;
  faint: string;
  onPress?: (r: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onPress?.(star)}
          disabled={!onPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={star <= rating ? "star" : onPress ? "star-outline" : "star"}
            size={size}
            color={star <= rating ? Brand.gold : faint}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface ServiceSection {
  key: string;
  title: string;
  count: number;
  /** True when the group is longer than COLLAPSED_COUNT. */
  expandable: boolean;
  expanded: boolean;
  data: Service[];
}

export default function VendorDetails() {
  const t = useServicesTokens();
  const styles = useMemo(() => createStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { vendorId, vendorName } = useLocalSearchParams();
  const router = useRouter();
  const formatPrice = useFormatPrice();

  // Vendor (contact links, description, images)
  const [vendor, setVendor] = useState<any>(null);
  const [vendorLoadError, setVendorLoadError] = useState(false);

  // Services + their parent catalogue categories
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<CatalogueCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoadError, setServicesLoadError] = useState(false);

  // Category groups the user has expanded past COLLAPSED_COUNT
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Service detail sheet
  const [sheetService, setSheetService] = useState<Service | null>(null);

  // Cart (single-vendor)
  const cart = useCart();

  // Reviews + Rating
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Rating modal
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const vId = vendorId as string;
  const vName = (vendorName as string) || vendor?.name || "Vendor";

  const avgRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : 0;

  // Owner account behind this vendor. The API populates it, but older payloads
  // (and cached responses) may still hand back a bare id.
  const owner = useMemo<VendorOwner | null>(() => {
    const u = vendor?.user;
    if (!u) return null;
    return typeof u === "string" ? { _id: u } : (u as VendorOwner);
  }, [vendor]);

  const reloadVendorAndServices = () => {
    setVendorLoadError(false);
    setServicesLoadError(false);
    setLoading(true);
    fetchVendorServices(vId)
      .then((data) => setServices(data))
      .catch(() => setServicesLoadError(true))
      .finally(() => setLoading(false));
    fetchVendorCategories(vId)
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch(`${BASE_URL}/vendors/${vId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data._id) setVendor(data);
        else setVendorLoadError(true);
      })
      .catch(() => setVendorLoadError(true));
  };

  useEffect(() => {
    const loadServices = async () => {
      try {
        const data = await fetchVendorServices(vendorId as string);
        setServices(data);
      } catch {
        setServicesLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    loadServices();
    fetchVendorCategories(vendorId as string)
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch(`${BASE_URL}/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data._id) setVendor(data);
        else setVendorLoadError(true);
      })
      .catch(() => setVendorLoadError(true));
    fetchReviews();
  }, [vendorId]);

  const fetchReviews = async () => {
    setReviewsLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/vendors/${vendorId}/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setTotalReviews(data.total || 0);
        if (data.userReview) {
          setUserReview(data.userReview);
          setSelectedRating(data.userReview.rating);
          setReviewText(data.userReview.review || "");
        }
      }
    } catch (error) {
      console.error("Error loading reviews:", error);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (selectedRating === 0) {
      showInfo("Please select a star rating.");
      return;
    }
    setSubmittingRating(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/vendors/${vendorId}/rate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rating: selectedRating, review: reviewText }),
      });
      const data = await res.json();
      if (res.ok) {
        showSuccess("Your rating has been saved.", "Thanks!");
        setRatingModalVisible(false);
        fetchReviews();
      } else {
        showError(data.message || "Failed to submit rating");
      }
    } catch {
      showError("Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  // Quantity of each service currently in the cart (only when this cart is for
  // this vendor), so rows know whether to show + or ✓.
  const cartQtyByService = useMemo(() => {
    const map: Record<string, number> = {};
    if (cart.hasVendorItems(vId)) {
      for (const it of cart.items) {
        if (it.vendorId === vId) {
          map[it.serviceId] = it.quantity;
        }
      }
    }
    return map;
  }, [cart.items, cart.hasVendorItems, vId]);

  const addToCart = (item: Service) => {
    const doAdd = () =>
      cart.addItem(vId, vName, {
        serviceId: item._id,
        name: item.name,
        price: item.price,
        currency: item.currency,
        image: item.images?.[0],
        section: item.section,
        quantity: 1,
      });

    if (cart.isDifferentVendor(vId)) {
      const existingVendors = Array.from(
        new Set(cart.items.map((it) => it.vendorName || "another vendor"))
      );
      const vendorLabel =
        existingVendors.length === 1
          ? existingVendors[0]
          : `${existingVendors.length} vendors`;

      Alert.alert(
        "Start a new cart?",
        `Your cart already has items from ${vendorLabel}. Adding this will clear it and start a cart with ${vName}.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start new cart", style: "destructive", onPress: doAdd },
        ]
      );
      return;
    }
    doAdd();
  };

  /** + adds one, ✓ takes the whole line back out. */
  const toggleCart = (item: Service) => {
    if (cartQtyByService[item._id]) cart.removeItem(item._id);
    else addToCart(item);
  };

  // Services grouped under their parent catalogue category (in the vendor's
  // category order); anything not yet linked to a category falls back to its
  // legacy `section`, then to a single "Services" group.
  const sections = useMemo<ServiceSection[]>(() => {
    const byCatId: Record<string, Service[]> = {};
    const legacy: Service[] = [];
    for (const s of services) {
      if (s.catalogueCategory) (byCatId[s.catalogueCategory] ||= []).push(s);
      else legacy.push(s);
    }

    const groups: { key: string; title: string; items: Service[] }[] = [];
    for (const cat of categories) {
      const items = byCatId[cat._id];
      if (!items?.length) continue;
      groups.push({ key: cat._id, title: cat.name, items });
    }

    if (legacy.length) {
      const order: string[] = [];
      const buckets: Record<string, Service[]> = {};
      for (const s of legacy) {
        const key = (s.section || "").trim() || "Other";
        if (!buckets[key]) {
          buckets[key] = [];
          order.push(key);
        }
        buckets[key].push(s);
      }
      order.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : 0));
      // Everything in one unnamed bucket reads better as a plain "Services".
      const lone = groups.length === 0 && order.length === 1 && order[0] === "Other";
      for (const key of order) {
        groups.push({
          key: `legacy:${key}`,
          title: lone ? "Services" : key,
          items: buckets[key],
        });
      }
    }

    return groups.map((g) => {
      const isExpanded = !!expanded[g.key];
      return {
        key: g.key,
        title: g.title,
        count: g.items.length,
        expandable: g.items.length > COLLAPSED_COUNT,
        expanded: isExpanded,
        data: isExpanded ? g.items : g.items.slice(0, COLLAPSED_COUNT),
      };
    });
  }, [services, categories, expanded]);

  const categoryNameFor = (service: Service | null) => {
    if (!service) return undefined;
    if (service.catalogueCategory) {
      const cat = categories.find((c) => c._id === service.catalogueCategory);
      if (cat) return cat.name;
    }
    return service.section || service.category || undefined;
  };

  const openProfile = () => owner?._id && openUserProfile(owner._id);

  // ── Header (fixed, above the scroll area) ────────────────────────────────

  const avatarUri = vendor?.images?.[0] || owner?.profilePicture;
  const initial = (owner?.businessName || vName || "?").trim()[0]?.toUpperCase() || "?";

  const renderNavHeader = () => (
    <View style={[styles.navHeader, { paddingTop: insets.top + 6 }]}>
      <GlassBackButton size={40} />
      <PressScale
        style={styles.avatarWrap}
        onPress={openProfile}
        disabled={!owner?._id}
        accessibilityRole="button"
        accessibilityLabel={`${vName} profile`}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[...Brand.avatarGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarInitial}>{initial}</Text>
          </LinearGradient>
        )}
      </PressScale>

      <PressScale
        style={styles.vendorBlock}
        onPress={openProfile}
        disabled={!owner?._id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${vName}'s profile`}
      >
        <View style={styles.vendorNameRow}>
          <Text style={styles.vendorName} numberOfLines={1}>
            {vName}
          </Text>
          {vendor?.verified && (
            <Ionicons name="checkmark-circle" size={15} color={Brand.teal} />
          )}
          {!!owner?._id && <Ionicons name="chevron-forward" size={15} color={t.t3} />}
        </View>
        <View style={styles.vendorMetaRow}>
          {totalReviews > 0 && (
            <>
              <View style={styles.ratingChip}>
                <Ionicons name="star" size={12} color={Brand.gold} />
                <Text style={styles.ratingText}>{avgRating}</Text>
              </View>
              <Text style={styles.metaSeparator}>·</Text>
            </>
          )}
          <Text style={styles.vendorMeta} numberOfLines={1}>
            {services.length > 0
              ? `${services.length} ${services.length === 1 ? "service" : "services"}`
              : owner?.username
                ? `@${owner.username} · no services yet`
                : "No services yet"}
          </Text>
        </View>
      </PressScale>
    </View>
  );

  // ── Scroll content ───────────────────────────────────────────────────────

  const contact = vendor?.contact || {};
  const socialUrl = (key: string, val: string): string | null => {
    if (!val) return null;
    const v = val.trim();
    if (v.startsWith("http")) return v;
    const handle = v.replace(/^@/, "");
    switch (key) {
      case "instagram":
        return `https://instagram.com/${handle}`;
      case "tiktok":
        return `https://tiktok.com/@${handle}`;
      case "twitter":
        return `https://x.com/${handle}`;
      case "facebook":
        return `https://facebook.com/${handle}`;
      case "website":
        return `https://${v}`;
      case "phone":
        return `tel:${v}`;
      default:
        return v;
    }
  };

  const SOCIALS: { key: string; icon: any; color: string }[] = [
    { key: "instagram", icon: "logo-instagram", color: "#E1306C" },
    { key: "tiktok", icon: "logo-tiktok", color: t.t1 },
    { key: "twitter", icon: "logo-twitter", color: "#1DA1F2" },
    { key: "facebook", icon: "logo-facebook", color: "#1877F2" },
    { key: "website", icon: "globe-outline", color: Brand.violet },
    { key: "phone", icon: "call-outline", color: Brand.teal },
  ];

  const renderListHeader = () => {
    const links = SOCIALS.map((s) => ({ ...s, url: socialUrl(s.key, contact[s.key]) })).filter(
      (s) => s.url
    );
    const hasAbout = !!vendor?.description || links.length > 0;
    return (
      <View>
        {(vendorLoadError || servicesLoadError) && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              {vendorLoadError ? "Couldn't load vendor info." : "Couldn't load services."}
            </Text>
            <TouchableOpacity onPress={reloadVendorAndServices} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {vendor && !vendor.verified && (
          <View style={styles.trustStrip}>
            <Ionicons name="eye-outline" size={16} color={t.warnInk} />
            <Text style={styles.trustStripText}>
              Not yet verified by OurCityvibe — book with care.
            </Text>
          </View>
        )}

        {hasAbout && (
          <View style={styles.aboutCard}>
            {!!vendor?.description && (
              <Text style={styles.aboutText}>{vendor.description}</Text>
            )}
            {links.length > 0 && (
              <View style={styles.socialRow}>
                {links.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={styles.socialButton}
                    onPress={() => Linking.openURL(s.url as string).catch(() => {})}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={s.icon} size={18} color={s.color} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 20 }} />
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: ServiceSection }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{section.count}</Text>
        </View>
      </View>
      {section.expandable && (
        <TouchableOpacity
          onPress={() => setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Text style={styles.seeAll}>{section.expanded ? "Show less" : "See all"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderReviews = () => (
    <View style={styles.reviewsSection}>
      <View style={styles.reviewsHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.reviewsTitle}>Reviews</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{totalReviews}</Text>
          </View>
        </View>
        <PressScale
          style={styles.rateButton}
          onPress={() => setRatingModalVisible(true)}
          accessibilityRole="button"
        >
          <Ionicons name="star-outline" size={15} color={t.violetInk} />
          <Text style={styles.rateButtonText}>
            {userReview ? "Edit rating" : "Rate vendor"}
          </Text>
        </PressScale>
      </View>

      {reviewsLoading ? (
        <ActivityIndicator color={Brand.violet} style={{ marginVertical: 16 }} />
      ) : reviews.length === 0 ? (
        <Text style={styles.noReviewsText}>No reviews yet. Be the first!</Text>
      ) : (
        reviews.map((review) => (
          <View key={review._id} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <TouchableOpacity
                style={styles.reviewUser}
                activeOpacity={0.7}
                disabled={!review.user?._id}
                onPress={() => review.user?._id && openUserProfile(review.user._id)}
              >
                {review.user?.profilePicture ? (
                  <Image
                    source={{ uri: review.user.profilePicture }}
                    style={styles.reviewAvatar}
                    contentFit="cover"
                  />
                ) : review.user ? (
                  <LinearGradient
                    colors={[...Brand.avatarGradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.reviewAvatar}
                  >
                    <Text style={styles.reviewAvatarLetter}>
                      {review.user.username?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.reviewAvatar, styles.reviewAvatarDeleted]}>
                    <Text style={[styles.reviewAvatarLetter, { color: t.t2 }]}>?</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.reviewUsername} numberOfLines={1}>
                    {review.user?.username || "Deleted user"}
                  </Text>
                  <Text style={styles.reviewTime}>{timeAgo(review.createdAt)}</Text>
                </View>
              </TouchableOpacity>
              <StarRow rating={review.rating} size={14} faint={t.t3} />
            </View>
            {!!review.review && <Text style={styles.reviewText}>{review.review}</Text>}
          </View>
        ))
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="briefcase-outline" size={36} color={t.violetInk} />
      </View>
      <Text style={styles.emptyTitle}>No services yet</Text>
      <Text style={styles.emptyText}>
        {"This vendor hasn't listed anything for booking. Check back soon."}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {renderNavHeader()}
        <View style={styles.loadingContainer}>
          <VendorCardSkeleton count={3} />
        </View>
      </View>
    );
  }

  const cartActive = cart.vendorId === vId && cart.count > 0;

  return (
    <View style={styles.screen}>
      {renderNavHeader()}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        stickySectionHeadersEnabled
        renderSectionHeader={renderSectionHeader}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <ServiceRow
              item={item}
              inCart={!!cartQtyByService[item._id]}
              onPress={() => setSheetService(item)}
              onToggleCart={() => toggleCart(item)}
            />
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={renderListHeader()}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          <>
            {renderReviews()}
            <View style={{ height: 120 }} />
          </>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={sections.length === 0 ? styles.emptyListContent : undefined}
      />

      {/* Floating cart bar — appears when this vendor's cart has items */}
      {cartActive && (
        <CartBar
          bottom={Math.max(insets.bottom, 22)}
          count={cart.count}
          total={`${currencyPrefix(cart.items[0]?.currency)}${formatPrice(cart.subtotal)}`}
          onPress={() => router.push("/cart" as any)}
          styles={styles}
        />
      )}

      <ServiceDetailSheet
        service={sheetService}
        categoryName={categoryNameFor(sheetService)}
        inCart={!!(sheetService && cartQtyByService[sheetService._id])}
        onClose={() => setSheetService(null)}
        onToggleCart={() => sheetService && toggleCart(sheetService)}
      />

      {/* Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setRatingModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {userReview ? "Edit rating" : "Rate vendor"}
              </Text>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)}>
                <Ionicons name="close" size={24} color={t.t1} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalServiceName}>{vName}</Text>

            <Text style={styles.inputLabel}>Your rating</Text>
            <View style={styles.starSelector}>
              <StarRow
                rating={selectedRating}
                size={36}
                faint={t.t3}
                onPress={setSelectedRating}
              />
            </View>

            <Text style={styles.inputLabel}>Review (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Share your experience..."
              placeholderTextColor={t.t3}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              numberOfLines={4}
              maxLength={500}
            />

            <PressScale
              style={[styles.submitButton, selectedRating === 0 && styles.submitButtonDisabled]}
              onPress={handleSubmitRating}
              disabled={submittingRating || selectedRating === 0}
            >
              <LinearGradient
                colors={[...Brand.gradient]}
                start={Brand.gradientStart}
                end={Brand.gradientEnd}
                style={styles.submitGradient}
              >
                {submittingRating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Submit rating</Text>
                )}
              </LinearGradient>
            </PressScale>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Cart bar, faded in over 200ms whenever the cart stops being empty. */
function CartBar({
  bottom,
  count,
  total,
  onPress,
  styles,
}: {
  bottom: number;
  count: number;
  total: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.cartBar, { bottom, opacity }]}>
      <PressScale onPress={onPress} accessibilityRole="button" style={styles.cartBarPress}>
        <LinearGradient
          colors={[...Brand.gradient]}
          start={Brand.gradientStart}
          end={Brand.gradientEnd}
          style={styles.cartBarInner}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cartBarText}>
              {count} {count === 1 ? "service" : "services"} in cart
            </Text>
            <Text style={styles.cartBarTotal}>{total}</Text>
          </View>
          <View style={styles.cartBarPill}>
            <Text style={styles.cartBarPillText}>View cart</Text>
            <Ionicons name="chevron-forward" size={16} color="#ffffff" />
          </View>
        </LinearGradient>
      </PressScale>
    </Animated.View>
  );
}

const createStyles = (t: ServicesTokens) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.app,
    },
    loadingContainer: {
      flex: 1,
      paddingHorizontal: 16,
    },

    // ── Nav header ──
    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: t.app,
    },
    avatarWrap: {
      width: 40,
      height: 40,
      borderRadius: Radii.pill,
      overflow: "hidden",
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: Radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      fontSize: 16,
      fontFamily: Fonts.bold,
      color: "#ffffff",
    },
    vendorBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      paddingVertical: 2,
    },
    vendorNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    vendorName: {
      flexShrink: 1,
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    vendorMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    ratingChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    ratingText: {
      fontSize: 12.5,
      fontFamily: Fonts.semiBold,
      color: Brand.gold,
    },
    metaSeparator: {
      fontSize: 12.5,
      color: t.t3,
    },
    vendorMeta: {
      flexShrink: 1,
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: t.t2,
    },

    // ── List header ──
    trustStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radii.thumb,
      backgroundColor: t.warnBg,
    },
    trustStripText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      fontFamily: Fonts.regular,
      color: t.warnInk,
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radii.thumb,
      backgroundColor: "rgba(239,83,80,0.12)",
    },
    errorBannerText: {
      fontSize: 12.5,
      fontFamily: Fonts.regular,
      color: Brand.red,
    },
    retryBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radii.smallButton,
      backgroundColor: "rgba(239,83,80,0.18)",
    },
    retryBtnText: {
      fontSize: 12.5,
      fontFamily: Fonts.semiBold,
      color: Brand.red,
    },
    aboutCard: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 14,
      borderRadius: Radii.row,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      gap: 12,
    },
    aboutText: {
      fontSize: 13.5,
      lineHeight: 20,
      fontFamily: Fonts.regular,
      color: t.t2,
    },
    socialRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    socialButton: {
      width: 40,
      height: 40,
      borderRadius: Radii.smallButton,
      backgroundColor: t.card2,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Sections ──
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: t.app,
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionTitle: {
      fontSize: 15,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    countPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radii.pill,
      backgroundColor: t.card2,
    },
    countPillText: {
      fontSize: 12,
      fontFamily: Fonts.semiBold,
      color: t.t3,
    },
    seeAll: {
      fontSize: 12.5,
      fontFamily: Fonts.semiBold,
      color: t.violetInk,
    },
    rowWrap: {
      paddingHorizontal: 16,
      paddingBottom: 10,
    },

    // ── Empty state ──
    emptyListContent: {
      flexGrow: 1,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingHorizontal: 40,
      paddingVertical: 48,
    },
    emptyIcon: {
      width: 88,
      height: 88,
      borderRadius: Radii.emptyIcon,
      backgroundColor: t.card2,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 21,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 22,
      fontFamily: Fonts.regular,
      color: t.t2,
      textAlign: "center",
    },

    // ── Reviews ──
    reviewsSection: {
      marginHorizontal: 16,
      marginTop: 4,
      paddingTop: 18,
      borderTopWidth: 1,
      borderTopColor: t.line,
      gap: 12,
    },
    reviewsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    reviewsTitle: {
      fontSize: 16,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    rateButton: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 14,
      borderRadius: Radii.smallButton,
      borderWidth: 1,
      borderColor: Brand.violetOutline,
    },
    rateButtonText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: t.violetInk,
    },
    noReviewsText: {
      fontSize: 13.5,
      fontFamily: Fonts.regular,
      color: t.t3,
      textAlign: "center",
      paddingVertical: 20,
    },
    reviewCard: {
      padding: 14,
      borderRadius: Radii.row,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      gap: 10,
    },
    reviewTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    reviewUser: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    reviewAvatar: {
      width: 34,
      height: 34,
      borderRadius: Radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    reviewAvatarDeleted: {
      backgroundColor: "rgba(167,159,184,0.22)",
    },
    reviewAvatarLetter: {
      fontSize: 14,
      fontFamily: Fonts.bold,
      color: "#ffffff",
    },
    reviewUsername: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: t.t1,
    },
    reviewTime: {
      fontSize: 11.5,
      fontFamily: Fonts.regular,
      color: t.t3,
      marginTop: 1,
    },
    reviewText: {
      fontSize: 13.5,
      lineHeight: 20,
      fontFamily: Fonts.regular,
      color: t.t2,
    },

    // ── Cart bar ──
    cartBar: {
      position: "absolute",
      left: 16,
      right: 16,
      borderRadius: Radii.bar,
      backgroundColor: Brand.violet,
      shadowColor: Brand.violet,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.45,
      shadowRadius: 34,
      elevation: 10,
    },
    cartBarPress: {
      borderRadius: Radii.bar,
      overflow: "hidden",
    },
    cartBarInner: {
      height: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 20,
      paddingRight: 8,
    },
    cartBarText: {
      fontSize: 15,
      fontFamily: Fonts.bold,
      color: "#ffffff",
    },
    cartBarTotal: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: "rgba(255,255,255,0.8)",
    },
    cartBarPill: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: Radii.thumb,
      backgroundColor: "rgba(11,8,19,0.28)",
    },
    cartBarPillText: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: "#ffffff",
    },

    // ── Rating modal ──
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(4,2,8,0.55)",
      justifyContent: "flex-end",
    },
    modalBackdrop: {
      flex: 1,
    },
    modalContent: {
      backgroundColor: t.card,
      borderTopLeftRadius: Radii.sheet,
      borderTopRightRadius: Radii.sheet,
      padding: 24,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 22,
      fontFamily: Fonts.bold,
      color: t.t1,
    },
    modalServiceName: {
      fontSize: 14,
      fontFamily: Fonts.medium,
      color: t.violetInk,
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 10.5,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontFamily: Fonts.semiBold,
      color: t.t3,
      marginBottom: 6,
    },
    starSelector: {
      alignItems: "center",
      paddingVertical: 16,
    },
    modalInput: {
      backgroundColor: t.card2,
      borderRadius: Radii.thumb,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: t.t1,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.line,
    },
    modalTextArea: {
      height: 100,
      textAlignVertical: "top",
    },
    submitButton: {
      height: 54,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: Brand.violet,
      shadowColor: Brand.violet,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 28,
      elevation: 8,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitGradient: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    submitText: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: "#ffffff",
    },
  });
