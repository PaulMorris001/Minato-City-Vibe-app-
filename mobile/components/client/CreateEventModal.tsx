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
import { Fonts } from "@/constants/fonts";
import { DateTimeDropdown, ImagePickerButton, LocationPicker, MultiImagePicker } from "@/components/shared";
import { uploadImage, resolveImageUrls } from "@/utils/imageUpload";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import { LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";
import { currencyPrefix, sellingCurrencyForCountry } from "@/constants/payments";

import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
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
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [eventLocation, setEventLocation] = useState<LocationSelection | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  // The currency this organizer sells in (NGN for Nigerian accounts, USD
  // otherwise) — display only; the server independently derives and enforces it.
  const [sellerCurrency, setSellerCurrency] = useState("USD");

  const [formData, setFormData] = useState({
    title: "",
    date: "",
    location: "",
    address: "",
    description: "",
    isVirtual: false,
    meetingLink: "",
    isPublic: false,
    isPaid: false,
    ticketPrice: "",
    maxGuests: "",
  });
  const [eventImages, setEventImages] = useState<string[]>([]);
  const [venueProofImage, setVenueProofImage] = useState("");
  // Named ticket tiers (optional, max 10). While empty, the single Ticket
  // Price field is used instead. Prices are in the organizer's currency.
  // `quantity` is the optional per-tier allocation — set it on every tier to cap
  // each one separately (capacity then = the sum), or leave blank to share one
  // overall Max Guests pool.
  const [tiers, setTiers] = useState<{ name: string; price: string; quantity: string }[]>([]);
  const MAX_TIERS = 10;

  useEffect(() => {
    if (visible) {
      loadVerificationStatus();
    }
  }, [visible]);

  const loadVerificationStatus = async () => {
    try {
      // Fast path from the cached user (it has no location, so the currency
      // comes from the profile fetch below).
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        if (typeof u.verified === "boolean") setIsVerified(u.verified);
      }
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setIsVerified(data.user?.verified ?? data.vendor?.verified ?? false);
        setSellerCurrency(sellingCurrencyForCountry(data.user?.location?.country));
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
    if (!formData.isVirtual && (!eventLocation?.city || !eventLocation?.state)) {
      Alert.alert("Validation Error", "Please select your country, state, and city");
      return;
    }
    if (formData.isVirtual && formData.meetingLink.trim() && !/^https?:\/\//i.test(formData.meetingLink.trim())) {
      Alert.alert("Validation Error", "Event link must start with http:// or https://");
      return;
    }

    if (formData.isPublic && formData.isPaid) {
      if (tiers.length > 0) {
        if (tiers.some((t) => !t.name.trim())) {
          Alert.alert("Validation Error", "Every ticket tier needs a name");
          return;
        }
        const names = new Set(tiers.map((t) => t.name.trim().toLowerCase()));
        if (names.size !== tiers.length) {
          Alert.alert("Validation Error", "Tier names must be unique");
          return;
        }
        if (tiers.some((t) => !t.price || parseFloat(t.price) <= 0)) {
          Alert.alert("Validation Error", "Every ticket tier needs a price greater than 0");
          return;
        }
        // Per-tier quantity is all-or-nothing: either every tier has one (and
        // capacity = their sum) or none do (and the shared Max Guests governs).
        const withQty = tiers.filter((t) => t.quantity.trim() !== "");
        if (withQty.length > 0) {
          if (withQty.length !== tiers.length) {
            Alert.alert("Validation Error", "Set a quantity for every tier, or leave them all blank");
            return;
          }
          if (tiers.some((t) => !/^\d+$/.test(t.quantity.trim()) || parseInt(t.quantity) <= 0)) {
            Alert.alert("Validation Error", "Every tier quantity must be a whole number greater than 0");
            return;
          }
        }
      } else if (!formData.ticketPrice || parseFloat(formData.ticketPrice) <= 0) {
        Alert.alert("Validation Error", "Please enter a valid ticket price");
        return;
      }
      // Max Guests is required unless per-tier quantities were set (capacity is
      // then the sum of them, computed server-side).
      const tiersHaveQty = tiers.length > 0 && tiers.every((t) => t.quantity.trim() !== "");
      if (!tiersHaveQty && (!formData.maxGuests || parseInt(formData.maxGuests) <= 0)) {
        Alert.alert("Validation Error", "Please enter maximum number of guests");
        return;
      }
      if (!venueProofImage && !formData.isVirtual) {
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
        location: formData.isVirtual ? "Online" : formatLocation(eventLocation!),
        address: formData.isVirtual ? "" : formData.address.trim(),
        city: formData.isVirtual ? "" : eventLocation!.city,
        state: formData.isVirtual ? "" : eventLocation!.state,
        country: formData.isVirtual ? "" : eventLocation!.country,
        isVirtual: formData.isVirtual,
        meetingLink: formData.isVirtual ? formData.meetingLink.trim() : "",
        description: formData.description.trim(),
        images: eventImageUrls,
        isPublic: formData.isPublic,
        isPaid: formData.isPaid,
        // With tiers, the server derives the headline price (cheapest tier).
        ticketPrice:
          formData.isPaid && tiers.length === 0 ? parseFloat(formData.ticketPrice) : 0,
        ticketTiers:
          formData.isPaid && tiers.length > 0
            ? tiers.map((t) => ({
                name: t.name.trim(),
                price: parseFloat(t.price),
                // Only send quantity when the organizer set one on every tier.
                ...(t.quantity.trim() !== "" ? { quantity: parseInt(t.quantity) } : {}),
              }))
            : undefined,
        // Explicit so the server can reject a stale/mismatched currency
        // instead of silently repricing (it derives the same value itself).
        currency: formData.isPaid ? sellerCurrency : undefined,
        // When tiers carry quantities the server derives capacity from their sum,
        // so a blank Max Guests is fine (send 0 and let the server compute).
        maxGuests: formData.isPaid && formData.maxGuests ? parseInt(formData.maxGuests) : 0,
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
        isVirtual: false,
        meetingLink: "",
        isPublic: false,
        isPaid: false,
        ticketPrice: "",
        maxGuests: "",
      });
      setEventImages([]);
      setVenueProofImage("");
      setEventLocation(null);
      setTiers([]);

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
  
  

  const isSubmitEnabled =
    !!formData.title.trim() && !!formData.date && (formData.isVirtual || !!eventLocation?.city);

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
          <LinearGradient
            colors={isDark ? ["#1A0F35", colors.backgroundDeep] : [colors.background, colors.backgroundDeep]}
            style={styles.modalContainer}
          >
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
                  <Ionicons name="close" size={20} color={colors.textDim} />
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
                placeholderTextColor={colors.textGhost}
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

              {/* Where is it held — in person vs virtual */}
              <Text style={styles.label}>Where is it held</Text>
              <View style={styles.visibilityRow}>
                <TouchableOpacity
                  style={[styles.visibilityCard, !formData.isVirtual && styles.visibilityCardActive]}
                  onPress={() => handleInputChange("isVirtual", false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>📍</Text>
                  <Text style={[styles.visibilityLabel, !formData.isVirtual && styles.visibilityLabelActive]}>In person</Text>
                  <Text style={styles.visibilityHint}>Physical venue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visibilityCard, formData.isVirtual && styles.visibilityCardActive]}
                  onPress={() => handleInputChange("isVirtual", true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>🎥</Text>
                  <Text style={[styles.visibilityLabel, formData.isVirtual && styles.visibilityLabelActive]}>Virtual</Text>
                  <Text style={styles.visibilityHint}>Online event</Text>
                </TouchableOpacity>
              </View>

              {formData.isVirtual ? (
                <>
                  {/* Meeting URL — optional, shared with attendees only */}
                  <Text style={styles.label}>Event link</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://zoom.us/j/... (optional)"
                    placeholderTextColor={colors.textGhost}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={formData.meetingLink}
                    onChangeText={(value) => handleInputChange("meetingLink", value)}
                  />
                </>
              ) : (
                <>
                  {/* Address — precise venue / street so guests know exactly where */}
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 123 Main St, Rooftop Lounge"
                    placeholderTextColor={colors.textGhost}
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
                </>
              )}

              {/* Description */}
              <Text style={styles.label}>The vibe</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="What's the mood? Any details..."
                placeholderTextColor={colors.textGhost}
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
                      <Ionicons name="lock-closed" size={13} color={colors.textGhost} style={{ marginLeft: 4 }} />
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
                  <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
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
                      {tiers.length === 0 ? (
                        <>
                          <Text style={styles.label}>
                            Ticket Price ({currencyPrefix(sellerCurrency).trim()}) *
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder={sellerCurrency === "NGN" ? "e.g., 15000" : "e.g., 25.00"}
                            placeholderTextColor={colors.textGhost}
                            keyboardType="decimal-pad"
                            value={formData.ticketPrice}
                            onChangeText={(value) => handleInputChange("ticketPrice", value)}
                          />
                        </>
                      ) : (
                        <>
                          <Text style={styles.label}>
                            Ticket Tiers ({currencyPrefix(sellerCurrency).trim()}) *
                          </Text>
                          <Text style={styles.tierHint}>
                            Name each tier whatever you like — Basic, Premium, VIP, Table
                            for 6 — set its price, and (optionally) how many of that tier
                            are available. Buyers pick a tier at checkout.
                          </Text>
                          {tiers.map((tier, idx) => (
                            <View key={idx} style={{ marginBottom: 10 }}>
                              <View style={styles.tierRow}>
                                <TextInput
                                  style={[styles.input, styles.tierNameInput]}
                                  placeholder={`Tier ${idx + 1} name`}
                                  placeholderTextColor={colors.textGhost}
                                  maxLength={40}
                                  value={tier.name}
                                  onChangeText={(v) =>
                                    setTiers((prev) =>
                                      prev.map((t, i) => (i === idx ? { ...t, name: v } : t))
                                    )
                                  }
                                />
                                <TouchableOpacity
                                  style={styles.tierRemoveBtn}
                                  onPress={() =>
                                    setTiers((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="close-circle" size={22} color={colors.error} />
                                </TouchableOpacity>
                              </View>
                              <View style={[styles.tierRow, { marginTop: 6 }]}>
                                <TextInput
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder={sellerCurrency === "NGN" ? "Price 15000" : "Price 25.00"}
                                  placeholderTextColor={colors.textGhost}
                                  keyboardType="decimal-pad"
                                  value={tier.price}
                                  onChangeText={(v) =>
                                    setTiers((prev) =>
                                      prev.map((t, i) => (i === idx ? { ...t, price: v } : t))
                                    )
                                  }
                                />
                                <TextInput
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder="Qty (optional)"
                                  placeholderTextColor={colors.textGhost}
                                  keyboardType="number-pad"
                                  value={tier.quantity}
                                  onChangeText={(v) =>
                                    setTiers((prev) =>
                                      prev.map((t, i) => (i === idx ? { ...t, quantity: v } : t))
                                    )
                                  }
                                />
                              </View>
                            </View>
                          ))}
                        </>
                      )}

                      {tiers.length < MAX_TIERS && (
                        <TouchableOpacity
                          style={styles.addTierBtn}
                          onPress={() =>
                            setTiers((prev) =>
                              prev.length === 0
                                ? [
                                    // Seed from the single price so nothing typed is lost.
                                    {
                                      name: "General",
                                      price: formData.ticketPrice || "",
                                      quantity: "",
                                    },
                                    { name: "", price: "", quantity: "" },
                                  ]
                                : [...prev, { name: "", price: "", quantity: "" }]
                            )
                          }
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                          <Text style={styles.addTierText}>
                            {tiers.length === 0
                              ? "Add ticket tiers (Basic, VIP, …)"
                              : `Add another tier (${tiers.length}/${MAX_TIERS})`}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {tiers.length > 0 && tiers.every((t) => t.quantity.trim() !== "") ? (
                        <>
                          <Text style={styles.label}>Total Capacity</Text>
                          <Text style={styles.tierHint}>
                            {tiers.reduce((sum, t) => sum + (parseInt(t.quantity) || 0), 0)} tickets
                            {" "}— the sum of your tier quantities.
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.label}>Max Guests *</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g., 100"
                            placeholderTextColor={colors.textGhost}
                            keyboardType="number-pad"
                            value={formData.maxGuests}
                            onChangeText={(value) => handleInputChange("maxGuests", value)}
                          />
                        </>
                      )}

                      {!formData.isVirtual && (
                        <>
                          <Text style={styles.label}>Venue Proof *</Text>
                          <Text
                            style={{
                              color: colors.textDim,
                              fontSize: 12,
                              marginBottom: 8,
                              lineHeight: 16,
                              paddingHorizontal: 20,
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
                </>
              )}
            </ScrollView>

            {/* Sticky footer */}
            <View
              style={[
                styles.stickyFooter,
                { backgroundColor: isDark ? "rgba(11,6,19,0.85)" : "rgba(247,245,251,0.94)" },
              ]}
            >
              <TouchableOpacity
                style={[styles.createButton, !isSubmitEnabled && styles.createButtonDisabled]}
                onPress={handleCreateEvent}
                disabled={loading || !isSubmitEnabled}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={isSubmitEnabled ? [colors.primary, colors.primaryDark] : [colors.cardGradientStart, colors.cardGradientEnd]}
                  style={styles.createButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.createButtonText}>
                      {isSubmitEnabled
                        ? "Create event →"
                        : formData.isVirtual
                          ? "Add name & date"
                          : "Add name, date & place"}
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

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: c.modalOverlay,
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
    backgroundColor: c.glassStrokeStrong,
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
    color: c.textBright,
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.glassFill,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: c.textDim,
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: c.glassStroke,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: c.textBright,
    backgroundColor: c.glassFillSubtle,
    marginBottom: 4,
  },
  // ── Ticket tier editor ──
  tierHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: c.textDim,
    lineHeight: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingRight: 20,
  },
  tierNameInput: {
    flex: 1,
    marginHorizontal: 0,
    marginLeft: 20,
    marginBottom: 0,
  },
  tierPriceInput: {
    width: 110,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  tierRemoveBtn: {
    padding: 2,
  },
  addTierBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  addTierText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: c.primary,
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
    borderColor: c.glassStroke,
    backgroundColor: c.glassFillSubtle,
  },
  quickDatePillActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  quickDateText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: c.textDim,
  },
  quickDateTextActive: {
    color: c.white,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: c.glassStroke,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: c.glassFillSubtle,
    marginBottom: 4,
    marginHorizontal: 20,
  },
  datePickerText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: c.textBright,
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
    borderColor: c.glassStroke,
    borderRadius: 16,
    padding: 14,
    backgroundColor: c.glassFillSubtle,
    alignItems: "center",
    gap: 4,
  },
  visibilityCardActive: {
    borderColor: c.primary,
    backgroundColor: c.primaryFaded,
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
    color: c.textFaint,
  },
  visibilityLabelActive: {
    color: c.primary,
  },
  visibilityLabelDisabled: {
    color: c.textGhost,
  },
  visibilityHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: c.textGhost,
  },
  visibilityHintDisabled: {
    color: c.textGhost,
    opacity: 0.7,
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
    color: c.primary,
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
    borderColor: c.glassStrokeStrong,
    backgroundColor: c.glassFillSubtle,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  checkmark: {
    color: c.white,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
  checkboxLabel: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.medium,
    color: c.textBright,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: c.textFaint,
    marginTop: 4,
  },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
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
    color: c.white,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    letterSpacing: -0.2,
  },
});
