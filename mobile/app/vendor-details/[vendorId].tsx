import React, { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { fetchVendorServices } from "@/libs/api";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from "react-native";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { DateTimeDropdown } from "@/components/shared";
import { Service } from "@/libs/interfaces";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { openUserProfile } from "@/utils/userNavigation";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
interface Review {
  _id: string;
  user: { _id: string; username: string; profilePicture?: string };
  rating: number;
  review: string;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StarRow({ rating, size = 16, onPress }: { rating: number; size?: number; onPress?: (r: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onPress?.(star)} disabled={!onPress} activeOpacity={0.7}>
          <Ionicons
            name={star <= rating ? "star" : "star-outline"}
            size={size}
            color={star <= rating ? colors.warning : colors.borderMuted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function VendorDetails() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { vendorId, vendorName } = useLocalSearchParams();
  const router = useRouter();
  const formatPrice = useFormatPrice();

  // Vendor (contact links, description, images)
  const [vendor, setVendor] = useState<any>(null);
  const [vendorLoadError, setVendorLoadError] = useState(false);

  // Services
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoadError, setServicesLoadError] = useState(false);

  // Booking
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);

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

  const avgRating = reviews.length > 0
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  const socialUrl = (key: string, val: string): string | null => {
    if (!val) return null;
    const v = val.trim();
    if (v.startsWith("http")) return v;
    const handle = v.replace(/^@/, "");
    switch (key) {
      case "instagram": return `https://instagram.com/${handle}`;
      case "tiktok": return `https://tiktok.com/@${handle}`;
      case "twitter": return `https://x.com/${handle}`;
      case "facebook": return `https://facebook.com/${handle}`;
      case "website": return `https://${v}`;
      case "phone": return `tel:${v}`;
      default: return v;
    }
  };

  const SOCIALS: { key: string; icon: any; color: string }[] = [
    { key: "instagram", icon: "logo-instagram", color: "#E1306C" },
    { key: "tiktok", icon: "logo-tiktok", color: colors.text },
    { key: "twitter", icon: "logo-twitter", color: "#1DA1F2" },
    { key: "facebook", icon: "logo-facebook", color: "#1877F2" },
    { key: "website", icon: "globe-outline", color: colors.primary },
    { key: "phone", icon: "call-outline", color: colors.success },
  ];

  const renderVendorHeader = () => {
    const contact = vendor?.contact || {};
    const links = SOCIALS.map((s) => ({ ...s, url: socialUrl(s.key, contact[s.key]) })).filter((s) => s.url);
    const hasContent = !!vendor?.description || links.length > 0;
    return (
      <View>
        {vendor && !vendor.verified && (
          <View style={styles.unverifiedBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.unverifiedText}>
              This vendor is not yet verified by OurCityvibe. Proceed with caution.
            </Text>
          </View>
        )}
        {vendorLoadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>Couldn't load vendor info.</Text>
            <TouchableOpacity onPress={reloadVendorAndServices} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {hasContent && (
          <View style={styles.vendorHeaderCard}>
            {!!vendor?.description && <Text style={styles.vendorDescription}>{vendor.description}</Text>}
            {links.length > 0 && (
              <View style={styles.socialRow}>
                {links.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={styles.socialButton}
                    onPress={() => Linking.openURL(s.url as string).catch(() => {})}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={s.icon} size={20} color={s.color} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const reloadVendorAndServices = () => {
    setVendorLoadError(false);
    setServicesLoadError(false);
    setLoading(true);
    fetchVendorServices(vendorId as string)
      .then((data) => setServices(data))
      .catch(() => setServicesLoadError(true))
      .finally(() => setLoading(false));
    fetch(`${BASE_URL}/vendors/${vendorId}`)
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
    fetch(`${BASE_URL}/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((data) => { if (data && data._id) setVendor(data); else setVendorLoadError(true); })
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

  const handleBookService = async () => {
    if (selectedDate <= new Date()) {
      showInfo("Please select a future date and time.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/bookings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendorId,
          serviceId: bookingService?._id,
          preferredDate: selectedDate.toISOString(),
          message: bookingMessage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showSuccess("The vendor will get back to you soon.", "Booking Sent!");
        setBookingService(null);
        setBookingMessage("");
        setSelectedDate(new Date());
      } else {
        showError(data.message || "Failed to send booking request");
      }
    } catch {
      showError("Failed to send booking request");
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case "available": return colors.success;
      case "unavailable": return colors.error;
      case "coming_soon": return colors.warning;
      default: return colors.textSecondary;
    }
  };

  const getAvailabilityText = (availability: string) => {
    switch (availability) {
      case "available": return "Available";
      case "unavailable": return "Unavailable";
      case "coming_soon": return "Coming Soon";
      default: return "Unknown";
    }
  };

  const renderServiceCard = ({ item }: { item: Service }) => (
    <View style={styles.serviceCard}>
      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={styles.serviceImage} />
      )}
      <View style={styles.serviceContent}>
        <View style={styles.serviceHeader}>
          <Text style={styles.serviceName}>{item.name}</Text>
          <View
            style={[
              styles.availabilityBadge,
              { backgroundColor: `${getAvailabilityColor(item.availability)}20` },
            ]}
          >
            <View
              style={[
                styles.availabilityDot,
                { backgroundColor: getAvailabilityColor(item.availability) },
              ]}
            />
            <Text
              style={[
                styles.availabilityText,
                { color: getAvailabilityColor(item.availability) },
              ]}
            >
              {getAvailabilityText(item.availability)}
            </Text>
          </View>
        </View>

        <Text style={styles.serviceDescription} numberOfLines={2}>
          {item.description}
        </Text>

        {item.category && (
          <View style={styles.categoryContainer}>
            <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        <View style={styles.serviceFooter}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Price:</Text>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.priceGradient}
            >
              <Text style={styles.price}>
                {item.currency} {formatPrice(item.price)}
              </Text>
            </LinearGradient>
          </View>

          {item.duration && (
            <View style={styles.durationContainer}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.durationText}>
                {item.duration.value} {item.duration.unit}
              </Text>
            </View>
          )}
        </View>

        {item.features && item.features.length > 0 && (
          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>Features:</Text>
            {item.features.slice(0, 3).map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
            {item.features.length > 3 && (
              <Text style={styles.moreFeatures}>
                +{item.features.length - 3} more features
              </Text>
            )}
          </View>
        )}

        {item.availability === "available" && (
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => setBookingService(item)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bookGradient}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.white} />
              <Text style={styles.bookButtonText}>Book Service</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const ReviewsSection = () => (
    <View style={styles.reviewsSection}>
      <View style={styles.reviewsHeader}>
        <Text style={styles.reviewsTitle}>Reviews ({totalReviews})</Text>
        <TouchableOpacity
          style={styles.rateButton}
          onPress={() => setRatingModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="star-outline" size={16} color={colors.warning} />
          <Text style={styles.rateButtonText}>
            {userReview ? "Edit Rating" : "Rate Vendor"}
          </Text>
        </TouchableOpacity>
      </View>

      {reviewsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : reviews.length === 0 ? (
        <Text style={styles.noReviewsText}>No reviews yet. Be the first!</Text>
      ) : (
        reviews.map((review) => (
          <View key={review._id} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <TouchableOpacity
                style={styles.reviewUser}
                activeOpacity={0.7}
                onPress={() => openUserProfile(review.user._id)}
              >
                {review.user.profilePicture ? (
                  <Image source={{ uri: review.user.profilePicture }} style={styles.reviewAvatar} />
                ) : (
                  <View style={styles.reviewAvatarPlaceholder}>
                    <Text style={styles.reviewAvatarLetter}>
                      {review.user.username?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.reviewUsername}>{review.user.username}</Text>
                  <Text style={styles.reviewTime}>{timeAgo(review.createdAt)}</Text>
                </View>
              </TouchableOpacity>
              <StarRow rating={review.rating} size={14} />
            </View>
            {!!review.review && (
              <Text style={styles.reviewText}>{review.review}</Text>
            )}
          </View>
        ))
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <VendorCardSkeleton count={3} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <GlassBackButton style={styles.backButton} />
          <View style={styles.titleContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.title}>{vendorName || "Vendor Services"}</Text>
              {vendor?.verified && (
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              )}
            </View>
            <Text style={styles.subtitle}>
              {services.length} {services.length === 1 ? "Service" : "Services"} Available
            </Text>
            {totalReviews > 0 && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={styles.ratingText}>{avgRating} ({totalReviews} review{totalReviews !== 1 ? "s" : ""})</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={services}
        keyExtractor={(item) => item._id}
        renderItem={renderServiceCard}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderVendorHeader()}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.emptyIconContainer}
            >
              <Ionicons name="briefcase-outline" size={48} color="white" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No Services Yet</Text>
            <Text style={styles.emptyText}>
              This vendor hasn't posted any services yet. Check back later!
            </Text>
          </View>
        }
        ListFooterComponent={<ReviewsSection />}
      />

      {/* Booking Modal */}
      <Modal
        visible={!!bookingService}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingService(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setBookingService(null)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Service</Text>
              <TouchableOpacity onPress={() => setBookingService(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalServiceName}>{bookingService?.name}</Text>

            <Text style={styles.inputLabel}>Preferred Date & Time</Text>
            <DateTimeDropdown
              value={selectedDate}
              onChange={setSelectedDate}
              minimumDate={new Date()}
            />

            <Text style={styles.inputLabel}>Message (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Any special requests or details..."
              placeholderTextColor={colors.textMuted}
              value={bookingMessage}
              onChangeText={setBookingMessage}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleBookService}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                <Text style={styles.submitText}>
                  {submitting ? "Sending..." : "Send Booking Request"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                {userReview ? "Edit Rating" : "Rate Vendor"}
              </Text>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalServiceName}>{vendorName}</Text>

            <Text style={styles.inputLabel}>Your Rating</Text>
            <View style={styles.starSelector}>
              <StarRow rating={selectedRating} size={36} onPress={setSelectedRating} />
            </View>

            <Text style={styles.inputLabel}>Review (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Share your experience..."
              placeholderTextColor={colors.textMuted}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              numberOfLines={4}
              maxLength={500}
            />

            <TouchableOpacity
              style={[styles.submitButton, selectedRating === 0 && styles.submitButtonDisabled]}
              onPress={handleSubmitRating}
              disabled={submittingRating || selectedRating === 0}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.warning, "#d97706"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {submittingRating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Submit Rating</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: c.warning,
  },
  listContent: {
    padding: 16,
    // iOS gets its bottom clearance from the automatic content inset; Android
    // keeps the old fixed padding for the system nav area.
    paddingBottom: Platform.OS === "ios" ? 24 : 100,
  },
  serviceCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  serviceImage: {
    width: "100%",
    height: 200,
    backgroundColor: c.border,
  },
  serviceContent: {
    padding: 16,
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: c.text,
    flex: 1,
    marginRight: 12,
  },
  availabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  availabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  availabilityText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  categoryContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginLeft: 6,
  },
  serviceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginRight: 8,
  },
  priceGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  price: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginLeft: 6,
  },
  featuresContainer: {
    backgroundColor: c.background,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  featuresTitle: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.text,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  featureText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textBody,
    marginLeft: 8,
    flex: 1,
  },
  moreFeatures: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.primary,
    marginTop: 4,
    marginLeft: 22,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  bookButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 12,
  },
  bookGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  bookButtonText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: c.white,
  },
  unverifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  unverifiedText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.warning,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.error,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.error,
  },
  vendorHeaderCard: {
    backgroundColor: c.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  vendorDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textTertiary,
    lineHeight: 20,
    marginBottom: 12,
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  // Reviews section
  reviewsSection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  reviewsTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  rateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,158,11,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  rateButtonText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.warning,
  },
  noReviewsText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },
  reviewCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  reviewUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.border,
  },
  reviewAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewAvatarLetter: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  reviewUsername: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.text,
  },
  reviewTime: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    marginTop: 1,
  },
  reviewText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    lineHeight: 20,
  },
  // Rating modal specifics
  starSelector: {
    alignItems: "center",
    paddingVertical: 16,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: c.modalOverlay,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  modalServiceName: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: c.primary,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.borderMuted,
  },
  modalTextArea: {
    height: 100,
    textAlignVertical: "top",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.borderMuted,
  },
  datePickerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.text,
  },
  submitButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: c.text,
  },
});
