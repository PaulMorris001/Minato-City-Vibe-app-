import React, { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Service } from "@/libs/interfaces";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";

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
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onPress?.(star)} disabled={!onPress} activeOpacity={0.7}>
          <Ionicons
            name={star <= rating ? "star" : "star-outline"}
            size={size}
            color={star <= rating ? "#f59e0b" : "#4b5563"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function VendorDetails() {
  const { vendorId, vendorName } = useLocalSearchParams();
  const router = useRouter();
  const formatPrice = useFormatPrice();

  // Services
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
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

  useEffect(() => {
    const loadServices = async () => {
      try {
        const data = await fetchVendorServices(vendorId as string);
        setServices(data);
      } catch (error) {
        console.error("Error loading services:", error);
      } finally {
        setLoading(false);
      }
    };
    loadServices();
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
      Alert.alert("Error", "Please select a star rating");
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
        Alert.alert("Thanks!", "Your rating has been saved.");
        setRatingModalVisible(false);
        fetchReviews();
      } else {
        Alert.alert("Error", data.message || "Failed to submit rating");
      }
    } catch {
      Alert.alert("Error", "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && date) {
        const updated = new Date(date);
        updated.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        setSelectedDate(updated);
        setShowTimePicker(true);
      }
    } else {
      if (date) setSelectedDate(date);
    }
  };

  const onTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(false);
    if (event.type === "set" && date) setSelectedDate(date);
  };

  const formatSelectedDate = (date: Date) =>
    date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const handleBookService = async () => {
    if (selectedDate <= new Date()) {
      Alert.alert("Error", "Please select a future date and time");
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
        Alert.alert("Booking Sent!", "The vendor will get back to you soon.");
        setBookingService(null);
        setBookingMessage("");
        setSelectedDate(new Date());
      } else {
        Alert.alert("Error", data.message || "Failed to send booking request");
      }
    } catch {
      Alert.alert("Error", "Failed to send booking request");
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case "available": return "#22c55e";
      case "unavailable": return "#ef4444";
      case "coming_soon": return "#f59e0b";
      default: return "#9ca3af";
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
            <Ionicons name="pricetag-outline" size={14} color="#9ca3af" />
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        <View style={styles.serviceFooter}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Price:</Text>
            <LinearGradient
              colors={["#a855f7", "#7c3aed"]}
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
              <Ionicons name="time-outline" size={16} color="#9ca3af" />
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
                <Ionicons name="checkmark-circle" size={14} color="#a855f7" />
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
              colors={["#a855f7", "#7c3aed"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bookGradient}
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
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
          <Ionicons name="star-outline" size={16} color="#f59e0b" />
          <Text style={styles.rateButtonText}>
            {userReview ? "Edit Rating" : "Rate Vendor"}
          </Text>
        </TouchableOpacity>
      </View>

      {reviewsLoading ? (
        <ActivityIndicator color="#a855f7" style={{ marginVertical: 16 }} />
      ) : reviews.length === 0 ? (
        <Text style={styles.noReviewsText}>No reviews yet. Be the first!</Text>
      ) : (
        reviews.map((review) => (
          <View key={review._id} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <View style={styles.reviewUser}>
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
              </View>
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
        colors={["#1a1a2e", "#16213e"]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{vendorName || "Vendor Services"}</Text>
            <Text style={styles.subtitle}>
              {services.length} {services.length === 1 ? "Service" : "Services"} Available
            </Text>
            {totalReviews > 0 && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#f59e0b" />
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
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={["#a855f7", "#7c3aed"]}
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
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color="#a855f7" />
              <Text style={styles.datePickerText}>{formatSelectedDate(selectedDate)}</Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </TouchableOpacity>

            {showDatePicker && Platform.OS === "ios" && (
              <DateTimePicker
                value={selectedDate}
                mode="datetime"
                display="spinner"
                onChange={onDateChange}
                minimumDate={new Date()}
                themeVariant="dark"
              />
            )}
            {showDatePicker && Platform.OS === "android" && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}
            {showTimePicker && Platform.OS === "android" && (
              <DateTimePicker
                value={selectedDate}
                mode="time"
                onChange={onTimeChange}
                is24Hour={false}
              />
            )}

            <Text style={styles.inputLabel}>Message (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Any special requests or details..."
              placeholderTextColor="#6b7280"
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
                colors={["#a855f7", "#7c3aed"]}
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
              placeholderTextColor="#6b7280"
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
                colors={["#f59e0b", "#d97706"]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.darkBackground,
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
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
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
    color: "#f59e0b",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  serviceCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#374151",
  },
  serviceImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#374151",
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
    color: "#fff",
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
    color: "#9ca3af",
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
    color: "#9ca3af",
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
    color: "#9ca3af",
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
    color: "white",
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginLeft: 6,
  },
  featuresContainer: {
    backgroundColor: "#0f0f1a",
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  featuresTitle: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fff",
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
    color: "#e5e7eb",
    marginLeft: 8,
    flex: 1,
  },
  moreFeatures: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#a855f7",
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
    color: "#fff",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
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
    color: "#fff",
  },
  // Reviews section
  reviewsSection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#374151",
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
    color: "#fff",
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
    color: "#f59e0b",
  },
  noReviewsText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 24,
  },
  reviewCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#374151",
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
    backgroundColor: "#374151",
  },
  reviewAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  reviewAvatarLetter: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  reviewUsername: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  reviewTime: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 1,
  },
  reviewText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
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
    color: "#fff",
  },
  modalServiceName: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: "#a855f7",
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  modalTextArea: {
    height: 100,
    textAlignVertical: "top",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  datePickerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
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
    color: "#fff",
  },
});
