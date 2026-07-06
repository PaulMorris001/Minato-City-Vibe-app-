import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { Colors } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { DateTimeDropdown, ImagePickerButton, LocationPicker, MultiImagePicker } from "@/components/shared";
import { uploadImage, resolveImageUrls } from "@/utils/imageUpload";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import { LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";

interface CreateEventModalProps {
  visible: boolean;
  onClose: () => void;
  onEventCreated?: () => void;
}

export default function CreateEventModal({
  visible,
  onClose,
  onEventCreated,
}: CreateEventModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [eventLocation, setEventLocation] = useState<LocationSelection | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    date: "",
    location: "",
    address: "",
    description: "",
    isPublic: false,
    isPaid: false,
    ticketPrice: "",
    maxGuests: "",
  });
  const [eventImages, setEventImages] = useState<string[]>([]);
  const [venueProofImage, setVenueProofImage] = useState("");

  useEffect(() => {
    if (visible) {
      loadVerificationStatus();
    }
  }, [visible]);

  const loadVerificationStatus = async () => {
    try {
      // Check SecureStore first for a fast path
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        if (typeof u.verified === "boolean") {
          setIsVerified(u.verified);
          return;
        }
      }
      // Fall back to profile API
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setIsVerified(data.user?.verified ?? data.vendor?.verified ?? false);
      }
    } catch {}
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateEvent = async () => {
    // Validation
    if (!formData.title.trim()) {
      Alert.alert("Validation Error", "Please enter an event title");
      return;
    }
    if (!formData.date) {
      Alert.alert("Validation Error", "Please select an event date and time");
      return;
    }
    if (!eventLocation?.city || !eventLocation?.state) {
      Alert.alert("Validation Error", "Please select your country, state, and city");
      return;
    }

    if (formData.isPublic && formData.isPaid) {
      if (!formData.ticketPrice || parseFloat(formData.ticketPrice) <= 0) {
        Alert.alert("Validation Error", "Please enter a valid ticket price");
        return;
      }
      if (!formData.maxGuests || parseInt(formData.maxGuests) <= 0) {
        Alert.alert("Validation Error", "Please enter maximum number of guests");
        return;
      }
      if (!venueProofImage) {
        Alert.alert(
          "Venue proof required",
          "Upload a photo of your venue booking — confirmation email, signed contract, or reservation screenshot."
        );
        return;
      }
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Error", "Authentication token not found");
        return;
      }

      let eventImageUrls: string[] = [];
      let venueProofUrl = "";

      // Upload any newly-picked event photos to Cloudinary
      if (eventImages.length > 0) {
        try {
          eventImageUrls = await resolveImageUrls(eventImages, "events", token);
        } catch (uploadError) {
          console.error("Error uploading event images:", uploadError);
          Alert.alert("Upload Error", "Failed to upload event photos");
          setLoading(false);
          return;
        }
      }

      // Upload venue proof for paid events
      if (formData.isPublic && formData.isPaid && venueProofImage) {
        if (venueProofImage.startsWith("file://")) {
          try {
            const result = await uploadImage(venueProofImage, "venue-proofs", token);
            venueProofUrl = result.url;
          } catch (uploadError) {
            console.error("Error uploading venue proof:", uploadError);
            Alert.alert("Upload Error", "Failed to upload venue proof image");
            setLoading(false);
            return;
          }
        } else {
          venueProofUrl = venueProofImage;
        }
      }

      // Create event
      const eventData = {
        title: formData.title.trim(),
        date: formData.date.trim(),
        location: formatLocation(eventLocation),
        address: formData.address.trim(),
        city: eventLocation.city,
        state: eventLocation.state,
        country: eventLocation.country,
        description: formData.description.trim(),
        images: eventImageUrls,
        isPublic: formData.isPublic,
        isPaid: formData.isPaid,
        ticketPrice: formData.isPaid ? parseFloat(formData.ticketPrice) : 0,
        maxGuests: formData.isPaid ? parseInt(formData.maxGuests) : 0,
        venueProofImage: venueProofUrl,
      };

      await axios.post(`${BASE_URL}/events`, eventData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Alert.alert("Success", "Event created successfully!");

      // Reset form
      setFormData({
        title: "",
        date: "",
        location: "",
        address: "",
        description: "",
        isPublic: false,
        isPaid: false,
        ticketPrice: "",
        maxGuests: "",
      });
      setEventImages([]);
      setVenueProofImage("");
      setEventLocation(null);

      // Callback and close
      if (onEventCreated) onEventCreated();
      onClose();
    } catch (error: any) {
      console.error("Error creating event:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to create event";
      if (/verif/i.test(errorMessage)) {
        Alert.alert("Verification required", errorMessage, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Get Verified",
            onPress: () => {
              onClose();
              router.push("/settings" as any);
            },
          },
        ]);
      } else {
        Alert.alert("Error", errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };
  
  

  const isSubmitEnabled = !!formData.title.trim() && !!formData.date && !!eventLocation?.city;

  const quickDates = [
    { label: "Tonight", offset: 0 },
    { label: "Tomorrow", offset: 1 },
    { label: "This Wknd", offset: 2 },
  ];

  const applyQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(22, 0, 0, 0);
    setFormData((prev) => ({ ...prev, date: d.toISOString() }));
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <LinearGradient colors={["#1A0F35", "#0B0613"]} style={styles.modalContainer}>
            {/* Grabber */}
            <View style={styles.grabber} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 140 }}
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.modalTitle}>Create event</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={20} color="rgba(244,238,255,0.7)" />
                </TouchableOpacity>
              </View>

              {/* Event Photos */}
              <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                <MultiImagePicker
                  value={eventImages}
                  onChange={setEventImages}
                  label="Event photos"
                  max={6}
                />
              </View>

              {/* Event Title */}
              <Text style={styles.label}>Event name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Give it a name..."
                placeholderTextColor="rgba(244,238,255,0.3)"
                value={formData.title}
                onChangeText={(value) => handleInputChange("title", value)}
              />

              {/* Quick Date Pills */}
              <Text style={styles.label}>When *</Text>
              <View style={styles.quickDatesRow}>
                {quickDates.map((qd) => {
                  const active = qd.offset !== -1 && formData.date && (() => {
                    const target = new Date();
                    target.setDate(target.getDate() + qd.offset);
                    const selected = new Date(formData.date);
                    return selected.toDateString() === target.toDateString();
                  })();
                  return (
                    <TouchableOpacity
                      key={qd.label}
                      style={[styles.quickDatePill, active && styles.quickDatePillActive]}
                      onPress={() => applyQuickDate(qd.offset)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.quickDateText, active && styles.quickDateTextActive]}>{qd.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                <DateTimeDropdown
                  value={formData.date ? new Date(formData.date) : null}
                  onChange={(d) =>
                    setFormData((prev) => ({ ...prev, date: d.toISOString() }))
                  }
                  minimumDate={new Date()}
                  defaultHour={22}
                />
              </View>

              {/* Address — precise venue / street so guests know exactly where */}
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 123 Main St, Rooftop Lounge"
                placeholderTextColor="rgba(244,238,255,0.3)"
                value={formData.address}
                onChangeText={(value) => handleInputChange("address", value)}
              />

              {/* Location (Country → State → City) */}
              <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
                <LocationPicker
                  value={eventLocation ?? undefined}
                  onChange={setEventLocation}
                  label="Location"
                  required
                />
              </View>

              {/* Description */}
              <Text style={styles.label}>The vibe</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="What's the mood? Any details..."
                placeholderTextColor="rgba(244,238,255,0.3)"
                multiline
                numberOfLines={4}
                value={formData.description}
                onChangeText={(value) => handleInputChange("description", value)}
              />

              {/* Who can join — visibility toggle */}
              <Text style={styles.label}>Who can join</Text>
              <View style={styles.visibilityRow}>
                <TouchableOpacity
                  style={[styles.visibilityCard, !formData.isPublic && styles.visibilityCardActive]}
                  onPress={() => handleInputChange("isPublic", false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>🔒</Text>
                  <Text style={[styles.visibilityLabel, !formData.isPublic && styles.visibilityLabelActive]}>Private</Text>
                  <Text style={styles.visibilityHint}>Invite only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.visibilityCard,
                    formData.isPublic && styles.visibilityCardActive,
                    !isVerified && styles.visibilityCardDisabled,
                  ]}
                  onPress={() => {
                    if (!isVerified) {
                      Alert.alert(
                        "Verification required",
                        "Only verified users can create public events.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Get Verified",
                            onPress: () => {
                              onClose();
                              router.push("/settings" as any);
                            },
                          },
                        ]
                      );
                      return;
                    }
                    handleInputChange("isPublic", true);
                  }}
                  activeOpacity={isVerified ? 0.8 : 1}
                >
                  <View style={styles.visibilityPublicTop}>
                    <Text style={styles.visibilityEmoji}>🌐</Text>
                    {!isVerified && (
                      <Ionicons name="lock-closed" size={13} color="rgba(244,238,255,0.3)" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text style={[
                    styles.visibilityLabel,
                    formData.isPublic && styles.visibilityLabelActive,
                    !isVerified && styles.visibilityLabelDisabled,
                  ]}>Public</Text>
                  <Text style={[styles.visibilityHint, !isVerified && styles.visibilityHintDisabled]}>
                    {isVerified ? "Open to all" : "Verified only"}
                  </Text>
                </TouchableOpacity>
              </View>

              {!isVerified && (
                <TouchableOpacity
                  style={styles.verifyLinkRow}
                  onPress={() => {
                    onClose();
                    router.push("/settings" as any);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield-checkmark-outline" size={15} color="#A855F7" />
                  <Text style={styles.verifyLinkText}>
                    Get verified to host public events →
                  </Text>
                </TouchableOpacity>
              )}

              {/* Sell tickets (only if public) */}
              {formData.isPublic && (
                <>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => handleInputChange("isPaid", !formData.isPaid)}
                  >
                    <View style={[styles.checkbox, formData.isPaid && styles.checkboxChecked]}>
                      {formData.isPaid && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Sell tickets 🎟️</Text>
                  </TouchableOpacity>

                  {formData.isPaid && (
                    <>
                      <Text style={styles.label}>Ticket Price ($) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 25.00"
                        placeholderTextColor="rgba(244,238,255,0.3)"
                        keyboardType="decimal-pad"
                        value={formData.ticketPrice}
                        onChangeText={(value) => handleInputChange("ticketPrice", value)}
                      />
                      <Text style={styles.label}>Max Guests *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 100"
                        placeholderTextColor="rgba(244,238,255,0.3)"
                        keyboardType="number-pad"
                        value={formData.maxGuests}
                        onChangeText={(value) => handleInputChange("maxGuests", value)}
                      />

                      <Text style={styles.label}>Venue Proof *</Text>
                      <Text
                        style={{
                          color: "rgba(244,238,255,0.55)",
                          fontSize: 12,
                          marginBottom: 8,
                          lineHeight: 16,
                        }}
                      >
                        Upload a photo of your venue booking — confirmation email,
                        signed contract, or reservation screenshot. Admins review
                        this before your event goes on sale.
                      </Text>
                      <ImagePickerButton
                        imageUri={venueProofImage}
                        onImageSelected={setVenueProofImage}
                        label="Booking / Contract"
                        size={120}
                        shape="square"
                      />
                    </>
                  )}
                </>
              )}
            </ScrollView>

            {/* Sticky footer */}
            <View style={styles.stickyFooter}>
              <TouchableOpacity
                style={[styles.createButton, !isSubmitEnabled && styles.createButtonDisabled]}
                onPress={handleCreateEvent}
                disabled={loading || !isSubmitEnabled}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={isSubmitEnabled ? ["#A855F7", "#7C3AED"] : ["#2D1B69", "#1A1030"]}
                  style={styles.createButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.createButtonText}>
                      {isSubmitEnabled ? "Create event →" : "Add name, date & place"}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    height: "92%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    padding: 0,
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(244,238,255,0.2)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: scaleFontSize(22),
    color: "#F4EEFF",
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "rgba(244,238,255,0.64)",
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#F4EEFF",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 4,
  },
  quickDatesRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  quickDatePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  quickDatePillActive: {
    backgroundColor: "#A855F7",
    borderColor: "#A855F7",
  },
  quickDateText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "rgba(244,238,255,0.64)",
  },
  quickDateTextActive: {
    color: "#fff",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 4,
    marginHorizontal: 20,
  },
  datePickerText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#F4EEFF",
  },
  multilineInput: {
    height: 90,
    textAlignVertical: "top",
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },
  visibilityCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 4,
  },
  visibilityCardActive: {
    borderColor: "#A855F7",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  visibilityCardDisabled: {
    opacity: 0.45,
  },
  visibilityPublicTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  visibilityEmoji: {
    fontSize: 22,
  },
  visibilityLabel: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "rgba(244,238,255,0.5)",
  },
  visibilityLabelActive: {
    color: "#A855F7",
  },
  visibilityLabelDisabled: {
    color: "rgba(244,238,255,0.3)",
  },
  visibilityHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "rgba(244,238,255,0.35)",
  },
  visibilityHintDisabled: {
    color: "rgba(244,238,255,0.2)",
  },
  verifyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  verifyLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#A855F7",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
  checkboxLabel: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.medium,
    color: "#F4EEFF",
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "rgba(244,238,255,0.42)",
    marginTop: 4,
  },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: "rgba(11,6,19,0.85)",
  },
  createButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    letterSpacing: -0.2,
  },
});
