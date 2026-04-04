import React, { useEffect, useState } from "react";
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
} from "react-native";
import { Service } from "@/libs/interfaces";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";

export default function VendorDetails() {
  const { vendorId, vendorName } = useLocalSearchParams();
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
  }, [vendorId]);

  const handleBookService = async () => {
    if (!bookingDate.trim()) {
      Alert.alert("Error", "Please enter your preferred date");
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
          preferredDate: bookingDate,
          message: bookingMessage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Booking Sent!", "The vendor will get back to you soon.");
        setBookingService(null);
        setBookingMessage("");
        setBookingDate("");
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
      case "available":
        return "#22c55e";
      case "unavailable":
        return "#ef4444";
      case "coming_soon":
        return "#f59e0b";
      default:
        return "#9ca3af";
    }
  };

  const getAvailabilityText = (availability: string) => {
    switch (availability) {
      case "available":
        return "Available";
      case "unavailable":
        return "Unavailable";
      case "coming_soon":
        return "Coming Soon";
      default:
        return "Unknown";
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
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Dec 25, 2025 at 7pm"
              placeholderTextColor="#6b7280"
              value={bookingDate}
              onChangeText={setBookingDate}
            />

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
  loadingText: {
    color: "#9ca3af",
    fontSize: 16,
    fontFamily: Fonts.regular,
    marginTop: 12,
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
  submitButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
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
