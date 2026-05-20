import React, { useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { trackEvent } from "@/utils/analytics";
import { createEventShareLink } from "@/utils/shareLinks";
import { useStripePayment } from "@/hooks/useStripePayment";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";
import ReportBlockSheet from "@/components/shared/ReportBlockSheet";
import ShareSheet, { ShareTarget } from "@/components/shared/ShareSheet";
import { GlassCard } from "@/components/event-details/GlassCard";
import { AU } from "@/components/auth/tokens";
import {
  countdownLabel,
  heroDateLine,
  heroEmojiFor,
  initialsOf,
  neighborhoodFromLocation,
  vendorAccentColor,
} from "@/utils/eventDetails";

interface RsvpUser {
  _id: string;
  username: string;
  profilePicture?: string;
}

interface User {
  _id: string;
  username: string;
  email: string;
  profilePicture?: string;
  verified?: boolean;
  hostedEventsCount?: number;
}

interface EventVendor {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { name?: string } | string;
}

interface Event {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  shareToken: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  ticketingReady?: boolean;
  userHasPurchased?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalRejectReason?: string;
  payoutStatus?: "none" | "pending" | "released" | "failed";
  payoutReleasedAt?: string;
  userStatus: "creator" | "accepted" | "pending" | "requested" | "none";
  createdBy: User;
  invitedUsers: User[];
  pendingInvites: User[];
  joinRequests?: User[];
  vendors?: EventVendor[];
  rsvpCount: number;
  rsvpUsers: RsvpUser[];
  userRsvp: boolean;
  friendsGoing?: number;
  groupChatUnread?: number;
  groupChatId?: { _id: string; name: string; groupImage?: string } | null;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchedUser {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
  isVendor: boolean;
  businessName?: string;
}

const HERO_HEIGHT = 380;

// ─── Pulsing pink dot used by the live countdown chip ────────────────────────
function PulseDot({ color = AU.pink, size = 6 }: { color?: string; size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// ─── Tiny round glassy button used by the top chrome (back / share / ⋯) ──────
function GlassRoundIcon({
  icon,
  onPress,
  size = 36,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.glassRound, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons name={icon} size={size * 0.5} color="#fff" />
    </TouchableOpacity>
  );
}

export default function EventDetailsPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<SearchedUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [inviteResponding, setInviteResponding] = useState(false);
  const [vendorSearchVisible, setVendorSearchVisible] = useState(false);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorResults, setVendorResults] = useState<EventVendor[]>([]);
  const [searchingVendors, setSearchingVendors] = useState(false);
  const [addingVendor, setAddingVendor] = useState<string | null>(null);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState(false);
  const { payForTicket } = useStripePayment();

  // ─── Data fetching ────────────────────────────────────────────────────────
  const authToken = () => SecureStore.getItemAsync("token");

  const fetchEventDetails = async () => {
    try {
      const token = await authToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`${BASE_URL}/events/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        trackEvent("event_viewed", { eventId: data.event._id, isPublic: data.event.isPublic });
      } else {
        Alert.alert("Error", data.message || "Failed to fetch event details");
        router.back();
      }
    } catch (err) {
      console.error("Fetch event details error:", err);
      Alert.alert("Error", "Failed to load event details");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        setCurrentUserId(u.id || u._id || "");
      }
    } catch (err) {
      console.error("Error loading user:", err);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    fetchEventDetails();
  }, [id]);

  // Load follow state for the host as soon as we know who we're looking at
  useEffect(() => {
    const hostId = event?.createdBy?._id;
    if (!hostId || !currentUserId || hostId === currentUserId) return;
    (async () => {
      try {
        const token = await authToken();
        const res = await fetch(`${BASE_URL}/follow/${hostId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setIsFollowingHost(!!data.isFollowing);
      } catch {
        // Non-fatal — pill just shows "Follow" by default.
      }
    })();
  }, [event?.createdBy?._id, currentUserId]);

  // ─── User search (debounced) ──────────────────────────────────────────────
  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const filtered = data.users.filter(
          (u: SearchedUser) =>
            u.id !== event?.createdBy._id &&
            !event?.invitedUsers.some((iu) => iu._id === u.id) &&
            !event?.pendingInvites.some((pu) => pu._id === u.id)
        );
        setSearchedUsers(filtered);
      }
    } catch (err) {
      console.error("Error searching users:", err);
    } finally {
      setSearchingUsers(false);
    }
  };

  useEffect(() => {
    if (userSearchQuery.trim().length >= 2) {
      const t = setTimeout(() => searchUsers(userSearchQuery), 300);
      return () => clearTimeout(t);
    } else {
      setSearchedUsers([]);
    }
  }, [userSearchQuery, event]);

  // ─── Handlers (preserved from previous version) ───────────────────────────
  const handleInviteUser = async (user: SearchedUser) => {
    if (!event) return;
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/events/${event._id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: user.username }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", "User invited successfully");
        setIsInviteModalVisible(false);
        setUserSearchQuery("");
        setSearchedUsers([]);
        fetchEventDetails();
      } else {
        Alert.alert("Error", data.message || "Failed to invite user");
      }
    } catch {
      Alert.alert("Error", "Failed to invite user");
    }
  };

  const handleRsvp = async (status: "going" | "not_going") => {
    if (!event) return;
    setRsvpLoading(true);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/events/${event._id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvent((prev) =>
          prev ? { ...prev, userRsvp: status === "going", rsvpCount: data.rsvpCount } : prev
        );
        trackEvent("event_rsvp", { eventId: event._id, status });
      } else {
        Alert.alert("Error", data.message || "Could not update RSVP");
      }
    } catch {
      Alert.alert("Error", "Failed to update RSVP");
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleRespondInvite = async (status: "accepted" | "declined") => {
    if (!event) return;
    setInviteResponding(true);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/events/${event._id}/respond-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        Alert.alert(
          status === "accepted" ? "Joined!" : "Declined",
          status === "accepted" ? "You've joined the event." : "You've declined the invite."
        );
      } else {
        Alert.alert("Error", data.message || "Could not respond to invite");
      }
    } catch {
      Alert.alert("Error", "Failed to respond to invite");
    } finally {
      setInviteResponding(false);
    }
  };

  const handleRequestToJoin = async () => {
    if (!event) return;
    setRequestingJoin(true);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/events/${event._id}/request-join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Sent", "We'll let you know when the organizer responds.");
        setEvent((prev) => (prev ? { ...prev, userStatus: "requested" } : prev));
      } else {
        Alert.alert("Couldn't send request", data.message || "Try again in a moment.");
      }
    } catch {
      Alert.alert("Error", "Couldn't send your request. Try again.");
    } finally {
      setRequestingJoin(false);
    }
  };

  const handleFollowToggle = async () => {
    const hostId = event?.createdBy?._id;
    if (!hostId) return;
    setFollowBusy(true);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/follow/${hostId}`, {
        method: isFollowingHost ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setIsFollowingHost((v) => !v);
    } catch {
      Alert.alert("Error", "Couldn't update follow.");
    } finally {
      setFollowBusy(false);
    }
  };

  const isCreator = event?.createdBy._id === currentUserId;

  const handleRefundOwnTicket = async () => {
    if (!event) return;
    Alert.alert(
      "Refund ticket?",
      "Your ticket will be cancelled and your money returned to the card you used. This usually takes 5–10 business days.",
      [
        { text: "Keep ticket", style: "cancel" },
        {
          text: "Refund",
          style: "destructive",
          onPress: async () => {
            setRefunding(true);
            try {
              const token = await authToken();
              const listRes = await fetch(`${BASE_URL}/tickets`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const listData = await listRes.json();
              const tickets = listData.tickets || [];
              const myTicket = tickets.find(
                (t: any) => t.event?._id === event._id && t.isValid
              );
              if (!myTicket) {
                Alert.alert("Not found", "Could not locate your ticket for this event.");
                return;
              }
              const res = await fetch(`${BASE_URL}/tickets/${myTicket._id}/refund`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (res.ok) {
                Alert.alert("Refunded", "Your ticket has been cancelled and refunded.");
                fetchEventDetails();
              } else {
                Alert.alert("Cannot refund", data.message || "Refund failed");
              }
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Refund failed");
            } finally {
              setRefunding(false);
            }
          },
        },
      ]
    );
  };

  const handlePurchaseTicket = async () => {
    if (!event) return;
    setPurchasing(true);
    try {
      const result = await payForTicket(event._id);
      if (!result.success) {
        if (result.error) Alert.alert("Payment Failed", result.error);
        return;
      }
      const token = await authToken();
      const confirmRes = await fetch(`${BASE_URL}/stripe/confirm/ticket/${event._id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
      });
      if (confirmRes.ok) {
        Alert.alert("You're in! 🎉", `Your ticket to "${event.title}" is ready.`);
        fetchEventDetails();
      } else {
        const d = await confirmRes.json();
        Alert.alert(
          "Error",
          d.message ||
            "Payment succeeded but the ticket could not be issued. Please contact Support@nvibez.com."
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const shareTarget: ShareTarget | null = event
    ? {
        kind: "event",
        eventId: event._id,
        title: event.title,
        externalUrl: createEventShareLink(event.shareToken || event._id),
      }
    : null;

  const handleVendorSearch = async (query: string) => {
    setVendorQuery(query);
    if (query.trim().length < 2) {
      setVendorResults([]);
      return;
    }
    setSearchingVendors(true);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/vendors/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setVendorResults(data.vendors || []);
    } catch {
      /* swallow */
    } finally {
      setSearchingVendors(false);
    }
  };

  const handleAddVendor = async (vendorId: string) => {
    if (!event) return;
    setAddingVendor(vendorId);
    try {
      const token = await authToken();
      const res = await fetch(`${BASE_URL}/events/${event._id}/vendors/${vendorId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Added", "Vendor added to event.");
        setVendorSearchVisible(false);
        setVendorQuery("");
        setVendorResults([]);
        fetchEventDetails();
      } else {
        Alert.alert("Error", data.message || "Failed to add vendor");
      }
    } catch {
      Alert.alert("Error", "Failed to add vendor");
    } finally {
      setAddingVendor(null);
    }
  };

  const handleRemoveVendor = async (vendorId: string) => {
    if (!event) return;
    Alert.alert("Remove Vendor", "Remove this vendor from the event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const token = await authToken();
          await fetch(`${BASE_URL}/events/${event._id}/vendors/${vendorId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchEventDetails();
        },
      },
    ]);
  };

  // ─── Derived UI state ─────────────────────────────────────────────────────
  const heroEmoji = useMemo(() => heroEmojiFor(event?.title), [event?.title]);
  const dateLine = useMemo(() => (event?.date ? heroDateLine(event.date) : ""), [event?.date]);
  const countdown = useMemo(
    () => (event?.date ? countdownLabel(event.date) : ""),
    [event?.date]
  );
  const neighborhood = useMemo(
    () => neighborhoodFromLocation(event?.location),
    [event?.location]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <EventCardSkeleton count={1} />
      </View>
    );
  }
  if (!event) return null;

  // ── State flags driving the sticky CTA bar
  const isCancelled = !!event.cancelledAt;
  const isPending = event.approvalStatus === "pending";
  const isRejected = event.approvalStatus === "rejected";
  const ticketsRemaining =
    typeof event.ticketsRemaining === "number"
      ? event.ticketsRemaining
      : event.maxGuests
        ? Math.max(event.maxGuests - (event.rsvpCount ?? 0), 0)
        : undefined;
  const soldOut =
    !!event.maxGuests && ticketsRemaining !== undefined && ticketsRemaining <= 0;
  const userHasTicket = !!event.userHasPurchased;
  const userIsGoing = !!event.userRsvp;
  const userIsInvited = event.userStatus === "accepted" || isCreator;
  const userIsPendingInvite = event.userStatus === "pending";
  const userHasRequested = event.userStatus === "requested";

  // Capacity numbers shared by the bar + the GOING / CAPACITY stat cards
  const goingCount = event.rsvpCount ?? event.rsvpUsers?.length ?? 0;
  const capacityPct = event.maxGuests
    ? Math.min(100, Math.round((goingCount / event.maxGuests) * 100))
    : 0;
  const capacityColor = capacityPct > 85 ? AU.pink : AU.greenSoft;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── HERO ─────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* Cover image (or fallback gradient) */}
          {event.image ? (
            <Image
              source={{ uri: event.image }}
              style={styles.heroImage}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          <LinearGradient
            colors={
              event.image
                ? ["transparent", "transparent"]
                : ["#22D3EE", "#7C3AED", "#EC4899"]
            }
            locations={[0, 0.6, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.heroFallback}
          />

          {/* Emoji watermark */}
          <Text style={styles.heroEmoji}>{heroEmoji}</Text>

          {/* Bottom readability fade */}
          <LinearGradient
            colors={["rgba(11,6,19,0)", "rgba(11,6,19,0.55)", AU.bg]}
            locations={[0, 0.5, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />

          {/* Top chrome — over hero */}
          <SafeAreaView
            edges={["top"]}
            style={styles.topChromeSafe}
            pointerEvents="box-none"
          >
            <View style={styles.topChromeRow}>
              <GlassRoundIcon icon="chevron-back" onPress={() => router.back()} />
              <View style={styles.topChromeRight}>
                <GlassRoundIcon
                  icon="ellipsis-horizontal"
                  onPress={() => setActionSheetVisible(true)}
                />
              </View>
            </View>
          </SafeAreaView>

          {/* Chip row */}
          <View style={styles.chipRow}>
            {!!countdown && (
              <View style={[styles.chip, styles.chipPink]}>
                <PulseDot />
                <Text style={[styles.chipText, { color: AU.pinkSoft }]}>{countdown}</Text>
              </View>
            )}
            <View style={[styles.chip, styles.chipDark]}>
              <Text style={[styles.chipText, { color: AU.text }]}>
                {event.isPublic ? "PUBLIC" : "INVITE ONLY"}
              </Text>
            </View>
            {event.isPaid && (
              <View style={[styles.chip, styles.chipDark]}>
                <Text style={[styles.chipText, { color: AU.text }]}>
                  TICKETED · ${event.ticketPrice?.toFixed(0) ?? "—"}
                </Text>
              </View>
            )}
            {soldOut && (
              <View style={[styles.chip, styles.chipDark]}>
                <Text style={[styles.chipText, { color: AU.text }]}>SOLD OUT</Text>
              </View>
            )}
          </View>

          {/* Title + meta */}
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{event.title}</Text>
            <View style={styles.heroMetaRow}>
              <Ionicons name="calendar-outline" size={14} color={AU.purpleSoft} />
              <Text style={styles.heroMetaText}>{dateLine}</Text>
              {!!neighborhood && (
                <>
                  <View style={styles.metaDot} />
                  <Ionicons name="location-outline" size={14} color={AU.purpleSoft} />
                  <Text style={styles.heroMetaText}>{neighborhood}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ─── CONTENT ──────────────────────────────────────── */}
        <View style={styles.content}>
          {/* Cancelled banner */}
          {isCancelled && (
            <View style={styles.cancelledBanner}>
              <Text style={styles.cancelledTitle}>Cancelled · refunds processing</Text>
              {!!event.cancellationReason && (
                <Text style={styles.cancelledBody}>{event.cancellationReason}</Text>
              )}
            </View>
          )}

          {/* Organizer-only approval / payout banners */}
          {isCreator && event.isPaid && isPending && (
            <View style={styles.bannerPending}>
              <Ionicons name="time-outline" size={18} color={AU.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Pending admin review</Text>
                <Text style={styles.bannerBody}>
                  Tickets will go on sale automatically once an admin approves. We do
                  this for every organizer's first paid event.
                </Text>
              </View>
            </View>
          )}
          {isCreator && event.isPaid && isRejected && (
            <View style={styles.bannerRejected}>
              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Not approved</Text>
                <Text style={styles.bannerBody}>
                  {event.approvalRejectReason ||
                    "This event wasn't approved. Contact support for details."}
                </Text>
              </View>
            </View>
          )}
          {isCreator &&
            event.isPaid &&
            event.approvalStatus === "approved" &&
            event.payoutStatus &&
            event.payoutStatus !== "released" && (
              <View style={styles.bannerInfo}>
                <Ionicons name="cash-outline" size={18} color={AU.purpleSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Payout held</Text>
                  <Text style={styles.bannerBody}>
                    Ticket revenue is held by NightVibe and released to your Stripe
                    account 48h after the event ends.
                  </Text>
                </View>
              </View>
            )}
          {isCreator &&
            event.isPaid &&
            event.payoutStatus === "released" &&
            event.payoutReleasedAt && (
              <View style={styles.bannerSuccess}>
                <Ionicons name="checkmark-circle-outline" size={18} color={AU.greenSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Payout released</Text>
                  <Text style={styles.bannerBody}>
                    Transferred to your Stripe account on{" "}
                    {new Date(event.payoutReleasedAt).toLocaleDateString()}.
                  </Text>
                </View>
              </View>
            )}

          {/* Pending invite — Accept / Decline */}
          {userIsPendingInvite && (
            <GlassCard>
              <Text style={styles.microLabel}>YOU'RE INVITED</Text>
              <Text style={styles.inviteBannerSub}>
                {event.createdBy.username} invited you to this event.
              </Text>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={[styles.inviteBtn, styles.inviteAcceptBtn]}
                  onPress={() => handleRespondInvite("accepted")}
                  disabled={inviteResponding}
                >
                  {inviteResponding ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.inviteAcceptText}>Accept</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inviteBtn, styles.inviteDeclineBtn]}
                  onPress={() => handleRespondInvite("declined")}
                  disabled={inviteResponding}
                >
                  <Text style={styles.inviteDeclineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}

          {/* Stats grid */}
          {!isCancelled && (
            <View style={styles.statsRow}>
              <GlassCard style={styles.statCard}>
                <Text style={styles.microLabel}>GOING</Text>
                <Text style={[styles.statValue, { color: AU.purpleSoft }]}>{goingCount}</Text>
                {event.maxGuests ? (
                  <Text style={styles.statSub}>of {event.maxGuests}</Text>
                ) : null}
              </GlassCard>

              <GlassCard style={styles.statCard}>
                <Text style={styles.microLabel}>CAPACITY</Text>
                <Text style={[styles.statValue, { color: capacityColor }]}>
                  {event.maxGuests ? `${capacityPct}%` : "—"}
                </Text>
                {event.maxGuests ? (
                  <Text style={styles.statSub}>
                    {Math.max(event.maxGuests - goingCount, 0)} left
                  </Text>
                ) : null}
              </GlassCard>

              <GlassCard style={styles.statCard}>
                <Text style={styles.microLabel}>FRIENDS</Text>
                <Text style={[styles.statValue, { color: AU.amber }]}>
                  {event.friendsGoing ?? 0}
                </Text>
                <Text style={styles.statSub}>going</Text>
              </GlassCard>
            </View>
          )}

          {/* Capacity bar */}
          {!isCancelled && !!event.maxGuests && (
            <GlassCard>
              <View style={styles.rowBetween}>
                <Text style={styles.microLabel}>FILLING UP</Text>
                <Text style={styles.capacityCount}>
                  {goingCount} / {event.maxGuests} guests
                </Text>
              </View>
              <View style={styles.capacityTrack}>
                <LinearGradient
                  colors={[AU.purple, AU.pink]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.capacityFill, { width: `${capacityPct}%` }]}
                />
              </View>
            </GlassCard>
          )}

          {/* About */}
          {!!event.description && (
            <GlassCard>
              <Text style={styles.microLabel}>ABOUT</Text>
              <Text style={styles.aboutBody}>{event.description}</Text>
            </GlassCard>
          )}

          {/* Host */}
          <GlassCard>
            <Text style={styles.microLabel}>HOSTED BY</Text>
            <View style={styles.hostRow}>
              {event.createdBy.profilePicture ? (
                <Image
                  source={{ uri: event.createdBy.profilePicture }}
                  style={styles.hostAvatar}
                />
              ) : (
                <View style={styles.hostAvatarFallback}>
                  <Text style={styles.hostAvatarInitials}>
                    {initialsOf(event.createdBy.username)}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostName}>{event.createdBy.username}</Text>
                  {event.createdBy.verified && (
                    <Text style={styles.hostVerified}> ✦</Text>
                  )}
                </View>
                <Text style={styles.hostSub}>
                  @{event.createdBy.username} ·{" "}
                  {event.createdBy.hostedEventsCount ?? 0} events hosted
                </Text>
              </View>
              {!isCreator && (
                <TouchableOpacity
                  onPress={handleFollowToggle}
                  disabled={followBusy}
                  style={[styles.followPill, isFollowingHost && styles.followingPill]}
                >
                  <Text
                    style={[
                      styles.followText,
                      isFollowingHost && styles.followingText,
                    ]}
                  >
                    {followBusy ? "…" : isFollowingHost ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>

          {/* Group chat */}
          {event.groupChatId && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/chat/${event.groupChatId!._id}` as any)}
              style={styles.groupChatCard}
            >
              <View style={styles.groupChatIconTile}>
                <Ionicons name="chatbubbles" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupChatTitle}>Group chat is live</Text>
                <Text style={styles.groupChatSub}>
                  {(event.groupChatUnread ?? 0) > 0
                    ? `${event.groupChatUnread} new message${event.groupChatUnread === 1 ? "" : "s"}`
                    : event.groupChatId.name || "Tap to open"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AU.purpleSoft} />
            </TouchableOpacity>
          )}

          {/* Vendors strip */}
          {event.vendors && event.vendors.length > 0 && (
            <View>
              <View style={styles.rowBetween}>
                <Text style={[styles.microLabel, { paddingHorizontal: 0 }]}>ON THE BILL</Text>
                {isCreator && (
                  <TouchableOpacity onPress={() => setVendorSearchVisible(true)}>
                    <Text style={styles.seeAll}>Manage</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
              >
                {event.vendors.map((vendor) => {
                  const color = vendorAccentColor(vendor._id || vendor.name);
                  const vt =
                    typeof vendor.vendorType === "object"
                      ? vendor.vendorType?.name
                      : (vendor.vendorType as string | undefined);
                  return (
                    <TouchableOpacity
                      key={vendor._id}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({
                          pathname: "/vendor-details/[vendorId]",
                          params: { vendorId: vendor._id, vendorName: vendor.name },
                        } as any)
                      }
                      onLongPress={
                        isCreator ? () => handleRemoveVendor(vendor._id) : undefined
                      }
                      style={[
                        styles.vendorCard,
                        { borderColor: `${color}66` },
                      ]}
                    >
                      <LinearGradient
                        colors={[`${color}33`, "rgba(26,16,48,0.75)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Text style={styles.vendorEmoji}>✦</Text>
                      <Text style={styles.vendorName}>{vendor.name}</Text>
                      {!!vt && <Text style={styles.vendorTag}>{vt}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Add vendor empty-state for organizers */}
          {isCreator && (!event.vendors || event.vendors.length === 0) && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setVendorSearchVisible(true)}
              style={styles.addVendorEmpty}
            >
              <Ionicons name="add-circle-outline" size={18} color={AU.purpleSoft} />
              <Text style={styles.addVendorEmptyText}>Add vendors to the lineup</Text>
            </TouchableOpacity>
          )}

          {/* Attendees */}
          {!isCancelled && event.rsvpUsers && event.rsvpUsers.length > 0 && (
            <GlassCard style={styles.attendeesCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.microLabel}>WHO'S COMING</Text>
                <Text style={styles.attendeesHeadline}>
                  {goingCount} going
                  {(event.friendsGoing ?? 0) > 0 ? (
                    <>
                      <Text style={styles.attendeesSep}> · </Text>
                      <Text style={styles.attendeesFriends}>
                        {event.friendsGoing} friend{event.friendsGoing === 1 ? "" : "s"}
                      </Text>
                    </>
                  ) : null}
                </Text>
              </View>
              <View style={styles.avatarStack}>
                {event.rsvpUsers.slice(0, 4).map((u, i) => (
                  <View
                    key={u._id}
                    style={[
                      styles.attendeeAvatarWrap,
                      i > 0 && { marginLeft: -9 },
                      { zIndex: 10 - i },
                    ]}
                  >
                    {u.profilePicture ? (
                      <Image
                        source={{ uri: u.profilePicture }}
                        style={styles.attendeeAvatar}
                      />
                    ) : (
                      <View style={styles.attendeeAvatarFallback}>
                        <Text style={styles.attendeeInitials}>
                          {initialsOf(u.username)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
                {event.rsvpUsers.length > 4 && (
                  <View
                    style={[
                      styles.attendeeAvatarWrap,
                      styles.attendeePlus,
                      { marginLeft: -9 },
                    ]}
                  >
                    <Text style={styles.attendeePlusText}>
                      +{event.rsvpUsers.length - 4}
                    </Text>
                  </View>
                )}
              </View>
            </GlassCard>
          )}
        </View>
      </ScrollView>

      {/* ─── STICKY CTA BAR ───────────────────────────────── */}
      {!isCancelled && (
        <View style={styles.stickyBarWrap} pointerEvents="box-none">
          <LinearGradient
            colors={["rgba(11,6,19,0)", AU.bg]}
            locations={[0, 0.5]}
            style={styles.stickyFade}
            pointerEvents="none"
          />
          <SafeAreaView edges={["bottom"]} style={styles.stickyBarSafe}>
            <StickyCTA
              event={event}
              isCreator={!!isCreator}
              userIsGoing={userIsGoing}
              userHasTicket={userHasTicket}
              soldOut={soldOut}
              userIsInvited={userIsInvited}
              userIsPendingInvite={userIsPendingInvite}
              userHasRequested={userHasRequested}
              purchasing={purchasing}
              rsvpLoading={rsvpLoading}
              requestingJoin={requestingJoin}
              onPurchase={handlePurchaseTicket}
              onRsvp={() => handleRsvp("going")}
              onCancelRsvp={() => handleRsvp("not_going")}
              onRequestJoin={handleRequestToJoin}
              onViewTicket={() => router.push("/tickets" as any)}
            />
          </SafeAreaView>
        </View>
      )}

      {/* ─── OVERFLOW ⋯ ACTION SHEET ───────────────────────── */}
      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetVisible(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setActionSheetVisible(false)}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheetWrap}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetGrabber} />
            <SheetAction
              icon="share-outline"
              label="Share event"
              onPress={() => {
                setActionSheetVisible(false);
                // Wait for the action sheet modal to finish dismissing before
                // presenting the share sheet — iOS won't present a new modal
                // while another is still transitioning out.
                setTimeout(() => setShareSheetVisible(true), 320);
              }}
            />
            <SheetAction
              icon="calendar-outline"
              label="Add to calendar"
              onPress={() => {
                setActionSheetVisible(false);
                Alert.alert("Coming soon", "Calendar export isn't wired up yet.");
              }}
            />
            {isCreator && (
              <>
                <SheetAction
                  icon="person-add-outline"
                  label="Invite people"
                  onPress={() => {
                    setActionSheetVisible(false);
                    setIsInviteModalVisible(true);
                  }}
                />
                <SheetAction
                  icon="briefcase-outline"
                  label="Manage vendors"
                  onPress={() => {
                    setActionSheetVisible(false);
                    setVendorSearchVisible(true);
                  }}
                />
              </>
            )}
            {event.isPaid && userHasTicket && (
              <SheetAction
                icon="return-down-back-outline"
                label={refunding ? "Refunding…" : "Refund ticket"}
                onPress={() => {
                  setActionSheetVisible(false);
                  handleRefundOwnTicket();
                }}
              />
            )}
            {!isCreator && (
              <SheetAction
                icon="flag-outline"
                label="Report event"
                destructive
                onPress={() => {
                  setActionSheetVisible(false);
                  setReportSheetVisible(true);
                }}
              />
            )}
            <SheetAction
              icon="close"
              label="Cancel"
              muted
              onPress={() => setActionSheetVisible(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Report sheet (kept) */}
      {event && !isCreator ? (
        <ReportBlockSheet
          visible={reportSheetVisible}
          onClose={() => setReportSheetVisible(false)}
          targetType="event"
          targetId={event._id}
          targetUserId={event.createdBy?._id}
          targetUsername={event.createdBy?.username}
          currentUserId={currentUserId}
          onBlocked={() => router.back()}
        />
      ) : null}

      {/* Share sheet — internal (chat) + external (OS share) */}
      <ShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        target={shareTarget}
      />

      {/* ─── INVITE USER MODAL (preserved) ─────────────────── */}
      <Modal
        visible={isInviteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsInviteModalVisible(false);
          setUserSearchQuery("");
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
              setUserSearchQuery("");
              setSearchedUsers([]);
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite User</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsInviteModalVisible(false);
                  setUserSearchQuery("");
                  setSearchedUsers([]);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={AU.textMute} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by username or email..."
                  placeholderTextColor={AU.textMute}
                  value={userSearchQuery}
                  onChangeText={setUserSearchQuery}
                  autoCapitalize="none"
                  autoFocus
                />
              </View>
              {searchingUsers && (
                <ActivityIndicator size="small" color={AU.purpleSoft} style={{ marginTop: 16 }} />
              )}
              <FlatList
                data={searchedUsers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchRow}
                    onPress={() => handleInviteUser(item)}
                  >
                    {item.profilePicture ? (
                      <Image
                        source={{ uri: item.profilePicture }}
                        style={styles.searchAvatar}
                      />
                    ) : (
                      <View style={styles.searchAvatarFallback}>
                        <Text style={styles.attendeeInitials}>
                          {initialsOf(item.username)}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.searchName}>{item.username}</Text>
                      <Text style={styles.searchSub}>
                        {item.isVendor && item.businessName ? item.businessName : item.email}
                      </Text>
                    </View>
                    {item.isVendor && (
                      <View style={styles.vendorBadge}>
                        <Text style={styles.vendorBadgeText}>Vendor</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  !searchingUsers && userSearchQuery.length >= 2 ? (
                    <Text style={styles.emptyHint}>No users found</Text>
                  ) : !searchingUsers ? (
                    <Text style={styles.emptyHint}>Type at least 2 characters to search</Text>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── BROWSE VENDORS MODAL (preserved) ──────────────── */}
      <Modal
        visible={vendorSearchVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setVendorSearchVisible(false);
          setVendorQuery("");
          setVendorResults([]);
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
              setVendorSearchVisible(false);
              setVendorQuery("");
              setVendorResults([]);
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Browse Vendors</Text>
              <TouchableOpacity
                onPress={() => {
                  setVendorSearchVisible(false);
                  setVendorQuery("");
                  setVendorResults([]);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={AU.textMute} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search vendors by name..."
                  placeholderTextColor={AU.textMute}
                  value={vendorQuery}
                  onChangeText={handleVendorSearch}
                  autoFocus
                />
              </View>
              {searchingVendors && (
                <ActivityIndicator size="small" color={AU.purpleSoft} style={{ marginTop: 16 }} />
              )}
              <FlatList
                data={vendorResults}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const already = event?.vendors?.some((v) => v._id === item._id);
                  return (
                    <TouchableOpacity
                      style={styles.searchRow}
                      onPress={() => !already && handleAddVendor(item._id)}
                      disabled={already || addingVendor === item._id}
                    >
                      {item.images && item.images.length > 0 ? (
                        <Image
                          source={{ uri: item.images[0] }}
                          style={styles.searchAvatar}
                        />
                      ) : (
                        <View style={styles.searchAvatarFallback}>
                          <Ionicons name="briefcase" size={22} color={AU.purpleSoft} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.searchName}>{item.name}</Text>
                        {item.rating ? (
                          <Text style={styles.searchSub}>★ {item.rating}</Text>
                        ) : null}
                      </View>
                      {already ? (
                        <View style={styles.vendorBadge}>
                          <Text style={styles.vendorBadgeText}>Added</Text>
                        </View>
                      ) : addingVendor === item._id ? (
                        <ActivityIndicator size="small" color={AU.purpleSoft} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={24} color={AU.purpleSoft} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  !searchingVendors && vendorQuery.length >= 2 ? (
                    <Text style={styles.emptyHint}>No vendors found</Text>
                  ) : !searchingVendors ? (
                    <Text style={styles.emptyHint}>Type to search vendors</Text>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Sticky CTA computes label/variant entirely from the event state flags ───
function StickyCTA(props: {
  event: Event;
  isCreator: boolean;
  userIsGoing: boolean;
  userHasTicket: boolean;
  soldOut: boolean;
  userIsInvited: boolean;
  userIsPendingInvite: boolean;
  userHasRequested: boolean;
  purchasing: boolean;
  rsvpLoading: boolean;
  requestingJoin: boolean;
  onPurchase: () => void;
  onRsvp: () => void;
  onCancelRsvp: () => void;
  onRequestJoin: () => void;
  onViewTicket: () => void;
}) {
  const {
    event,
    isCreator,
    userIsGoing,
    userHasTicket,
    soldOut,
    userIsPendingInvite,
    userHasRequested,
    purchasing,
    rsvpLoading,
    requestingJoin,
    onPurchase,
    onRsvp,
    onCancelRsvp,
    onRequestJoin,
    onViewTicket,
  } = props;

  // Pending invite: handled inline above with Accept/Decline; hide sticky.
  if (userIsPendingInvite || isCreator) return null;

  // Sold out — disabled, no shadow.
  if (soldOut && !userHasTicket) {
    return (
      <View style={styles.ctaPill}>
        <PriceBlock event={event} />
        <View style={[styles.ctaBtn, styles.ctaBtnDisabled]}>
          <Text style={styles.ctaBtnDisabledText}>Sold out</Text>
        </View>
      </View>
    );
  }

  // Already has a ticket
  if (userHasTicket) {
    return (
      <View style={styles.ctaPill}>
        <PriceBlock event={event} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onViewTicket}
          style={styles.ctaBtn}
        >
          <LinearGradient
            colors={[AU.purple, AU.purpleDeep, AU.pink]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.ctaBtnGradient}
          />
          <Text style={styles.ctaBtnText}>View your ticket →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Already RSVP'd to a free event
  if (!event.isPaid && userIsGoing) {
    return (
      <View style={styles.ctaPill}>
        <PriceBlock event={event} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCancelRsvp}
          disabled={rsvpLoading}
          style={[styles.ctaBtn, styles.ctaBtnLight]}
        >
          <Text style={styles.ctaBtnLightText}>You're going ✓</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Invite-only and not invited → request to join
  if (!event.isPublic && !props.userIsInvited) {
    return (
      <View style={styles.ctaPill}>
        <PriceBlock event={event} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onRequestJoin}
          disabled={requestingJoin || userHasRequested}
          style={[styles.ctaBtn, userHasRequested && styles.ctaBtnLight]}
        >
          {!userHasRequested && (
            <LinearGradient
              colors={[AU.purple, AU.purpleDeep, AU.pink]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaBtnGradient}
            />
          )}
          <Text style={userHasRequested ? styles.ctaBtnLightText : styles.ctaBtnText}>
            {userHasRequested ? "Request sent ✓" : requestingJoin ? "Sending…" : "Request to join →"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Paid → Get ticket. If the organizer hasn't finished payout onboarding
  // (or the event isn't approved yet), show a graceful "not on sale" state
  // instead of letting the user tap into a Stripe failure.
  if (event.isPaid) {
    if (event.ticketingReady === false) {
      return (
        <View style={styles.ctaPill}>
          <PriceBlock event={event} />
          <View style={[styles.ctaBtn, styles.ctaBtnDisabled]}>
            <Text style={styles.ctaBtnDisabledText}>Not on sale yet</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.ctaPill}>
        <PriceBlock event={event} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPurchase}
          disabled={purchasing}
          style={styles.ctaBtn}
        >
          <LinearGradient
            colors={[AU.purple, AU.purpleDeep, AU.pink]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.ctaBtnGradient}
          />
          <Text style={styles.ctaBtnText}>
            {purchasing ? "Charging…" : "Get ticket →"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Free → RSVP
  return (
    <View style={styles.ctaPill}>
      <PriceBlock event={event} />
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onRsvp}
        disabled={rsvpLoading}
        style={styles.ctaBtn}
      >
        <LinearGradient
          colors={[AU.purple, AU.purpleDeep, AU.pink]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.ctaBtnGradient}
        />
        <Text style={styles.ctaBtnText}>{rsvpLoading ? "…" : "RSVP →"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function PriceBlock({ event }: { event: Event }) {
  return (
    <View style={styles.priceBlock}>
      <Text style={styles.priceLabel}>{event.isPaid ? "TICKET" : "FREE"}</Text>
      {event.isPaid && (
        <Text style={styles.priceValue}>${event.ticketPrice?.toFixed(0) ?? "—"}</Text>
      )}
    </View>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
  destructive,
  muted,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  muted?: boolean;
}) {
  const color = destructive ? "#ef4444" : muted ? AU.textMute : AU.text;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.sheetRow}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.sheetRowText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  scrollContent: { paddingBottom: 140 },

  // ── Hero
  hero: {
    height: HERO_HEIGHT,
    width: "100%",
    position: "relative",
    backgroundColor: AU.surface,
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroFallback: { ...StyleSheet.absoluteFillObject },
  heroEmoji: {
    position: "absolute",
    right: -30,
    top: 20,
    fontSize: 260,
    opacity: 0.22,
    transform: [{ rotate: "-12deg" }],
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  topChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topChromeRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topChromeRight: { flexDirection: "row", gap: 8 },
  glassRound: {
    backgroundColor: "rgba(11,6,19,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: {
    position: "absolute",
    top: 110,
    left: 18,
    right: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    zIndex: 5,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipPink: {
    backgroundColor: "rgba(236,72,153,0.18)",
    borderColor: "rgba(236,72,153,0.3)",
  },
  chipDark: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.44,
  },
  heroBottom: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 24,
    zIndex: 2,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 38,
    lineHeight: 38 * 0.94,
    letterSpacing: -1.33,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  heroMetaText: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginHorizontal: 4,
  },

  // ── Content
  content: { paddingHorizontal: 18, paddingTop: 16, gap: 14 },

  microLabel: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: AU.textMute,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // Banners
  cancelledBanner: {
    backgroundColor: "rgba(236,72,153,0.18)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.4)",
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  cancelledTitle: {
    color: AU.pinkSoft,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  cancelledBody: {
    color: "rgba(244,238,255,0.85)",
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerPending: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  bannerRejected: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  bannerInfo: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.10)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.3)",
  },
  bannerSuccess: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(52,211,153,0.10)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.3)",
  },
  bannerTitle: { color: AU.text, fontFamily: Fonts.bold, fontSize: 14, marginBottom: 2 },
  bannerBody: { color: AU.textDim, fontFamily: Fonts.regular, fontSize: 12.5, lineHeight: 17 },

  inviteBannerSub: {
    color: AU.textDim,
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 6,
  },
  inviteActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  inviteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteAcceptBtn: { backgroundColor: AU.purple },
  inviteAcceptText: { color: "#fff", fontFamily: Fonts.bold, fontSize: 14 },
  inviteDeclineBtn: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  inviteDeclineText: { color: "#ef4444", fontFamily: Fonts.bold, fontSize: 14 },

  // Stats grid
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, gap: 6 },
  statValue: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    letterSpacing: -0.44,
    lineHeight: 22,
    marginTop: 2,
  },
  statSub: {
    fontFamily: Fonts.regular,
    fontSize: 10.5,
    color: AU.textDim,
  },

  // Capacity bar
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  capacityCount: {
    color: AU.text,
    fontFamily: Fonts.bold,
    fontSize: 11,
  },
  capacityTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
    overflow: "hidden",
  },
  capacityFill: {
    height: 8,
    borderRadius: 4,
  },

  // About
  aboutBody: {
    color: AU.text,
    fontFamily: Fonts.regular,
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 8,
  },

  // Host
  hostRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  hostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.4)",
  },
  hostAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.4)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AU.surface,
  },
  hostAvatarInitials: {
    color: AU.text,
    fontFamily: Fonts.bold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  hostNameRow: { flexDirection: "row", alignItems: "center" },
  hostName: {
    color: AU.text,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    letterSpacing: -0.15,
  },
  hostVerified: {
    color: AU.purpleSoft,
    fontSize: 15,
  },
  hostSub: {
    color: AU.textDim,
    fontFamily: Fonts.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  followPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: AU.strokeHi,
  },
  followingPill: {
    backgroundColor: "rgba(52,211,153,0.16)",
    borderColor: "transparent",
  },
  followText: {
    color: AU.text,
    fontFamily: Fonts.bold,
    fontSize: 11.5,
  },
  followingText: { color: AU.greenSoft },

  // Group chat
  groupChatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.35)",
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  groupChatIconTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AU.purple,
    shadowColor: AU.purple,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  groupChatTitle: {
    color: AU.text,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 14,
    letterSpacing: -0.14,
  },
  groupChatSub: {
    color: AU.textDim,
    fontFamily: Fonts.regular,
    fontSize: 11.5,
    marginTop: 2,
  },

  // Vendors
  seeAll: { color: AU.purpleSoft, fontFamily: Fonts.bold, fontSize: 11 },
  vendorCard: {
    minWidth: 138,
    marginRight: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(26,16,48,0.75)",
  },
  vendorEmoji: {
    position: "absolute",
    right: -6,
    bottom: -10,
    fontSize: 50,
    opacity: 0.45,
    color: "#fff",
  },
  vendorName: {
    color: AU.text,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 13,
    letterSpacing: -0.13,
  },
  vendorTag: {
    color: AU.textDim,
    fontFamily: Fonts.semiBold,
    fontSize: 10.5,
    marginTop: 2,
  },
  addVendorEmpty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AU.stroke,
    borderStyle: "dashed",
    backgroundColor: "rgba(26,16,48,0.5)",
  },
  addVendorEmptyText: {
    color: AU.purpleSoft,
    fontFamily: Fonts.bold,
    fontSize: 12.5,
  },

  // Attendees
  attendeesCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  attendeesHeadline: {
    color: AU.text,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 16,
    letterSpacing: -0.16,
    marginTop: 4,
  },
  attendeesSep: { color: AU.textDim },
  attendeesFriends: { color: AU.amber },
  avatarStack: { flexDirection: "row", alignItems: "center" },
  attendeeAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AU.surface,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: AU.bg,
  },
  attendeeAvatar: { width: "100%", height: "100%" },
  attendeeAvatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AU.surface,
  },
  attendeeInitials: {
    color: AU.text,
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  attendeePlus: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  attendeePlusText: {
    color: "#fff",
    fontFamily: Fonts.bold,
    fontSize: 11,
  },

  // Sticky CTA
  stickyBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  stickyFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 110 },
  stickyBarSafe: { paddingHorizontal: 16, paddingTop: 14 },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 6,
    borderRadius: 18,
    backgroundColor: "rgba(26,16,48,0.9)",
    borderWidth: 1,
    borderColor: AU.strokeHi,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  priceBlock: { paddingVertical: 8, paddingHorizontal: 12 },
  priceLabel: {
    color: AU.textMute,
    fontFamily: Fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
  },
  priceValue: {
    color: AU.text,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    letterSpacing: -0.44,
    lineHeight: 22,
    marginTop: 2,
  },
  ctaBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: AU.purple,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  ctaBtnGradient: { ...StyleSheet.absoluteFillObject },
  ctaBtnText: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 16,
    letterSpacing: -0.16,
  },
  ctaBtnLight: { backgroundColor: AU.text, shadowOpacity: 0 },
  ctaBtnLightText: {
    color: AU.bg,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 16,
    letterSpacing: -0.16,
  },
  ctaBtnDisabled: { backgroundColor: "rgba(255,255,255,0.08)", shadowOpacity: 0 },
  ctaBtnDisabledText: {
    color: AU.textMute,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 16,
    letterSpacing: -0.16,
  },

  // Action sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: "rgba(26,16,48,0.96)",
    borderWidth: 1,
    borderColor: AU.strokeHi,
    paddingVertical: 6,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: AU.stroke,
    marginVertical: 8,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  sheetRowText: { fontFamily: Fonts.semiBold, fontSize: 15 },

  // Modal (preserved)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBackdrop: { flex: 1 },
  modalContent: {
    backgroundColor: AU.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: AU.stroke,
  },
  modalTitle: { color: "#fff", fontFamily: Fonts.bold, fontSize: 20 },
  closeButton: { padding: 4 },
  modalBody: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 12 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    marginTop: 4,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, color: "#fff", fontSize: 15 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: AU.stroke,
  },
  searchAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: AU.surface },
  searchAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AU.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  searchName: { color: AU.text, fontFamily: Fonts.semiBold, fontSize: 14 },
  searchSub: { color: AU.textDim, fontFamily: Fonts.regular, fontSize: 12, marginTop: 2 },
  vendorBadge: {
    backgroundColor: AU.purple,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vendorBadgeText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: 11 },
  emptyHint: {
    color: AU.textMute,
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 32,
  },
});
