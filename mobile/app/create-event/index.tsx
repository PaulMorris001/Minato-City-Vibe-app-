import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import {
  DateTimeDropdown,
  InfoTip,
  LocationPicker,
  MultiImagePicker,
} from "@/components/shared";
import GlassBackButton from "@/components/shared/GlassBackButton";
import LocationPinPicker from "@/components/shared/LocationPinPicker";
import { hasIncompleteDraft } from "@/components/shared/AdditionalLocationsEditor";
import { subEventDraftError } from "@/components/shared/SubEventsEditor";
import { tierDraftError, tiersHaveQuantities } from "@/components/shared/TicketTiersEditor";
import { venuesFromDrafts } from "@/components/shared/AdditionalLocationsEditor";
import { subEventsFromDrafts } from "@/components/shared/SubEventsEditor";
import { uploadImage, resolveImageUrls } from "@/utils/imageUpload";
import { scaleFontSize } from "@/utils/responsive";
import { formatLocation } from "@/utils/location";
import { ensureOnline } from "@/utils/requireOnline";
import {
  currencyPrefix,
  payoutCountryKnown,
  payoutProviderForCountry,
  sellingCurrencyForCountry,
} from "@/constants/payments";
import { useCreateEvent } from "@/contexts/CreateEventContext";

import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";

/**
 * The basics of a new event — everything required to submit — plus entry rows
 * into the optional detours (tiers, other locations, a programme, venue
 * proof). This is the hub: it owns "Create Event", and every detour just
 * enriches the shared draft (see contexts/CreateEventContext.tsx) rather than
 * submitting anything itself.
 *
 * Successor to CreateEventModal, which crammed all of this into one scrolling
 * sheet. Validation and the submit payload are unchanged from that modal —
 * only where each field lives has moved.
 */
export default function CreateEventScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { birthday } = useLocalSearchParams<{ birthday?: string }>();
  const { draft, update, reset } = useCreateEvent();

  const [loading, setLoading] = useState(false);
  const [pinPickerOpen, setPinPickerOpen] = useState(false);

  // The birthday-raffle flow deep-links here with `?birthday=1` (see
  // birthday-raffle/index.tsx) since there's no event yet to enter the raffle
  // with. Read once — nothing else should flip this mid-flow.
  useEffect(() => {
    if (birthday === "1" && !draft.isBirthdayRaffle) {
      update("isBirthdayRaffle", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthday]);

  useEffect(() => {
    loadVerificationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVerificationStatus = async () => {
    try {
      // Fast path from the cached user (it has no location, so the currency
      // comes from the profile fetch below).
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        if (typeof u.verified === "boolean") update("isVerified", u.verified);
      }
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        update("isVerified", data.user?.verified ?? data.vendor?.verified ?? false);
        update("sellerCurrency", sellingCurrencyForCountry(data.user?.location?.country));
        update("sellerCountry", data.user?.location?.country);
      }
    } catch {}
  };

  const handleCreateEvent = async () => {
    if (!ensureOnline("create an event")) return;
    // Validation — same order and messages as the modal this replaced.
    if (!draft.title.trim()) {
      Alert.alert("Validation Error", "Please enter an event title");
      return;
    }
    if (!draft.date) {
      Alert.alert("Validation Error", "Please select an event date and time");
      return;
    }
    if (!draft.isVirtual && (!draft.eventLocation?.city || !draft.eventLocation?.state)) {
      Alert.alert("Validation Error", "Please select your country, state, and city");
      return;
    }
    if (!draft.isVirtual && hasIncompleteDraft(draft.extraVenues)) {
      Alert.alert("Validation Error", "Every added location needs a country, state, and city — or remove it");
      return;
    }
    if (!draft.isVirtual && draft.subEvents.length) {
      const subEventProblem = subEventDraftError(draft.subEvents);
      if (subEventProblem) {
        Alert.alert("Validation Error", subEventProblem);
        return;
      }
    }
    if (draft.isVirtual && draft.meetingLink.trim() && !/^https?:\/\//i.test(draft.meetingLink.trim())) {
      Alert.alert("Validation Error", "Event link must start with http:// or https://");
      return;
    }

    if (draft.isPublic && draft.isPaid) {
      if (draft.tiers.length > 0) {
        const tierProblem = tierDraftError(draft.tiers);
        if (tierProblem) {
          Alert.alert("Validation Error", tierProblem);
          return;
        }
      } else if (!draft.ticketPrice || parseFloat(draft.ticketPrice) <= 0) {
        Alert.alert("Validation Error", "Please enter a valid ticket price");
        return;
      }
      // Max Guests is required unless per-tier quantities were set (capacity is
      // then the sum of them, computed server-side).
      if (!tiersHaveQuantities(draft.tiers) && (!draft.maxGuests || parseInt(draft.maxGuests) <= 0)) {
        Alert.alert("Validation Error", "Please enter maximum number of guests");
        return;
      }
      if (!draft.venueProofImage && !draft.isVirtual) {
        Alert.alert(
          "Venue proof required",
          "Upload a photo of your venue booking — confirmation email, signed contract, or reservation screenshot.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Add it now", onPress: () => router.push("/create-event/venue-proof" as any) },
          ]
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
      if (draft.eventImages.length > 0) {
        try {
          eventImageUrls = await resolveImageUrls(draft.eventImages, "events", token);
        } catch (uploadError) {
          console.error("Error uploading event images:", uploadError);
          Alert.alert("Upload Error", "Failed to upload event photos");
          setLoading(false);
          return;
        }
      }

      // Upload venue proof for paid events
      if (draft.isPublic && draft.isPaid && draft.venueProofImage) {
        if (draft.venueProofImage.startsWith("file://")) {
          try {
            const result = await uploadImage(draft.venueProofImage, "venue-proofs", token);
            venueProofUrl = result.url;
          } catch (uploadError) {
            console.error("Error uploading venue proof:", uploadError);
            Alert.alert("Upload Error", "Failed to upload venue proof image");
            setLoading(false);
            return;
          }
        } else {
          venueProofUrl = draft.venueProofImage;
        }
      }

      const eventData = {
        title: draft.title.trim(),
        date: draft.date.trim(),
        ...(draft.endDate ? { endDate: draft.endDate } : {}),
        location: draft.isVirtual ? "Online" : formatLocation(draft.eventLocation!),
        address: draft.isVirtual ? "" : draft.address.trim(),
        city: draft.isVirtual ? "" : draft.eventLocation!.city,
        state: draft.isVirtual ? "" : draft.eventLocation!.state,
        country: draft.isVirtual ? "" : draft.eventLocation!.country,
        // Optional map pin. Left off entirely when the host skipped it — the
        // event screen geocodes the address on the device in that case.
        ...(!draft.isVirtual && draft.pinnedCoords ? draft.pinnedCoords : {}),
        additionalLocations: draft.isVirtual ? [] : venuesFromDrafts(draft.extraVenues),
        subEvents: draft.isVirtual ? [] : subEventsFromDrafts(draft.subEvents),
        isVirtual: draft.isVirtual,
        meetingLink: draft.isVirtual ? draft.meetingLink.trim() : "",
        description: draft.description.trim(),
        images: eventImageUrls,
        isPublic: draft.isPublic,
        isPaid: draft.isPaid,
        showAttendance: draft.isPublic && draft.showAttendance,
        // With tiers, the server derives the headline price (cheapest tier).
        ticketPrice: draft.isPaid && draft.tiers.length === 0 ? parseFloat(draft.ticketPrice) : 0,
        ticketTiers:
          draft.isPaid && draft.tiers.length > 0
            ? draft.tiers.map((t) => ({
                name: t.name.trim(),
                price: parseFloat(t.price),
                // Only send quantity when the organizer set one on every tier.
                ...(t.quantity.trim() !== "" ? { quantity: parseInt(t.quantity) } : {}),
              }))
            : undefined,
        // Explicit so the server can reject a stale/mismatched currency
        // instead of silently repricing (it derives the same value itself).
        currency: draft.isPaid ? draft.sellerCurrency : undefined,
        // When tiers carry quantities the server derives capacity from their sum,
        // so a blank Max Guests is fine (send 0 and let the server compute).
        maxGuests: draft.isPaid && draft.maxGuests ? parseInt(draft.maxGuests) : 0,
        venueProofImage: venueProofUrl,
        isBirthdayRaffle: draft.isBirthdayRaffle,
      };

      const { data } = await axios.post(`${BASE_URL}/events`, eventData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Every paid event waits on admin review before it can sell tickets, so
      // trust the server's wording rather than always claiming it's live.
      Alert.alert(
        data?.pendingApproval ? "Submitted for review" : "Success",
        draft.isBirthdayRaffle
          ? "Birthday event created! You're now entered into the raffle."
          : data?.message || "Event created successfully!"
      );

      const wasBirthdayRaffle = draft.isBirthdayRaffle;
      reset();

      if (wasBirthdayRaffle) {
        // Replace rather than push: the create-event screens are done with,
        // and shouldn't sit in history for the back button to return to.
        router.replace("/birthday-raffle/status" as any);
      } else {
        // Pops the whole create-event group, back to whichever tab pushed it —
        // that screen's own focus effect picks up the new event.
        router.back();
      }
    } catch (error: any) {
      console.error("Error creating event:", error);
      const errorMessage = error.response?.data?.message || "Failed to create event";
      if (/verif/i.test(errorMessage)) {
        Alert.alert("Verification required", errorMessage, [
          { text: "Cancel", style: "cancel" },
          { text: "Get Verified", onPress: () => router.push("/settings" as any) },
        ]);
      } else {
        Alert.alert("Error", errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const isSubmitEnabled =
    !!draft.title.trim() && !!draft.date && (draft.isVirtual || !!draft.eventLocation?.city);

  const quickDates = [
    { label: "Tonight", offset: 0 },
    { label: "Tomorrow", offset: 1 },
    { label: "This Wknd", offset: 2 },
  ];

  const applyQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(22, 0, 0, 0);
    update("date", d.toISOString());
  };

  return (
    <LinearGradient
      colors={isDark ? ["#1A0F35", colors.backgroundDeep] : [colors.background, colors.backgroundDeep]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
              <GlassBackButton style={styles.backButton} />
              <Text style={styles.headerTitle}>
                {draft.isBirthdayRaffle ? "Create Birthday Event" : "Create event"}
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 140 }}
            >
              {/* First-timers get a way to the manual without losing the draft
                  — it's just a pushed screen now, so back returns right here. */}
              <TouchableOpacity
                style={styles.howItWorksRow}
                activeOpacity={0.7}
                onPress={() => router.push("/help/events" as any)}
              >
                <Ionicons name="help-circle-outline" size={16} color={colors.primaryLight} />
                <Text style={styles.howItWorksText}>
                  First event? Read how tickets, approval and payouts work
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
              </TouchableOpacity>

              {/* Event Photos */}
              <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                <MultiImagePicker
                  value={draft.eventImages}
                  onChange={(v) => update("eventImages", v)}
                  label="Event photos & videos"
                  max={10}
                />
              </View>

              {/* Event Title */}
              <Text style={styles.label}>Event name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Give it a name..."
                placeholderTextColor={colors.textGhost}
                value={draft.title}
                onChangeText={(value) => update("title", value)}
              />

              {/* Quick Date Pills */}
              <Text style={styles.label}>When *</Text>
              <View style={styles.quickDatesRow}>
                {quickDates.map((qd) => {
                  const active = draft.date && (() => {
                    const target = new Date();
                    target.setDate(target.getDate() + qd.offset);
                    const selected = new Date(draft.date);
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
                  value={draft.date ? new Date(draft.date) : null}
                  onChange={(d) => update("date", d.toISOString())}
                  minimumDate={new Date()}
                  defaultHour={22}
                />
              </View>

              {/* Optional end. Only offered once a start exists, since it's
                  validated against one. */}
              {!!draft.date && (
                <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                  <Text style={styles.endDateLabel}>
                    {draft.endDate ? "Ends" : "Runs across days? Add an end (optional)"}
                  </Text>
                  <DateTimeDropdown
                    value={draft.endDate ? new Date(draft.endDate) : null}
                    onChange={(d) => update("endDate", d.toISOString())}
                    minimumDate={new Date(draft.date)}
                    defaultHour={22}
                  />
                  {!!draft.endDate && (
                    <TouchableOpacity
                      onPress={() => update("endDate", "")}
                      hitSlop={8}
                      style={{ paddingVertical: 6 }}
                    >
                      <Text style={styles.endDateClear}>Clear end date</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Where is it held — in person vs virtual */}
              <InfoTip label="WHERE IS IT HELD" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
                In person events ask for a city and street address, and show guests a
                map. Virtual events skip both and instead take a joining link — which
                stays hidden until someone is on the guest list, so it can't leak from
                a shared post.
              </InfoTip>
              <View style={styles.visibilityRow}>
                <TouchableOpacity
                  style={[styles.visibilityCard, !draft.isVirtual && styles.visibilityCardActive]}
                  onPress={() => update("isVirtual", false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>📍</Text>
                  <Text style={[styles.visibilityLabel, !draft.isVirtual && styles.visibilityLabelActive]}>In person</Text>
                  <Text style={styles.visibilityHint}>Physical venue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visibilityCard, draft.isVirtual && styles.visibilityCardActive]}
                  onPress={() => update("isVirtual", true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>🎥</Text>
                  <Text style={[styles.visibilityLabel, draft.isVirtual && styles.visibilityLabelActive]}>Virtual</Text>
                  <Text style={styles.visibilityHint}>Online event</Text>
                </TouchableOpacity>
              </View>

              {draft.isVirtual ? (
                <>
                  <Text style={styles.label}>Event link</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://zoom.us/j/... (optional)"
                    placeholderTextColor={colors.textGhost}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={draft.meetingLink}
                    onChangeText={(value) => update("meetingLink", value)}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 123 Main St, Rooftop Lounge"
                    placeholderTextColor={colors.textGhost}
                    value={draft.address}
                    onChangeText={(value) => update("address", value)}
                  />

                  <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
                    <LocationPicker
                      value={draft.eventLocation ?? undefined}
                      onChange={(sel) => update("eventLocation", sel)}
                      label="Location"
                      required
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.pinRow}
                    onPress={() => setPinPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={draft.pinnedCoords ? "location" : "location-outline"}
                      size={17}
                      color={draft.pinnedCoords ? colors.primaryLight : colors.textDim}
                    />
                    <Text style={styles.pinRowText}>
                      {draft.pinnedCoords ? "Map pin set" : "Pin the exact spot on a map"}
                    </Text>
                    <Text style={styles.pinRowAction}>{draft.pinnedCoords ? "Change" : "Optional"}</Text>
                  </TouchableOpacity>

                  <View style={{ paddingHorizontal: 20 }}>
                    <EntryRow
                      icon="map-outline"
                      label="Other locations"
                      subtitle={
                        draft.extraVenues.length
                          ? `${draft.extraVenues.length} added`
                          : draft.subEvents.length
                            ? "Remove your sub-events to use this instead"
                            : "Optional — run this event at more than one venue"
                      }
                      complete={draft.extraVenues.length > 0}
                      disabled={draft.subEvents.length > 0}
                      onPress={() => router.push("/create-event/locations" as any)}
                    />
                    <EntryRow
                      icon="calendar-outline"
                      label="Sub-events"
                      subtitle={
                        draft.subEvents.length
                          ? `${draft.subEvents.length} added`
                          : draft.extraVenues.length
                            ? "Remove your other locations to use this instead"
                            : "Optional — a programme of separate stops"
                      }
                      complete={draft.subEvents.length > 0}
                      disabled={draft.extraVenues.length > 0}
                      onPress={() => router.push("/create-event/sub-events" as any)}
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
                value={draft.description}
                onChangeText={(value) => update("description", value)}
              />

              {/* Who can join — visibility toggle */}
              <InfoTip label="WHO CAN JOIN" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
                Private events never appear in search or the city feed — the only way in
                is an invite or a link you share yourself. Public events are listed for
                everyone browsing your city, can sell tickets, and need a verified
                account.
              </InfoTip>
              <View style={styles.visibilityRow}>
                <TouchableOpacity
                  style={[styles.visibilityCard, !draft.isPublic && styles.visibilityCardActive]}
                  onPress={() => update("isPublic", false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.visibilityEmoji}>🔒</Text>
                  <Text style={[styles.visibilityLabel, !draft.isPublic && styles.visibilityLabelActive]}>Private</Text>
                  <Text style={styles.visibilityHint}>Invite only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.visibilityCard,
                    draft.isPublic && styles.visibilityCardActive,
                    !draft.isVerified && styles.visibilityCardDisabled,
                  ]}
                  onPress={() => {
                    if (!draft.isVerified) {
                      Alert.alert(
                        "Verification required",
                        "Only verified users can create public events.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Get Verified", onPress: () => router.push("/settings" as any) },
                        ]
                      );
                      return;
                    }
                    update("isPublic", true);
                  }}
                  activeOpacity={draft.isVerified ? 0.8 : 1}
                >
                  <View style={styles.visibilityPublicTop}>
                    <Text style={styles.visibilityEmoji}>🌐</Text>
                    {!draft.isVerified && (
                      <Ionicons name="lock-closed" size={13} color={colors.textGhost} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text style={[
                    styles.visibilityLabel,
                    draft.isPublic && styles.visibilityLabelActive,
                    !draft.isVerified && styles.visibilityLabelDisabled,
                  ]}>Public</Text>
                  <Text style={[styles.visibilityHint, !draft.isVerified && styles.visibilityHintDisabled]}>
                    {draft.isVerified ? "Open to all" : "Verified only"}
                  </Text>
                </TouchableOpacity>
              </View>

              {!draft.isVerified && (
                <TouchableOpacity
                  style={styles.verifyLinkRow}
                  onPress={() => router.push("/settings" as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
                  <Text style={styles.verifyLinkText}>Get verified to host public events →</Text>
                </TouchableOpacity>
              )}

              {/* Sell tickets (only if public) */}
              {draft.isPublic && (
                <>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => update("showAttendance", !draft.showAttendance)}
                  >
                    <View style={[styles.checkbox, draft.showAttendance && styles.checkboxChecked]}>
                      {draft.showAttendance && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Show how many are going 👥</Text>
                  </TouchableOpacity>
                  <Text style={styles.tierHint}>
                    Guests will see the headcount, capacity and spots left. Your guest
                    list stays private either way.
                  </Text>

                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => update("isPaid", !draft.isPaid)}
                  >
                    <View style={[styles.checkbox, draft.isPaid && styles.checkboxChecked]}>
                      {draft.isPaid && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Sell tickets 🎟️</Text>
                  </TouchableOpacity>
                  <InfoTip label="CAN I GET PAID?" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
                    {payoutProviderForCountry(draft.sellerCountry)
                      ? "Ticket money is held until after your event, then paid out to " +
                        "your payout account once our team approves it. Set that account " +
                        "up in Settings before your first sale."
                      : payoutCountryKnown(draft.sellerCountry)
                        ? "Payouts aren't available in your country yet. You can still " +
                          "sell tickets and we'll hold the money safely, but we can't " +
                          "transfer it to you until a payout option launches where you are."
                        : "Set your location in Settings first — we use it to work out how " +
                          "to pay you. Without it we can hold ticket money but can't send it."}
                  </InfoTip>

                  {draft.isPaid && (
                    <>
                      <Text style={styles.tierHint}>
                        Price it and size it however you like — there are no limits.
                        Every paid event is reviewed by our team before tickets go on
                        sale, and we'll notify you the moment it's approved.
                      </Text>

                      <View style={{ paddingHorizontal: 20 }}>
                        <EntryRow
                          icon="pricetags-outline"
                          label="Ticket tiers"
                          subtitle={
                            draft.tiers.length
                              ? `${draft.tiers.length} tier${draft.tiers.length > 1 ? "s" : ""} added`
                              : "Optional — sell General, VIP, etc. separately"
                          }
                          complete={draft.tiers.length > 0}
                          onPress={() => router.push("/create-event/tiers" as any)}
                        />
                      </View>

                      {draft.tiers.length === 0 && (
                        <>
                          <Text style={styles.label}>
                            Ticket Price ({currencyPrefix(draft.sellerCurrency).trim()}) *
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder={draft.sellerCurrency === "NGN" ? "e.g., 15000" : "e.g., 25.00"}
                            placeholderTextColor={colors.textGhost}
                            keyboardType="decimal-pad"
                            value={draft.ticketPrice}
                            onChangeText={(value) => update("ticketPrice", value)}
                          />
                        </>
                      )}

                      {tiersHaveQuantities(draft.tiers) ? (
                        <>
                          <Text style={styles.label}>Total Capacity</Text>
                          <Text style={styles.tierHint}>
                            {draft.tiers.reduce((sum, t) => sum + (parseInt(t.quantity) || 0), 0)} tickets
                            {" "}— the sum of your tier quantities.
                          </Text>
                        </>
                      ) : (
                        <>
                          <InfoTip label="MAX GUESTS *" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
                            The total number of tickets on sale. Sales stop automatically
                            when it's reached, and the event shows as sold out.
                          </InfoTip>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g., 100"
                            placeholderTextColor={colors.textGhost}
                            keyboardType="number-pad"
                            value={draft.maxGuests}
                            onChangeText={(value) => update("maxGuests", value)}
                          />
                        </>
                      )}

                      {!draft.isVirtual && (
                        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                          <EntryRow
                            icon="document-attach-outline"
                            label="Venue proof"
                            subtitle={draft.venueProofImage ? "Added ✓" : "Required before you can go on sale"}
                            complete={!!draft.venueProofImage}
                            required
                            onPress={() => router.push("/create-event/venue-proof" as any)}
                          />
                        </View>
                      )}
                    </>
                  )}
                </>
              )}
            </ScrollView>

            {/* Sticky footer */}
            <SafeAreaView edges={["bottom"]} style={styles.stickyFooterSafe}>
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
                          : draft.isVirtual
                            ? "Add name & date"
                            : "Add name, date & place"}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <LocationPinPicker
        visible={pinPickerOpen}
        onClose={() => setPinPickerOpen(false)}
        onConfirm={(coords) => update("pinnedCoords", coords)}
        initial={draft.pinnedCoords}
        searchText={[
          draft.address.trim(),
          draft.eventLocation?.city,
          draft.eventLocation?.state,
          draft.eventLocation?.country,
        ]
          .filter(Boolean)
          .join(", ")}
      />
    </LinearGradient>
  );
}

/** One row into an optional detour screen, with live completion state. */
function EntryRow({
  icon,
  label,
  subtitle,
  complete,
  disabled,
  required,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  subtitle: string;
  complete: boolean;
  disabled?: boolean;
  required?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.entryRow, disabled && styles.entryRowDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.75}
      disabled={disabled}
    >
      <Ionicons
        name={complete ? "checkmark-circle" : icon}
        size={20}
        color={complete ? colors.successLight : disabled ? colors.textGhost : colors.primaryLight}
      />
      <View style={styles.entryRowText}>
        <Text style={styles.entryRowLabel}>
          {label}
          {required && !complete ? " *" : ""}
        </Text>
        <Text style={styles.entryRowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {!disabled && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    backButton: {},
    headerTitle: {
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: scaleFontSize(20),
      color: c.textBright,
      letterSpacing: -0.5,
    },
    infoTip: {
      paddingHorizontal: 20,
      marginTop: 16,
      marginBottom: 8,
    },
    infoTipLabel: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
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
    pinRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 12,
      backgroundColor: c.glassFillSubtle,
    },
    pinRowText: {
      flex: 1,
      fontFamily: Fonts.medium,
      fontSize: scaleFontSize(14),
      color: c.textBright,
    },
    pinRowAction: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(12.5),
      color: c.textDim,
    },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 14,
      backgroundColor: c.glassFillSubtle,
      marginBottom: 10,
    },
    entryRowDisabled: { opacity: 0.45 },
    entryRowText: { flex: 1 },
    entryRowLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(14.5),
      color: c.textBright,
    },
    entryRowSubtitle: {
      fontFamily: Fonts.regular,
      fontSize: scaleFontSize(12.5),
      color: c.textDim,
      marginTop: 2,
    },
    tierHint: {
      fontSize: scaleFontSize(12),
      fontFamily: Fonts.regular,
      color: c.textDim,
      lineHeight: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    howItWorksRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      marginTop: 4,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.primaryFaded,
      borderWidth: 1,
      borderColor: c.primaryBorder,
    },
    howItWorksText: {
      flex: 1,
      color: c.textDim,
      fontFamily: Fonts.regular,
      fontSize: 12.5,
    },
    endDateLabel: {
      color: c.textDim,
      fontFamily: Fonts.regular,
      fontSize: 12,
      marginBottom: 6,
    },
    endDateClear: {
      color: c.primaryLight,
      fontFamily: Fonts.medium,
      fontSize: 12,
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
    quickDateTextActive: { color: c.white },
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
    visibilityCardDisabled: { opacity: 0.45 },
    visibilityPublicTop: { flexDirection: "row", alignItems: "center" },
    visibilityEmoji: { fontSize: 22 },
    visibilityLabel: {
      fontFamily: Fonts.bold,
      fontSize: 14,
      color: c.textFaint,
    },
    visibilityLabelActive: { color: c.primary },
    visibilityLabelDisabled: { color: c.textGhost },
    visibilityHint: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: c.textGhost,
    },
    visibilityHintDisabled: { color: c.textGhost, opacity: 0.7 },
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
    stickyFooterSafe: { position: "absolute", bottom: 0, left: 0, right: 0 },
    stickyFooter: { padding: 16 },
    createButton: {
      borderRadius: 14,
      overflow: "hidden",
    },
    createButtonDisabled: { opacity: 0.7 },
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
