import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  AppState,
  FlatList,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { currencyPrefix } from "@/constants/payments";
import CreateEventModal from "@/components/client/CreateEventModal";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import ExternalEventCard from "@/components/shared/ExternalEventCard";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import { useStripePayment } from "@/hooks/useStripePayment";
import { trackEvent } from "@/utils/analytics";
import { ensureAuth } from "@/utils/requireAuth";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

function Skeleton({ width, height, borderRadius = 10, style }: { width: number | string; height: number; borderRadius?: number; style?: any }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.cardAlt, opacity }, style]}
    />
  );
}

function HeroSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.heroCard, { overflow: "hidden" }]}>
      <Skeleton width="100%" height={320} borderRadius={24} />
    </View>
  );
}

function SmallCardSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.smallCard, { overflow: "hidden", marginRight: 12 }]}>
      <Skeleton width={160} height={100} borderRadius={0} />
      <View style={{ padding: 10, gap: 6 }}>
        <Skeleton width={120} height={12} />
        <Skeleton width={80} height={10} />
        <Skeleton width="100%" height={28} borderRadius={8} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

function VendorCardSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.vendorCard, { overflow: "hidden", marginRight: 12 }]}>
      <Skeleton width="100%" height={100} borderRadius={0} />
      <View style={{ padding: 10, gap: 6 }}>
        <Skeleton width={100} height={12} />
        <Skeleton width={70} height={10} />
      </View>
    </View>
  );
}

interface Vendor {
  _id: string;
  vendorName?: string;
  businessName?: string;
  username?: string;
  category?: string;
  vendorType?: string;
  profilePicture?: string;
  image?: string;
}

interface TopGuide {
  _id: string;
  title: string;
  authorName: string;
  price: number;
  currency?: string;
  city: string;
  coverImage?: string;
  topic: string;
  views: number;
  salesCount: number;
}

const TOPIC_EMOJI: Record<string, string> = {
  Chefs: "👨‍🍳",
  "Food and Restaurants": "🍽️",
  "Music and Bands": "🎸",
  "Bars and Clubs": "🍸",
  Casinos: "🎰",
  Concerts: "🎤",
  Events: "🎉",
  Transportation: "🚕",
  Venues: "🏛️",
  Florists: "💐",
  Decorations: "🎈",
  Desserts: "🍰",
  Beverages: "🥤",
  "Grocery stores": "🛒",
  Museums: "🖼️",
  Parks: "🌳",
  Hotels: "🏨",
  Spas: "💆",
  "Hair and Nail Salons": "💅",
  "Barber Shops": "💈",
};

// Height of the tab layout's home navbar (paddingTop 50 + 40pt row + 16).
// On iOS the navbar overlays this screen (see navbarOverlay in the tab
// layout), so the scroll content pads itself below it; the automatic content
// inset already contributes the top safe area, hence the subtraction.
const NAVBAR_OVERLAY_HEIGHT = 106;

const QUICK_ACTIONS = [
  { icon: "home-outline" as const, label: "House Party", color: "#A855F7" },
  { icon: "ticket-outline" as const, label: "Ticketed Event", color: "#EC4899" },
  { icon: "walk-outline" as const, label: "Bar Crawl", color: "#22D3EE" },
  { icon: "briefcase-outline" as const, label: "Book Vendor", color: "#F59E0B" },
];

function SectionHeader({ title, subtitle, onAction, actionLabel }: { title: string; subtitle?: string; onAction?: () => void; actionLabel?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {onAction && actionLabel && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SmallEventCard({
  event,
  onPress,
  onPurchase,
  onJoin,
}: {
  event: PublicEvent;
  onPress: () => void;
  onPurchase: (id: string, title: string) => void;
  onJoin: (id: string, title: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const owned = event.isCreator || event.userHasPurchased || event.userStatus === "accepted";

  return (
    <TouchableOpacity style={styles.smallCard} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={[colors.cardGradientStart, colors.cardGradientEnd]} style={styles.smallCardInner}>
        <View style={styles.smallCardImageWrap}>
          {event.image ? (
            <Image source={{ uri: event.image }} style={styles.smallCardImage} contentFit="cover" />
          ) : (
            <View style={[styles.smallCardImage, { backgroundColor: colors.cardAlt, justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="calendar" size={24} color={colors.primary} />
            </View>
          )}
          {/* Price badge */}
          <View style={[styles.smallCardBadge, event.isPaid ? styles.smallCardBadgePaid : styles.smallCardBadgeFree]}>
            <Text style={styles.smallCardBadgeText}>
              {event.isPaid ? `${currencyPrefix(event.currency)}${event.ticketPrice ?? ""}` : "FREE"}
            </Text>
          </View>
        </View>

        <View style={styles.smallCardContent}>
          <Text style={styles.smallCardTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.smallCardDate} numberOfLines={1}>
            {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>

          {owned ? (
            <View style={styles.smallCardOwned}>
              <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
              <Text style={styles.smallCardOwnedText}>
                {event.isCreator ? "Hosting" : "Going"}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.smallCardAction, event.isPaid && styles.smallCardActionPaid]}
              activeOpacity={0.85}
              onPress={(e) => {
                e.stopPropagation();
                if (event.isPaid) {
                  onPurchase(event._id, event.title);
                } else {
                  onJoin(event._id, event.title);
                }
              }}
            >
              <Text style={styles.smallCardActionText}>
                {event.isPaid ? "Get Ticket" : "Join Free"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Compact card for third-party (Ticketmaster etc) events, sized to match
// SmallEventCard so they sit naturally in the same horizontal "this week" row.
// Tapping anywhere opens the external-event detail screen.
function SmallExternalEventCard({
  event,
  onPress,
}: {
  event: ExternalEvent;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const sym = currencyPrefix(event.currency);
  const priceLabel =
    event.priceMin != null ? `${sym}${Math.round(event.priceMin)}` : "TICKETS";

  return (
    <TouchableOpacity style={styles.smallCard} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={[colors.cardGradientStart, colors.cardGradientEnd]} style={styles.smallCardInner}>
        <View style={styles.smallCardImageWrap}>
          {event.image ? (
            <Image source={{ uri: event.image }} style={styles.smallCardImage} contentFit="cover" />
          ) : (
            <View style={[styles.smallCardImage, { backgroundColor: colors.cardAlt, justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="calendar" size={24} color={colors.primary} />
            </View>
          )}
          <View style={[styles.smallCardBadge, styles.smallCardBadgePaid]}>
            <Text style={styles.smallCardBadgeText}>{priceLabel}</Text>
          </View>
        </View>

        <View style={styles.smallCardContent}>
          <Text style={styles.smallCardTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.smallCardDate} numberOfLines={1}>
            {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          <View style={[styles.smallCardAction, styles.smallCardActionPaid]}>
            <Text style={styles.smallCardActionText}>View Tickets</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function VendorCard({ vendor, onPress }: { vendor: Vendor; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const name = vendor.vendorName || vendor.businessName || vendor.username || "Vendor";
  const type = vendor.category || vendor.vendorType || "";
  return (
    <TouchableOpacity style={styles.vendorCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.vendorCardImage}>
        {vendor.profilePicture || vendor.image ? (
          <Image
            source={{ uri: vendor.profilePicture || vendor.image }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="briefcase" size={28} color="#fff" />
          </LinearGradient>
        )}
      </View>
      <View style={styles.vendorCardContent}>
        <Text style={styles.vendorCardName} numberOfLines={1}>{name}</Text>
        {!!type && <Text style={styles.vendorCardType} numberOfLines={1}>{type}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function GuideCard({ guide, onPress }: { guide: TopGuide; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const emoji = TOPIC_EMOJI[guide.topic] || "📍";
  return (
    <TouchableOpacity style={styles.guideCard} onPress={onPress} activeOpacity={0.85}>
      {guide.coverImage ? (
        <Image
          source={{ uri: guide.coverImage }}
          style={styles.guideCardBanner}
          contentFit="cover"
        />
      ) : (
        <LinearGradient colors={[colors.cardGradientStart, colors.cardGradientEnd]} style={styles.guideCardBanner}>
          <Text style={styles.guideCardEmoji}>{emoji}</Text>
        </LinearGradient>
      )}
      <View style={styles.guideCardContent}>
        <Text style={styles.guideCardTitle} numberOfLines={2}>{guide.title}</Text>
        <Text style={styles.guideCardMeta} numberOfLines={1}>
          {guide.city} · by {guide.authorName}
        </Text>
        <View style={styles.guideCardFooter}>
          <View style={styles.guideTopicBadge}>
            <Text style={styles.guideTopicText} numberOfLines={1}>{guide.topic}</Text>
          </View>
          <Text style={styles.guideCardPrice}>
            {guide.price === 0 ? "FREE" : `${currencyPrefix(guide.currency)}${guide.price}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function GuideCardSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.guideCard, { overflow: "hidden" }]}>
      <Skeleton width="100%" height={70} borderRadius={0} />
      <View style={{ padding: 12, gap: 8 }}>
        <Skeleton width="100%" height={14} />
        <Skeleton width={120} height={10} />
        <Skeleton width="100%" height={22} borderRadius={8} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

export default function Home() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isIpad = Platform.OS === "ios" && Platform.isPad;
  const { payForTicket } = useStripePayment();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [highlights, setHighlights] = useState<{
    trending: PublicEvent[];
    upcoming: PublicEvent[];
    myUpcoming: PublicEvent[];
  }>({ trending: [], upcoming: [], myUpcoming: [] });
  // External (Ticketmaster etc) events, fetched in parallel with publicEvents.
  // Currently surfaced in the "Trending Now" carousel mixed with native events.
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [topGuides, setTopGuides] = useState<TopGuide[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Morning";
    if (h < 18) return "Afternoon";
    return "Evening";
  };

  const getGreetingEmoji = () => {
    const h = new Date().getHours();
    if (h < 12) return "☀️";
    if (h < 18) return "🌤️";
    return "🌙";
  };

  const fetchPublicEvents = async (city?: string | null, silent = false) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${BASE_URL}/events/public/explore?limit=10${cityParam}`, {
        headers,
      });
      const data = await response.json();
      if (response.ok) {
        setPublicEvents(data.events || []);
      }
    } catch {}
  };

  /**
   * External events from third-party providers (Ticketmaster etc), surfaced
   * alongside native events in the Trending carousel. Failure is silent —
   * the rest of the home tab works fine without them.
   */
  const fetchExternalEvents = async (city?: string | null) => {
    try {
      const res = await externalEventService.explore({
        city: city || undefined,
        limit: 10,
      });
      setExternalEvents(res.events || []);
    } catch (err) {
      console.warn("[Home] external events fetch failed:", err);
      setExternalEvents([]);
    }
  };

  const fetchHighlights = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${BASE_URL}/events/highlights`, {
        headers,
      });
      const data = await response.json();
      if (response.ok) {
        setHighlights({
          trending: data.trending || [],
          upcoming: data.upcoming || [],
          myUpcoming: data.myUpcoming || [],
        });
      }
    } catch {}
  };

  const fetchVendors = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${BASE_URL}/vendors/search?query=&limit=10`, {
        headers,
      });
      const data = await response.json();
      if (response.ok) {
        setVendors(data.vendors || data || []);
      }
    } catch {}
  };

  const fetchTopGuides = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${BASE_URL}/guides/top?limit=10`, { headers });
      const data = await response.json();
      if (response.ok) setTopGuides(data.guides || []);
    } catch {}
  };

  const fetchUsername = async () => {
    try {
      const userJson = await SecureStore.getItemAsync("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        setUsername(u.username || "");
        return;
      }
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setUsername(data.user?.username || "");
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchPublicEvents(selectedCity, true),
      fetchExternalEvents(selectedCity),
      fetchHighlights(),
      fetchVendors(),
      fetchTopGuides(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchUsername();
    Promise.all([
      fetchPublicEvents(null),
      fetchExternalEvents(null),
      fetchHighlights(),
      fetchVendors(),
      fetchTopGuides(),
    ]).finally(() => setInitialLoading(false));

    intervalRef.current = setInterval(() => {
      fetchPublicEvents(selectedCity, true);
    }, 30000);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        fetchPublicEvents(selectedCity, true);
        fetchHighlights();
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, []);

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    if (!(await ensureAuth("buy a ticket"))) return;
    // The hook runs checkout AND confirms server-side before returning.
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.code === "tier_required") {
        // Multi-tier event — the detail screen owns the tier picker.
        router.push(`/event/${eventId}` as any);
        return;
      }
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }

    const token = await SecureStore.getItemAsync("token");
    trackEvent("ticket_purchased", { eventId, eventTitle });
    Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
    fetch(`${BASE_URL}/notifications/sold`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ticket", id: eventId }),
    }).catch(() => {});
    fetchPublicEvents();
  };

  const handleRsvp = async (eventId: string, action: "accept" | "decline") => {
    if (!(await ensureAuth("RSVP to this event"))) return;
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const response = await fetch(`${BASE_URL}/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        if (action === "accept") {
          Alert.alert("You're in!", "RSVP confirmed.");
        } else {
          Alert.alert("RSVP declined.");
        }
        fetchHighlights();
      } else {
        const d = await response.json();
        Alert.alert("Error", d.message || "Failed to RSVP");
      }
    } catch {
      Alert.alert("Error", "Failed to RSVP");
    }
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    if (!(await ensureAuth("join this event"))) return;
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const response = await fetch(`${BASE_URL}/events/${eventId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success!", `You've joined "${eventTitle}"`);
        fetchPublicEvents();
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch {
      Alert.alert("Error", "Failed to join event");
    }
  };

  // ── Home hero selection ──────────────────────────────────────────────────
  // 1. If the user has any event they're hosting / RSVP'd to / paid for, the
  //    soonest one is the hero (backend returns these in `myUpcoming`, date-asc).
  // 2. Otherwise, promote the first item of the "After that" carousel (the mixed
  //    native + external feed) into the hero and drop it from the carousel.
  //    A promoted external event gets a "Read more" button.
  const myHero = highlights.myUpcoming?.[0] || null;

  // Native pool for the carousel — general upcoming events (falls back to the
  // public-events list), minus whatever is shown as the hero so it isn't dupes.
  const nativePool = highlights.upcoming.length ? highlights.upcoming : publicEvents;

  // In-app events lead the feed (date-asc); external (Ticketmaster etc.)
  // suggestions only follow after every native event. This also means the
  // hero promotion below prefers a native event whenever one exists.
  const baseFeed = [
    ...nativePool
      .filter((e) => e._id !== myHero?._id)
      .map((e) => ({ _kind: "native" as const, data: e, sort: new Date(e.date).getTime() }))
      .sort((a, b) => a.sort - b.sort),
    ...externalEvents
      .map((e) => ({ _kind: "external" as const, data: e, sort: new Date(e.date).getTime() }))
      .sort((a, b) => a.sort - b.sort),
  ];

  // Resolve hero + the carousel feed. When there's no personal event, the first
  // feed item is promoted to the hero and removed from the carousel.
  let resolvedHero: PublicEvent | null = myHero;
  let resolvedExternal: ExternalEvent | null = null;
  let resolvedFeed = baseFeed;
  if (!resolvedHero && baseFeed.length > 0) {
    const first = baseFeed[0];
    resolvedFeed = baseFeed.slice(1);
    if (first._kind === "native") resolvedHero = first.data;
    else resolvedExternal = first.data;
  }
  // const bindings so TS narrows them inside the hero's onPress closures.
  const heroEvent = resolvedHero;
  const heroExternal = resolvedExternal;
  const mixedFeed = resolvedFeed;

  return (
    <>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        // Let content run under the floating native tab bar on iOS; the system
        // inset keeps the last item scrollable above it.
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === "ios" && {
            // iPad's navbar is insets-driven (insets.top + 10 + ~56 row), so
            // pad just past the row; phones keep the fixed-height overlay math.
            paddingTop: isIpad
              ? 10
              : Math.max(0, NAVBAR_OVERLAY_HEIGHT - insets.top),
          },
          // Phones: tighter tail — the FAB floats over the last few px of
          // content instead of reserving a full empty band.
          !isIpad && { paddingBottom: 64 },
        ]}
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingText}>
              {getGreeting()}{username ? `, ${username}` : ""} {getGreetingEmoji()}
            </Text>
            <Text style={styles.greetingDate}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>
        </View>

        {/* Hero Card */}
        {initialLoading ? (
          <HeroSkeleton />
        ) : heroEvent ? (
          <TouchableOpacity
            style={styles.heroCard}
            activeOpacity={0.92}
            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
          >
            <LinearGradient
              colors={["#2D1B69", colors.backgroundDeep]}
              style={styles.heroCardInner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {heroEvent.image && (
                <Image source={{ uri: heroEvent.image }} style={styles.heroImage} contentFit="cover" />
              )}
              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.heroBadgeText}>Up Next</Text>
                  </View>
                </View>
                <View style={styles.heroBottom}>
                  {(() => {
                    const isHosting = heroEvent.isCreator || heroEvent.userStatus === "creator";
                    const hasTicket = heroEvent.userHasPurchased;
                    const isAttending = !isHosting && heroEvent.userStatus === "accepted";
                    const isPending = !isHosting && heroEvent.userStatus === "pending";

                    let label = "Up next";
                    if (isHosting) label = "You are hosting";
                    else if (hasTicket) label = "You have a ticket for";
                    else if (isAttending) label = "You are attending";
                    else if (isPending) label = "You're invited to";

                    return (
                      <>
                        <Text style={styles.heroInviteLabel}>{label}</Text>
                        <Text style={styles.heroTitle} numberOfLines={2}>{heroEvent.title}</Text>
                        {heroEvent.location && (
                          <Text style={styles.heroLocation} numberOfLines={1}>
                            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.78)" /> {heroEvent.location}
                          </Text>
                        )}

                        {isHosting ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
                          >
                            <Text style={styles.heroButtonText}>Manage Event</Text>
                            <Ionicons name="arrow-forward" size={14} color={colors.white} />
                          </TouchableOpacity>
                        ) : hasTicket ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push("/passes" as any)}
                          >
                            <Text style={styles.heroButtonText}>View Pass</Text>
                            <Ionicons name="qr-code-outline" size={14} color={colors.white} />
                          </TouchableOpacity>
                        ) : isAttending ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
                          >
                            <Text style={styles.heroButtonText}>View Details</Text>
                            <Ionicons name="arrow-forward" size={14} color={colors.white} />
                          </TouchableOpacity>
                        ) : isPending ? (
                          <View style={styles.heroRsvpRow}>
                            <TouchableOpacity
                              style={[styles.heroButton, styles.heroRsvpAccept]}
                              activeOpacity={0.85}
                              onPress={() => handleRsvp(heroEvent._id, "accept")}
                            >
                              <Text style={styles.heroButtonText}>Accept</Text>
                              <Ionicons name="checkmark" size={14} color={colors.white} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.heroButton, styles.heroRsvpDecline]}
                              activeOpacity={0.85}
                              onPress={() => handleRsvp(heroEvent._id, "decline")}
                            >
                              <Text style={[styles.heroButtonText, { color: "#fff" }]}>Decline</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (heroEvent.isPaid) {
                                handlePurchaseTicket(heroEvent._id, heroEvent.title);
                              } else {
                                handleJoinFreeEvent(heroEvent._id, heroEvent.title);
                              }
                            }}
                          >
                            <Text style={styles.heroButtonText}>{heroEvent.isPaid ? "Get Ticket" : "Join Free"}</Text>
                            <Ionicons name="arrow-forward" size={14} color={colors.white} />
                          </TouchableOpacity>
                        )}
                      </>
                    );
                  })()}
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : heroExternal ? (
          // Promoted external (Ticketmaster etc.) event — no RSVP/ticket actions
          // here, just a "Read more" link to the external detail screen.
          <TouchableOpacity
            style={styles.heroCard}
            activeOpacity={0.92}
            onPress={() => router.push(`/external-event/${heroExternal._id}` as any)}
          >
            <LinearGradient
              colors={["#2D1B69", colors.backgroundDeep]}
              style={styles.heroCardInner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {heroExternal.image && (
                <Image source={{ uri: heroExternal.image }} style={styles.heroImage} contentFit="cover" />
              )}
              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.heroBadgeText}>Featured</Text>
                  </View>
                </View>
                <View style={styles.heroBottom}>
                  <Text style={styles.heroInviteLabel}>Happening soon</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>{heroExternal.title}</Text>
                  {(heroExternal.venueName || heroExternal.location) && (
                    <Text style={styles.heroLocation} numberOfLines={1}>
                      <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.78)" />{" "}
                      {heroExternal.venueName || heroExternal.location}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.heroButton}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/external-event/${heroExternal._id}` as any)}
                  >
                    <Text style={styles.heroButtonText}>Read more</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {/* After That */}
        {initialLoading ? (
          <View style={styles.section}>
            <SectionHeader title="After that →" subtitle="This week's calendar" />
            <FlatList
              horizontal
              data={[1, 2, 3, 4]}
              keyExtractor={(item) => String(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={() => <SmallCardSkeleton />}
            />
          </View>
        ) : mixedFeed.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="After that →"
              subtitle="This week's calendar"
              onAction={() => router.push("/public-events" as any)}
              actionLabel="All"
            />
            <FlatList
              horizontal
              // Mixed feed — in-app events first, then external — with the hero
              // item already removed when it was promoted from this carousel.
              data={mixedFeed}
              keyExtractor={(item) => `${item._kind}-${item.data._id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) =>
                item._kind === "native" ? (
                  <SmallEventCard
                    event={item.data}
                    onPress={() => router.push(`/event/${item.data._id}` as any)}
                    onPurchase={handlePurchaseTicket}
                    onJoin={handleJoinFreeEvent}
                  />
                ) : (
                  <SmallExternalEventCard
                    event={item.data}
                    onPress={() => router.push(`/external-event/${item.data._id}` as any)}
                  />
                )
              }
            />
          </View>
        )}

        {/* Trending Now */}
        {initialLoading ? (
          <View style={styles.section}>
            <SectionHeader title="Trending Now 🔥" subtitle="Hot in your city" />
            <FlatList
              horizontal
              data={[1, 2, 3]}
              keyExtractor={(item) => String(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={() => <Skeleton width={300} height={200} borderRadius={16} style={{ marginRight: 12 }} />}
            />
          </View>
        ) : (highlights.trending.length > 0 || externalEvents.length > 0) && (
          <View style={styles.section}>
            <SectionHeader
              title="Trending Now 🔥"
              subtitle="Hot in your city"
              onAction={() => router.push("/public-events" as any)}
              actionLabel="All"
            />
            <FlatList
              horizontal
              data={[
                // Mixed feed: native trending + external events, deduped by id
                // and tagged with `_kind` so the render branches to the right
                // card component below.
                ...highlights.trending.map((e) => ({ _kind: "native" as const, data: e, sort: new Date(e.date).getTime() })),
                ...externalEvents.map((e) => ({ _kind: "external" as const, data: e, sort: new Date(e.date).getTime() })),
              ].sort((a, b) => a.sort - b.sort)}
              keyExtractor={(item) => `${item._kind}-${item.data._id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <View style={{ width: 300, marginRight: 12 }}>
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
              )}
            />
          </View>
        )}

        {/* Where the city's at — vendors */}
        {initialLoading ? (
          <View style={styles.section}>
            <SectionHeader title="Where the city's at" subtitle="Vendors & venues near you" />
            <FlatList
              horizontal
              data={[1, 2, 3, 4]}
              keyExtractor={(item) => String(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={() => <VendorCardSkeleton />}
            />
          </View>
        ) : vendors.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Where the city's at"
              subtitle="Vendors & venues near you"
              onAction={() => router.push("/(tabs)/vendors")}
              actionLabel="All"
            />
            <FlatList
              horizontal
              data={vendors}
              keyExtractor={(item) => item._id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <VendorCard
                  vendor={item}
                  onPress={() => router.push(`/vendor-details/${item._id}` as any)}
                />
              )}
            />
          </View>
        )}

        {/* Top guides — best-selling city guides */}
        {initialLoading ? (
          <View style={styles.section}>
            <SectionHeader title="Top guides" subtitle="Best-selling city guides" />
            <FlatList
              horizontal
              data={[1, 2, 3, 4]}
              keyExtractor={(item) => String(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={() => <GuideCardSkeleton />}
            />
          </View>
        ) : topGuides.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Top guides"
              subtitle="Best-selling city guides"
              onAction={() => router.push("/(tabs)/bests")}
              actionLabel="All"
            />
            <FlatList
              horizontal
              data={topGuides}
              keyExtractor={(item) => item._id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <GuideCard
                  guide={item}
                  onPress={() => router.push(`/guide/${item._id}` as any)}
                />
              )}
            />
          </View>
        )}

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        // On iOS the screen extends under the floating tab bar, so lift the
        // FAB above it; on Android the JS bar still takes layout space.
        style={[
          styles.fab,
          Platform.OS === "ios" && { bottom: insets.bottom + 60 },
        ]}
        onPress={async () => {
          if (!(await ensureAuth("create an event"))) return;
          setIsModalVisible(true);
        }}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.fabGradient}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <CreateEventModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onEventCreated={() => fetchPublicEvents(selectedCity)}
      />
    </>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: c.backgroundDeep,
  },
  scrollContent: {
    flexGrow: 1,
    // Clearance for the FAB, not the tab bar — bar clearance comes from the
    // iOS content inset / the Android JS bar's layout space.
    paddingBottom: 96,
  },
  greetingSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  greetingText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    color: c.textBright,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  greetingDate: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: c.textDim,
    marginTop: 4,
  },
  heroCard: {
    marginHorizontal: 14,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 28,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 12,
  },
  heroCardInner: {
    minHeight: 320,
    position: "relative",
  },
  heroImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: c.imageScrim,
  },
  heroContent: {
    flex: 1,
    minHeight: 320,
    padding: 20,
    justifyContent: "space-between",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: c.accentPink,
  },
  heroBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: c.white,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroBottom: {
    gap: 4,
  },
  heroInviteLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "rgba(244,238,255,0.75)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 36,
    color: c.white,
    letterSpacing: -1,
    lineHeight: 38,
  },
  heroLocation: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    marginTop: 6,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: c.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  heroButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: c.white,
    letterSpacing: -0.2,
  },
  heroRsvpRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  heroRsvpAccept: {
    marginTop: 0,
    backgroundColor: c.primary,
  },
  heroRsvpDecline: {
    marginTop: 0,
    backgroundColor: c.glassStrokeStrong,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: c.textBright,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textFaint,
    marginTop: 2,
  },
  sectionAction: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: c.primary,
  },
  horizontalList: {
    paddingHorizontal: 20,
    paddingBottom: 2,
  },
  smallCard: {
    width: 160,
    marginRight: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  smallCardInner: {
    flex: 1,
  },
  smallCardImageWrap: {
    position: "relative",
  },
  smallCardImage: {
    width: "100%",
    height: 100,
  },
  smallCardBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  smallCardBadgeFree: {
    backgroundColor: "rgba(34,197,94,0.85)",
  },
  smallCardBadgePaid: {
    backgroundColor: "rgba(168,85,247,0.9)",
  },
  smallCardBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: c.white,
    letterSpacing: 0.3,
  },
  smallCardContent: {
    padding: 10,
    flex: 1,
  },
  smallCardTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: c.textBright,
    lineHeight: 17,
    // Reserve two lines so the date + action rows sit at the same height on
    // every card, whether the title wraps or not.
    minHeight: 34,
  },
  smallCardDate: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: c.textFaint,
    marginTop: 4,
    marginBottom: 8,
  },
  smallCardAction: {
    marginTop: "auto",
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 8,
    paddingVertical: 5,
    alignItems: "center",
  },
  smallCardActionPaid: {
    backgroundColor: c.primaryFadedStrong,
    borderColor: "rgba(168,85,247,0.4)",
  },
  smallCardActionText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: c.textBright,
  },
  smallCardOwned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: "auto",
  },
  smallCardOwnedText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: c.primary,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
  },
  quickAction: {
    width: "47%",
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.glassFillSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: c.textBright,
    flex: 1,
  },
  vendorCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: c.card,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.glassFillSubtle,
  },
  vendorCardImage: {
    width: "100%",
    height: 100,
    overflow: "hidden",
  },
  vendorCardContent: {
    padding: 10,
  },
  vendorCardName: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: c.textBright,
  },
  vendorCardType: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: c.textFaint,
    marginTop: 3,
  },
  guideCard: {
    width: 220,
    marginRight: 16,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassFillSubtle,
    overflow: "hidden",
  },
  guideCardBanner: {
    height: 70,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  guideCardEmoji: {
    fontSize: 30,
  },
  guideCardContent: {
    padding: 12,
    gap: 6,
  },
  guideCardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: c.textBright,
    lineHeight: 18,
    minHeight: 36,
  },
  guideCardMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textDim,
  },
  guideCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  guideTopicBadge: {
    flexShrink: 1,
    backgroundColor: c.primaryFaded,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  guideTopicText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: c.primary,
  },
  guideCardPrice: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: c.primary,
  },
  fab: {
    position: "absolute",
    bottom: 16,
    right: 24,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  fabGradient: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
});
