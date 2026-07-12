import React, { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { DateTimeDropdown } from "@/components/shared";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import socketService from "@/services/socket.service";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";
import { createEventShareLink } from "@/utils/shareLinks";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import ExternalEventCard from "@/components/shared/ExternalEventCard";
import GuestGate from "@/components/shared/GuestGate";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import { Avatar } from "@/components/shared/Avatar";
import { useStripePayment } from "@/hooks/useStripePayment";
import { trackEvent as trackAnalyticsEvent } from "@/utils/analytics";
import { LocationSelection } from "@/libs/interfaces";
import { LocationPicker, MultiImagePicker } from "@/components/shared";
import { formatLocation } from "@/utils/location";
import { resolveImageUrls } from "@/utils/imageUpload";

interface Event {
  _id: string;
  title: string;
  date: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  isVirtual?: boolean;
  meetingLink?: string;
  image?: string;
  images?: string[];
  description?: string;
  shareToken: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  userStatus: "creator" | "accepted" | "pending" | "none";
  createdBy: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
  invitedUsers: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  }[];
  pendingInvites: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export default function EventsPage() {
  const router = useRouter();
  const { payForTicket } = useStripePayment();

  // Tab state
  const [activeTab, setActiveTab] = useState<"private" | "discover">("private");

  // Private events state
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Discover (public) events state
  const [discoverEvents, setDiscoverEvents] = useState<PublicEvent[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverHasMore, setDiscoverHasMore] = useState(true);
  const [discoverLoadingMore, setDiscoverLoadingMore] = useState(false);
  // External events (Ticketmaster etc) — fetched in parallel with native discover
  // events and merged into a single date-sorted feed below.
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [discoverLoc, setDiscoverLoc] = useState<Partial<LocationSelection> | null>(null);
  const [discoverOnline, setDiscoverOnline] = useState(false);
  const [discoverPickerKey, setDiscoverPickerKey] = useState(0);
  const [inviteTab, setInviteTab] = useState<"people" | "vendors">("people");
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [editData, setEditData] = useState({
    title: "",
    date: "",
    location: "",
    address: "",
    city: "",
    state: "",
    country: "",
    isVirtual: false,
    meetingLink: "",
    images: [] as string[],
    description: "",
    isPublic: false,
  });
  const [editLocation, setEditLocation] = useState<LocationSelection | null>(null);

  const PAGE_LIMIT = 10;

  const fetchEvents = async (pageNum = 1, isRefresh = false) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        // Guest — "My Events" needs an account. Show the sign-in gate instead
        // of bouncing them straight to /login.
        setIsGuest(true);
        setLoading(false);
        return;
      }
      setIsGuest(false);

      const response = await fetch(
        `${BASE_URL}/events?page=${pageNum}&limit=${PAGE_LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();

      if (response.ok) {
        const incoming = data.events || [];
        if (isRefresh || pageNum === 1) {
          setEvents(incoming);
        } else {
          setEvents((prev) => [...prev, ...incoming]);
        }
        setTotal(data.total ?? incoming.length);
        setPage(pageNum);
        setHasMore(incoming.length === PAGE_LIMIT);
      } else {
        Alert.alert("Error", data.message || "Failed to fetch events");
      }
    } catch (error) {
      console.error("Fetch events error:", error);
      Alert.alert("Error", "Failed to load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchEvents(page + 1);
  };

  const DISCOVER_LIMIT = 10;

  const fetchDiscoverEvents = async (
    pageNum = 1,
    loc: Partial<LocationSelection> | null = discoverLoc,
    isRefresh = false,
    online = discoverOnline
  ) => {
    try {
      if (pageNum === 1) setDiscoverLoading(true);
      else setDiscoverLoadingMore(true);

      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(DISCOVER_LIMIT),
      });
      if (online) {
        params.append("online", "true");
      } else {
        if (loc?.city) params.append("city", loc.city);
        if (loc?.state) params.append("state", loc.state);
        if (loc?.country) params.append("country", loc.country);
      }

      // Fire both feeds in parallel. External events are only fetched on the
      // first page — they're upcoming events without pagination needs in v1.
      // Pagination through external events can be added later if the feed
      // gets dense enough to need it. Skipped entirely for the Online filter:
      // Ticketmaster events are always physical.
      const [nativeRes, externalRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/events/public/explore?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        pageNum === 1 && !online
          ? externalEventService.explore({
              city: loc?.city,
              // Send the ISO code (e.g. "NG"), NOT the display name
              // ("Nigeria"). Ticketmaster stores country as ISO code so name
              // would never match. Fall back to the name if the picker
              // didn't provide an iso (older state).
              country: loc?.countryIso || loc?.country,
              limit: 20,
            })
          : Promise.resolve({ events: [], nextCursor: null }),
      ]);

      // Native events (preserve all existing logic)
      if (nativeRes.status === "fulfilled" && nativeRes.value.ok) {
        const data = await nativeRes.value.json();
        const incoming: PublicEvent[] = data.events || [];
        if (pageNum === 1 || isRefresh) {
          setDiscoverEvents(incoming);
        } else {
          setDiscoverEvents((prev) => [...prev, ...incoming]);
        }
        setDiscoverPage(pageNum);
        setDiscoverHasMore(incoming.length === DISCOVER_LIMIT);
      }

      // External events: only refresh on page 1 / refresh; keep cached
      // otherwise so they don't flicker when the user paginates native events.
      if (pageNum === 1 || isRefresh) {
        if (externalRes.status === "fulfilled") {
          setExternalEvents(externalRes.value.events || []);
        } else {
          // Silent fallback — an external API hiccup should never break the feed
          console.warn("[Discover] external events fetch failed:", externalRes.reason);
          setExternalEvents([]);
        }
      }
    } catch {}
    finally {
      setDiscoverLoading(false);
      setDiscoverLoadingMore(false);
    }
  };

  const loadMoreDiscover = () => {
    if (!discoverHasMore || discoverLoadingMore) return;
    fetchDiscoverEvents(discoverPage + 1);
  };

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    // The hook runs checkout AND confirms server-side before returning.
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }
    trackAnalyticsEvent("ticket_purchased", { eventId, eventTitle });
    Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
    fetchDiscoverEvents(1, discoverLoc, true);
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/events/${eventId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success!", `You've joined "${eventTitle}"`);
        fetchDiscoverEvents(1, discoverLoc, true);
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch {
      Alert.alert("Error", "Failed to join event");
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents(1, true);
      // Each visit starts fresh — reset the location filter and the picker.
      setDiscoverLoc(null);
      setDiscoverOnline(false);
      setDiscoverPickerKey((k) => k + 1);
      fetchDiscoverEvents(1, null, true, false);
    }, [])
  );

  // Re-fetch events immediately when this user receives a new invite via socket
  useEffect(() => {
    socketService.on("events-tab", {
      onEventInvite: () => {
        fetchEvents(1, true);
      },
    });
    return () => socketService.off("events-tab");
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === "private") {
      fetchEvents(1, true);
    } else {
      fetchDiscoverEvents(1, discoverLoc, true);
      setRefreshing(false);
    }
  };

  const handleRespondInvite = async (eventId: string, status: "accepted" | "declined") => {
    setRespondingInvite(eventId);
    try {
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(`${BASE_URL}/events/${eventId}/respond-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (response.ok) {
        // Refresh list to reflect change
        fetchEvents(1, true);
        Alert.alert(
          status === "accepted" ? "Joined!" : "Declined",
          status === "accepted"
            ? "You've joined the event."
            : "Invite declined."
        );
      } else {
        Alert.alert("Error", data.message || "Could not respond to invite");
      }
    } catch {
      Alert.alert("Error", "Failed to respond to invite");
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleShareEvent = async (event: Event) => {
    try {
      const link = createEventShareLink(event.shareToken || event._id);
      await Share.share({
        message: `Check out this event on OurCityvibe: ${event.title}\n${link}`,
        title: event.title,
        url: link,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    const eventDate = new Date(event.date);
    setEditData({
      title: event.title,
      date: eventDate.toISOString(),
      location: event.location,
      address: event.address || "",
      city: event.city || "",
      state: event.state || "",
      country: event.country || "",
      isVirtual: !!event.isVirtual,
      meetingLink: event.meetingLink || "",
      images: event.images && event.images.length > 0 ? event.images : event.image ? [event.image] : [],
      description: event.description || "",
      isPublic: event.isPublic,
    });
    // Prefill the picker from structured fields when present; legacy events
    // only have the free-text location, so leave the picker empty for those.
    setEditLocation(
      event.city
        ? { country: event.country || "United States", state: event.state || "", city: event.city }
        : null
    );
    setIsEditModalVisible(true);
  };

  const openInviteModal = (event: Event) => {
    setSelectedEvent(event);
    setInviteUsername("");
    setSearchedUsers([]);
    setIsInviteModalVisible(true);
  };

  useEffect(() => {
    const searchMutualFollows = async (query: string) => {
      if (query.trim().length < 2) {
        setSearchedUsers([]);
        return;
      }

      try {
        setSearchingUsers(true);
        const token = await SecureStore.getItemAsync("token");
        const response = await fetch(
          `${BASE_URL}/follow/mutual?query=${encodeURIComponent(query)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        if (response.ok) {
          // Filter out users that are already invited or are the creator
          const filteredUsers = (data.users || []).filter(
            (user: any) => {
              const uid = user.id || user._id;
              return (
                uid !== selectedEvent?.createdBy._id &&
                !selectedEvent?.invitedUsers.some((invitedUser) => invitedUser._id === uid) &&
                !selectedEvent?.pendingInvites.some((pending) => pending._id === uid)
              );
            }
          );
          setSearchedUsers(filteredUsers);
        }
      } catch (error) {
        console.error("Error searching mutual follows:", error);
      } finally {
        setSearchingUsers(false);
      }
    };

    if (inviteUsername.trim().length >= 2) {
      const debounce = setTimeout(() => {
        searchMutualFollows(inviteUsername);
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchedUsers([]);
    }
  }, [inviteUsername, selectedEvent]);

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return;

    if (!editData.title || !editData.date || (!editData.isVirtual && !editData.location)) {
      Alert.alert("Error", "Please fill in required fields");
      return;
    }
    // A virtual event's seeded location is "Online" — switching it back to
    // in-person needs a real pick, not the leftover placeholder.
    if (!editData.isVirtual && selectedEvent.isVirtual && !editLocation?.city) {
      Alert.alert("Error", "Pick a location for the in-person event");
      return;
    }
    if (editData.isVirtual && editData.meetingLink.trim() && !/^https?:\/\//i.test(editData.meetingLink.trim())) {
      Alert.alert("Error", "Event link must start with http:// or https://");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("token");

      // Upload any newly-picked photos, keep already-hosted ones
      let imageUrls = editData.images;
      try {
        imageUrls = await resolveImageUrls(editData.images, "events", token!);
      } catch {
        Alert.alert("Upload Error", "Failed to upload event photos");
        return;
      }

      // Visibility is immutable post-creation — don't send it on update so a
      // stale toggle in local state can't trip the server's guard.
      const { isPublic: _ignored, images: _imgs, ...rest } = editData;
      // Virtual events carry no physical location; physical events carry no
      // meeting link. Blank the other family so nothing stale is sent.
      const editablePayload = editData.isVirtual
        ? { ...rest, images: imageUrls, location: "Online", address: "", city: "", state: "", country: "", meetingLink: editData.meetingLink.trim() }
        : { ...rest, images: imageUrls, meetingLink: "" };
      const response = await fetch(`${BASE_URL}/events/${selectedEvent._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editablePayload),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "Event updated successfully");
        setIsEditModalVisible(false);
        fetchEvents(1, true);
      } else {
        Alert.alert("Error", data.message || "Failed to update event");
      }
    } catch (error) {
      console.error("Update event error:", error);
      Alert.alert("Error", "Failed to update event");
    }
  };

  const handleInviteUser = async (user: any) => {
    if (!selectedEvent) return;

    try {
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(
        `${BASE_URL}/events/${selectedEvent._id}/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ username: user.username }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "User invited successfully");
        setIsInviteModalVisible(false);
        setInviteUsername("");
        setSearchedUsers([]);
        setInviteTab("people");
        fetchEvents(1, true);
      } else {
        Alert.alert("Error", data.message || "Failed to invite user");
      }
    } catch (error) {
      console.error("Invite user error:", error);
      Alert.alert("Error", "Failed to invite user");
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("token");
              const response = await fetch(`${BASE_URL}/events/${eventId}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              const data = await response.json();

              if (response.ok) {
                Alert.alert("Success", "Event deleted successfully");
                fetchEvents(1, true);
              } else {
                Alert.alert("Error", data.message || "Failed to delete event");
              }
            } catch (error) {
              console.error("Delete event error:", error);
              Alert.alert("Error", "Failed to delete event");
            }
          },
        },
      ]
    );
  };


  const handleEventPress = (eventId: string) => {
    router.push(`/event/${eventId}`);
  };

  const privateEvents = events.filter(e => !e.isPublic);

  const renderEvent = (event: Event) => {
    const eventDate = new Date(event.date);

    return (
      <TouchableOpacity
        key={event._id}
        style={styles.eventCard}
        onPress={() => handleEventPress(event._id)}
        activeOpacity={0.8}
      >
        {event.image ? (
          <Image source={{ uri: event.image }} style={styles.eventImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="calendar-outline" size={40} color="#6b7280" />
          </View>
        )}

        <View style={styles.eventContent}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed-outline" size={12} color="#a855f7" />
              <Text style={styles.privateBadgeText}>PRIVATE</Text>
            </View>
          </View>

          <View style={styles.eventDetail}>
            <Ionicons name="calendar" size={16} color="#a855f7" />
            <Text style={styles.eventDetailText}>
              {eventDate.toLocaleDateString()} at{" "}
              {eventDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View style={styles.eventDetail}>
            <Ionicons name={event.isVirtual ? "videocam" : "location"} size={16} color="#a855f7" />
            <Text style={styles.eventDetailText}>{event.location}</Text>
          </View>

          {event.description ? (
            <View style={styles.eventDetail}>
              <Ionicons name="document-text" size={16} color="#a855f7" />
              <Text style={styles.eventDetailText} numberOfLines={2}>
                {event.description}
              </Text>
            </View>
          ) : null}

          <View style={styles.eventDetail}>
            <Ionicons name="people" size={16} color="#a855f7" />
            <Text style={styles.eventDetailText}>
              {event.invitedUsers.length} invited
              {event.pendingInvites.length > 0 ? ` · ${event.pendingInvites.length} pending` : ""}
            </Text>
          </View>

          <View style={styles.eventActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleShareEvent(event);
              }}
            >
              <Ionicons name="share-social" size={20} color="#a855f7" />
            </TouchableOpacity>

            {/* Only show invite button for private events */}
            {!event.isPublic && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  openInviteModal(event);
                }}
              >
                <Ionicons name="person-add" size={20} color="#a855f7" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                openEditModal(event);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#a855f7" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteEvent(event._id);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isGuest) {
    return (
      <GuestGate
        title="Log in to see your events"
        subtitle="Sign in or create an account to host events, RSVP, manage invites, and track what you're attending."
        icon="calendar-outline"
      />
    );
  }

  return (
    <>
      <LinearGradient colors={["#0f0f1a", "#1a1a2e"]} style={styles.container}>
        {/* Top edge only — content should run under the floating tab bar on iOS. */}
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Events</Text>
          </View>

          {/* Tab switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "private" && styles.tabBtnActive]}
              onPress={() => setActiveTab("private")}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-closed-outline" size={14} color={activeTab === "private" ? "#fff" : "#6b7280"} />
              <Text style={[styles.tabBtnText, activeTab === "private" && styles.tabBtnTextActive]}>Private</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "discover" && styles.tabBtnActive]}
              onPress={() => setActiveTab("discover")}
              activeOpacity={0.8}
            >
              <Ionicons name="globe-outline" size={14} color={activeTab === "discover" ? "#fff" : "#6b7280"} />
              <Text style={[styles.tabBtnText, activeTab === "discover" && styles.tabBtnTextActive]}>Discover</Text>
            </TouchableOpacity>
          </View>

        <ScrollView
          style={styles.scrollView}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#a855f7"
            />
          }
        >
          {/* ──── DISCOVER TAB ──── */}
          {activeTab === "discover" ? (
            <>
              {/* Location filter */}
              <View style={styles.discoverFilterWrap}>
                <LocationPicker
                  key={discoverPickerKey}
                  label="Filter by location"
                  value={discoverLoc ?? undefined}
                  onChange={(sel) => {
                    const next = { country: sel.country, state: sel.state, city: sel.city };
                    setDiscoverLoc(next);
                    setDiscoverOnline(false);
                    fetchDiscoverEvents(1, next, true, false);
                  }}
                />
                <TouchableOpacity
                  style={[styles.onlineFilterBtn, discoverOnline && styles.onlineFilterBtnActive]}
                  onPress={() => {
                    const next = !discoverOnline;
                    setDiscoverOnline(next);
                    if (next) {
                      setDiscoverLoc(null);
                      setDiscoverPickerKey((k) => k + 1);
                    }
                    fetchDiscoverEvents(1, next ? null : discoverLoc, true, next);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="videocam-outline" size={15} color={discoverOnline ? "#fff" : "#9ca3af"} />
                  <Text style={[styles.onlineFilterText, discoverOnline && styles.onlineFilterTextActive]}>
                    Online events
                  </Text>
                  {discoverOnline && <Ionicons name="checkmark" size={15} color="#fff" />}
                </TouchableOpacity>
                {discoverLoc?.city || discoverLoc?.state || discoverLoc?.country || discoverOnline ? (
                  <TouchableOpacity
                    style={styles.clearLocationBtn}
                    onPress={() => {
                      setDiscoverLoc(null);
                      setDiscoverOnline(false);
                      setDiscoverPickerKey((k) => k + 1);
                      fetchDiscoverEvents(1, null, true, false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    <Text style={styles.clearLocationText}>Show all events</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {discoverLoading ? (
                <EventCardSkeleton count={5} />
              ) : discoverEvents.length === 0 && externalEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="globe-outline" size={64} color="#6b7280" />
                  <Text style={styles.emptyStateTitle}>No public events yet</Text>
                  <Text style={styles.emptyStateText}>Check back soon or try a different city</Text>
                </View>
              ) : (
                <>
                  {/*
                    Mixed feed: native + external events merged by date.
                    Native pagination still drives `discoverHasMore` —
                    external events are a one-shot batch on page 1.
                  */}
                  {[
                    ...discoverEvents.map((ev) => ({
                      _kind: "native" as const,
                      _id: ev._id,
                      sort: new Date(ev.date).getTime(),
                      data: ev,
                    })),
                    ...externalEvents.map((ev) => ({
                      _kind: "external" as const,
                      _id: ev._id,
                      sort: new Date(ev.date).getTime(),
                      data: ev,
                    })),
                  ]
                    .sort((a, b) => a.sort - b.sort)
                    .map((item) => (
                      <View
                        key={`${item._kind}-${item._id}`}
                        style={{ paddingHorizontal: 16, marginBottom: 12 }}
                      >
                        {item._kind === "native" ? (
                          <PublicEventCard
                            event={item.data}
                            onPurchaseTicket={handlePurchaseTicket}
                            onJoinFreeEvent={handleJoinFreeEvent}
                          />
                        ) : (
                          <ExternalEventCard event={item.data} />
                        )}
                      </View>
                    ))}
                  {discoverHasMore && (
                    <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreDiscover} disabled={discoverLoadingMore} activeOpacity={0.7}>
                      {discoverLoadingMore ? <ActivityIndicator size="small" color="#a855f7" /> : <Text style={styles.loadMoreText}>Load More</Text>}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          ) : null}

          {/* ──── PRIVATE TAB ──── */}
          {activeTab === "private" ? (loading ? (
            <EventCardSkeleton count={5} />
          ) : (() => {
            const pending = privateEvents.filter(e => e.userStatus === "pending");
            const myEvents = privateEvents.filter(e => e.userStatus !== "pending");
            return (
              <>
                {/* ── Pending Invites ── */}
                {pending.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pending Invites</Text>
                    {pending.map(event => {
                      const eventDate = new Date(event.date);
                      const isResponding = respondingInvite === event._id;
                      return (
                        <TouchableOpacity
                          key={event._id}
                          style={styles.pendingCard}
                          onPress={() => handleEventPress(event._id)}
                          activeOpacity={0.8}
                        >
                          {event.image ? (
                            <Image source={{ uri: event.image }} style={styles.pendingImage} />
                          ) : (
                            <View style={styles.pendingImagePlaceholder}>
                              <Ionicons name="calendar-outline" size={28} color="#6b7280" />
                            </View>
                          )}
                          <View style={styles.pendingContent}>
                            <Text style={styles.pendingTitle} numberOfLines={1}>{event.title}</Text>
                            <Text style={styles.pendingMeta}>
                              {event.createdBy.username} · {eventDate.toLocaleDateString()}
                            </Text>
                            <Text style={styles.pendingMeta} numberOfLines={1}>{event.location}</Text>
                            <View style={styles.pendingActions}>
                              <TouchableOpacity
                                style={[styles.pendingBtn, styles.acceptBtn]}
                                onPress={(e) => { e.stopPropagation(); handleRespondInvite(event._id, "accepted"); }}
                                disabled={isResponding}
                              >
                                {isResponding ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <>
                                    <Ionicons name="checkmark" size={15} color="#fff" />
                                    <Text style={styles.acceptBtnText}>Accept</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.pendingBtn, styles.declineBtn]}
                                onPress={(e) => { e.stopPropagation(); handleRespondInvite(event._id, "declined"); }}
                                disabled={isResponding}
                              >
                                <Ionicons name="close" size={15} color="#ef4444" />
                                <Text style={styles.declineBtnText}>Decline</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── My Private Events & Attending ── */}
                {myEvents.length === 0 && pending.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="lock-closed-outline" size={64} color="#6b7280" />
                    <Text style={styles.emptyStateTitle}>No private events yet</Text>
                    <Text style={styles.emptyStateText}>
                      Create an invite-only event from the home page
                    </Text>
                  </View>
                ) : myEvents.length > 0 ? (
                  <View style={styles.section}>
                    {pending.length > 0 && (
                      <Text style={styles.sectionTitle}>My Private Events</Text>
                    )}
                    {myEvents.map(renderEvent)}
                  </View>
                ) : null}

                {/* ── Load More ── */}
                {hasMore && (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={loadMore}
                    disabled={loadingMore}
                    activeOpacity={0.7}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#a855f7" />
                    ) : (
                      <Text style={styles.loadMoreText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                )}
                {!hasMore && privateEvents.length > 0 && (
                  <Text style={styles.allLoadedText}>
                    {privateEvents.length} private event{privateEvents.length !== 1 ? "s" : ""}
                  </Text>
                )}
              </>
            );
          })()) : null}
        </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Edit Event Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Event</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Birthday Party"
                  placeholderTextColor="#6b7280"
                  value={editData.title}
                  onChangeText={(text) =>
                    setEditData({ ...editData, title: text })
                  }
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date & Time *</Text>
                <DateTimeDropdown
                  value={editData.date ? new Date(editData.date) : null}
                  onChange={(d) =>
                    setEditData((prev) => ({ ...prev, date: d.toISOString() }))
                  }
                  minimumDate={new Date()}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Where is it held</Text>
                <TouchableOpacity
                  style={styles.visibilityToggle}
                  onPress={() => setEditData((prev) => ({ ...prev, isVirtual: false }))}
                  activeOpacity={0.7}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        !editData.isVirtual && styles.radioButtonSelected,
                      ]}
                    >
                      {!editData.isVirtual && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={styles.visibilityLabel}>In person</Text>
                      <Text style={styles.visibilityHint}>Guests meet at a physical venue</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.visibilityToggle}
                  onPress={() => setEditData((prev) => ({ ...prev, isVirtual: true }))}
                  activeOpacity={0.7}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        editData.isVirtual && styles.radioButtonSelected,
                      ]}
                    >
                      {editData.isVirtual && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={styles.visibilityLabel}>Virtual</Text>
                      <Text style={styles.visibilityHint}>Guests join online</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {editData.isVirtual ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Event link</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://zoom.us/j/... (optional)"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={editData.meetingLink}
                    onChangeText={(text) => setEditData({ ...editData, meetingLink: text })}
                  />
                </View>
              ) : (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 123 Main St, Rooftop Lounge"
                      placeholderTextColor="#6b7280"
                      value={editData.address}
                      onChangeText={(text) => setEditData({ ...editData, address: text })}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <LocationPicker
                      key={selectedEvent?._id || "edit"}
                      label="Location"
                      required
                      value={editLocation ?? undefined}
                      onChange={(sel) => {
                        setEditLocation(sel);
                        setEditData((prev) => ({
                          ...prev,
                          location: formatLocation(sel) || prev.location,
                          city: sel.city,
                          state: sel.state,
                          country: sel.country,
                        }));
                      }}
                    />
                  </View>
                </>
              )}

              <View style={styles.inputGroup}>
                <MultiImagePicker
                  value={editData.images}
                  onChange={(imgs) => setEditData({ ...editData, images: imgs })}
                  label="Event photos"
                  max={6}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe your event..."
                  placeholderTextColor="#6b7280"
                  value={editData.description}
                  onChangeText={(text) =>
                    setEditData({ ...editData, description: text })
                  }
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Visibility</Text>
                <Text style={styles.visibilityLockedHint}>
                  Visibility is locked after an event is created.
                  {editData.isPublic
                    ? " Making a public event private would strand guests and ticket holders."
                    : " Making a private event public would expose your guest list."}
                  {" "}Create a new event if you need to change this.
                </Text>
                <TouchableOpacity
                  style={[styles.visibilityToggle, !editData.isPublic && styles.visibilityToggleLocked, editData.isPublic && styles.visibilityToggleDisabled]}
                  onPress={() => {
                    if (editData.isPublic) {
                      Alert.alert(
                        "Can't switch to private",
                        "This event is already public and can't be made private — guests who joined or bought tickets would lose access. Create a new private event if you need that instead."
                      );
                    }
                  }}
                  activeOpacity={editData.isPublic ? 0.7 : 1}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        !editData.isPublic && styles.radioButtonSelected,
                      ]}
                    >
                      {!editData.isPublic && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={[styles.visibilityLabel, editData.isPublic && styles.visibilityLabelDim]}>
                        Private {!editData.isPublic && <Text style={styles.visibilityLockBadge}>· locked</Text>}
                      </Text>
                      <Text style={styles.visibilityHint}>
                        Only invited users can see this event
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visibilityToggle, editData.isPublic && styles.visibilityToggleLocked, !editData.isPublic && styles.visibilityToggleDisabled]}
                  onPress={() => {
                    if (!editData.isPublic) {
                      Alert.alert(
                        "Can't switch to public",
                        "A private event can't be made public after it's been created. Create a new public event if you'd like to open this up to everyone."
                      );
                    }
                  }}
                  activeOpacity={!editData.isPublic ? 0.7 : 1}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        editData.isPublic && styles.radioButtonSelected,
                      ]}
                    >
                      {editData.isPublic && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={[styles.visibilityLabel, !editData.isPublic && styles.visibilityLabelDim]}>
                        Public {editData.isPublic && <Text style={styles.visibilityLockBadge}>· locked</Text>}
                      </Text>
                      <Text style={styles.visibilityHint}>
                        Anyone can discover and join this event
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleUpdateEvent}
              >
                <LinearGradient
                  colors={["#a855f7", "#7c3aed"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.createButtonGradient}
                >
                  <Text style={styles.createButtonText}>Update Event</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite User Modal */}
      <Modal
        visible={isInviteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsInviteModalVisible(false);
          setInviteUsername("");
          setSearchedUsers([]);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsInviteModalVisible(false);
              setInviteUsername("");
              setSearchedUsers([]);
            }}
          />
          <View style={styles.inviteModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite User</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsInviteModalVisible(false);
                  setInviteUsername("");
                  setSearchedUsers([]);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* People / Vendors tab toggle */}
            <View style={styles.inviteTabRow}>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "people" && styles.inviteTabBtnActive]}
                onPress={() => setInviteTab("people")}
                activeOpacity={0.7}
              >
                <Text style={[styles.inviteTabText, inviteTab === "people" && styles.inviteTabTextActive]}>
                  People
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "vendors" && styles.inviteTabBtnActive]}
                onPress={() => setInviteTab("vendors")}
                activeOpacity={0.7}
              >
                <Text style={[styles.inviteTabText, inviteTab === "vendors" && styles.inviteTabTextActive]}>
                  Vendors
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Search {inviteTab === "vendors" ? "Vendor" : "User"}</Text>
                <View style={styles.searchInputContainer}>
                  <Ionicons
                    name="search"
                    size={20}
                    color="#6b7280"
                    style={styles.searchIconInModal}
                  />
                  <TextInput
                    style={styles.searchInputInModal}
                    placeholder={inviteTab === "vendors" ? "Enter vendor name..." : "Enter username or email..."}
                    placeholderTextColor="#6b7280"
                    value={inviteUsername}
                    onChangeText={setInviteUsername}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {searchingUsers && (
                <View style={styles.loadingUserContainer}>
                  <ActivityIndicator size="small" color="#a855f7" />
                </View>
              )}

              <FlatList
                data={searchedUsers.filter((u) =>
                  inviteTab === "vendors" ? u.isVendor === true : u.isVendor !== true
                )}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userSearchItem}
                    onPress={() => handleInviteUser(item)}
                  >
                    <Avatar uri={item.profilePicture} name={item.username || item.businessName} size={48} />
                    <View style={styles.userSearchInfo}>
                      <Text style={styles.userSearchName}>{item.username}</Text>
                      <Text style={styles.userSearchEmail}>
                        {inviteTab === "vendors" && item.businessName
                          ? item.businessName
                          : item.email}
                      </Text>
                    </View>
                    {item.isVendor && inviteTab === "vendors" && (
                      <View style={styles.vendorBadge}>
                        <Text style={styles.vendorBadgeText}>Vendor</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  !searchingUsers && inviteUsername.length >= 2 ? (
                    <View style={styles.emptyUserSearchContainer}>
                      <Ionicons name="people-outline" size={48} color="#6b7280" />
                      <Text style={styles.emptyUserSearchText}>
                        No {inviteTab === "vendors" ? "vendors" : "users"} found
                      </Text>
                    </View>
                  ) : !searchingUsers && inviteUsername.length < 2 ? (
                    <View style={styles.emptyUserSearchContainer}>
                      <Ionicons name="search-outline" size={48} color="#6b7280" />
                      <Text style={styles.emptyUserSearchText}>
                        Type at least 2 characters to search
                      </Text>
                    </View>
                  ) : null
                }
                contentContainerStyle={styles.userSearchListContent}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
  },
  // ── Section headings ──
  section: { marginBottom: 8, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 4,
  },
  // ── Pending invite card ──
  pendingCard: {
    flexDirection: "row",
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#a855f7",
  },
  pendingImage: {
    width: 90,
    height: "100%",
    resizeMode: "cover",
  },
  pendingImagePlaceholder: {
    width: 90,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 110,
  },
  pendingContent: {
    flex: 1,
    padding: 12,
  },
  pendingTitle: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  pendingMeta: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 2,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  pendingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  acceptBtn: { backgroundColor: "#a855f7" },
  acceptBtnText: { fontSize: scaleFontSize(13), fontFamily: Fonts.semiBold, color: "#fff" },
  declineBtn: { backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "#ef4444" },
  declineBtnText: { fontSize: scaleFontSize(13), fontFamily: Fonts.semiBold, color: "#ef4444" },
  eventCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#374151",
  },
  eventImage: {
    width: "100%",
    height: 180,
    resizeMode: "cover",
  },
  placeholderImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  eventContent: {
    padding: 16,
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    flex: 1,
  },
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  publicBadgeText: {
    fontSize: scaleFontSize(10),
    fontFamily: Fonts.bold,
    color: "#10b981",
    letterSpacing: 0.5,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  privateBadgeText: {
    fontSize: scaleFontSize(10),
    fontFamily: Fonts.bold,
    color: "#a855f7",
    letterSpacing: 0.5,
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: "#a855f7",
  },
  tabBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#6b7280",
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  discoverFilterWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 4,
  },
  onlineFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  onlineFilterBtnActive: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  onlineFilterText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#9ca3af",
  },
  onlineFilterTextActive: {
    color: "#fff",
  },
  clearLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: -4,
    marginBottom: 8,
  },
  clearLocationText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#9ca3af",
  },
  eventDetail: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  eventDetailText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    flex: 1,
  },
  eventActions: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  inviteModalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "75%",
    maxHeight: 600,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: getResponsivePadding(),
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#374151",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
  },
  createButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  createButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  createButtonText: {
    color: "white",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
  imagePickerButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  imagePickerGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  imagePickerText: {
    color: "white",
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
  },
  imagePreviewContainer: {
    marginTop: 12,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 12,
  },
  datePickerButton: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  datePickerText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
    flex: 1,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  searchIconInModal: {
    marginRight: 8,
  },
  searchInputInModal: {
    flex: 1,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  loadingUserContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  userSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  userSearchAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
  },
  userSearchAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  userSearchInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userSearchName: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  userSearchEmail: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  vendorBadge: {
    backgroundColor: "#a855f7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vendorBadgeText: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  inviteTabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: "#1f1f2e",
    borderRadius: 10,
    padding: 3,
  },
  inviteTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  inviteTabBtnActive: {
    backgroundColor: "#a855f7",
  },
  inviteTabText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#6b7280",
  },
  inviteTabTextActive: {
    color: "#fff",
  },
  emptyUserSearchContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyUserSearchText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
  },
  userSearchListContent: {
    flexGrow: 1,
  },
  visibilityToggle: {
    marginBottom: 8,
  },
  visibilityOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#6b7280",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: "#a855f7",
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#a855f7",
  },
  visibilityTextContainer: {
    flex: 1,
  },
  visibilityLabel: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  visibilityHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  visibilityLockedHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#fbbf24",
    backgroundColor: "rgba(251,191,36,0.08)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    lineHeight: 17,
  },
  visibilityToggleLocked: {
    opacity: 1,
  },
  visibilityToggleDisabled: {
    opacity: 0.5,
  },
  visibilityLabelDim: {
    color: "#9ca3af",
  },
  visibilityLockBadge: {
    fontSize: scaleFontSize(11),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  loadMoreBtn: {
    marginTop: 12,
    marginBottom: 24,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#a855f7",
    minWidth: 140,
    alignItems: "center",
  },
  loadMoreText: {
    color: "#a855f7",
    fontFamily: Fonts.semiBold,
    fontSize: scaleFontSize(14),
  },
  allLoadedText: {
    textAlign: "center",
    color: "#6b7280",
    fontFamily: Fonts.regular,
    fontSize: scaleFontSize(12),
    marginTop: 8,
    marginBottom: 24,
  },
});
