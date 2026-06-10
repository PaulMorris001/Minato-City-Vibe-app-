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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import CreateEventModal from "@/components/client/CreateEventModal";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import ExternalEventCard from "@/components/shared/ExternalEventCard";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import { useStripePayment } from "@/hooks/useStripePayment";
import { trackEvent } from "@/utils/analytics";

const C = {
  bg: "#0B0613",
  surface: "#1A1030",
  surfaceHi: "#241540",
  stroke: "rgba(255,255,255,0.06)",
  strokeHi: "rgba(255,255,255,0.12)",
  text: "#F4EEFF",
  textDim: "rgba(244,238,255,0.64)",
  textMute: "rgba(244,238,255,0.42)",
  purple: "#A855F7",
  purpleDeep: "#7C3AED",
  pink: "#EC4899",
  cyan: "#22D3EE",
  amber: "#F59E0B",
};

function Skeleton({ width, height, borderRadius = 10, style }: { width: number | string; height: number; borderRadius?: number; style?: any }) {
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
      style={[{ width, height, borderRadius, backgroundColor: C.surfaceHi, opacity }, style]}
    />
  );
}

function HeroSkeleton() {
  return (
    <View style={[styles.heroCard, { overflow: "hidden" }]}>
      <Skeleton width="100%" height={320} borderRadius={24} />
    </View>
  );
}

function SmallCardSkeleton() {
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

const QUICK_ACTIONS = [
  { icon: "home-outline" as const, label: "House Party", color: C.purple },
  { icon: "ticket-outline" as const, label: "Ticketed Event", color: C.pink },
  { icon: "walk-outline" as const, label: "Bar Crawl", color: C.cyan },
  { icon: "briefcase-outline" as const, label: "Book Vendor", color: C.amber },
];

function SectionHeader({ title, subtitle, onAction, actionLabel }: { title: string; subtitle?: string; onAction?: () => void; actionLabel?: string }) {
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
  const owned = event.isCreator || event.userHasPurchased || event.userStatus === "accepted";

  return (
    <TouchableOpacity style={styles.smallCard} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={["#2D1B69", "#1A1030"]} style={styles.smallCardInner}>
        <View style={styles.smallCardImageWrap}>
          {event.image ? (
            <Image source={{ uri: event.image }} style={styles.smallCardImage} contentFit="cover" />
          ) : (
            <View style={[styles.smallCardImage, { backgroundColor: C.surfaceHi, justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="calendar" size={24} color={C.purple} />
            </View>
          )}
          {/* Price badge */}
          <View style={[styles.smallCardBadge, event.isPaid ? styles.smallCardBadgePaid : styles.smallCardBadgeFree]}>
            <Text style={styles.smallCardBadgeText}>
              {event.isPaid ? `$${event.ticketPrice ?? ""}` : "FREE"}
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
              <Ionicons name="checkmark-circle" size={12} color={C.purple} />
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

function VendorCard({ vendor, onPress }: { vendor: Vendor; onPress: () => void }) {
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
          <LinearGradient colors={[C.purple, C.purpleDeep]} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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
        <LinearGradient colors={["#2D1B69", "#1A1030"]} style={styles.guideCardBanner}>
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
            {guide.price === 0 ? "FREE" : `$${guide.price}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function GuideCardSkeleton() {
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
  const router = useRouter();
  const { payForTicket } = useStripePayment();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [highlights, setHighlights] = useState<{ trending: PublicEvent[]; upcoming: PublicEvent[] }>({ trending: [], upcoming: [] });
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
      if (!token) return;
      const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
      const response = await fetch(`${BASE_URL}/events/public/explore?limit=10${cityParam}`, {
        headers: { Authorization: `Bearer ${token}` },
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
      if (!token) return;
      const response = await fetch(`${BASE_URL}/events/highlights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setHighlights({ trending: data.trending || [], upcoming: data.upcoming || [] });
      }
    } catch {}
  };

  const fetchVendors = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const response = await fetch(`${BASE_URL}/vendors/search?query=&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
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
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }

    const token = await SecureStore.getItemAsync("token");
    const confirmRes = await fetch(`${BASE_URL}/stripe/confirm/ticket/${eventId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
    });

    if (confirmRes.ok) {
      trackEvent("ticket_purchased", { eventId, eventTitle });
      Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
      fetch(`${BASE_URL}/notifications/sold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ticket", id: eventId }),
      }).catch(() => {});
      fetchPublicEvents();
    } else {
      const d = await confirmRes.json();
      Alert.alert("Error", d.message || "Payment succeeded but ticket could not be issued. Please contact Support@nvibez.com.");
    }
  };

  const handleRsvp = async (eventId: string, action: "accept" | "decline") => {
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

  const heroEvent = highlights.upcoming[0] || publicEvents[0];
  const afterThat = highlights.upcoming.slice(1, 6);
  if (afterThat.length === 0 && publicEvents.length > 0) {
    afterThat.push(...publicEvents.slice(0, 5));
  }

  return (
    <>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.purple} colors={[C.purple]} />
        }
        contentContainerStyle={styles.scrollContent}
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
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.push("/scan" as any)}
            activeOpacity={0.8}
            accessibilityLabel="Scan a QR code"
          >
            <Ionicons name="qr-code-outline" size={22} color={C.purple} />
          </TouchableOpacity>
        </View>

        {/* Hero Card */}
        {initialLoading ? (
          <HeroSkeleton />
        ) : heroEvent && (
          <TouchableOpacity
            style={styles.heroCard}
            activeOpacity={0.92}
            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
          >
            <LinearGradient
              colors={["#2D1B69", "#0B0613"]}
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
                            <Ionicons name="location-outline" size={12} color="rgba(244,238,255,0.7)" /> {heroEvent.location}
                          </Text>
                        )}

                        {isHosting ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
                          >
                            <Text style={styles.heroButtonText}>Manage Event</Text>
                            <Ionicons name="arrow-forward" size={14} color={C.bg} />
                          </TouchableOpacity>
                        ) : hasTicket ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push("/tickets" as any)}
                          >
                            <Text style={styles.heroButtonText}>View Ticket</Text>
                            <Ionicons name="ticket-outline" size={14} color={C.bg} />
                          </TouchableOpacity>
                        ) : isAttending ? (
                          <TouchableOpacity
                            style={styles.heroButton}
                            activeOpacity={0.85}
                            onPress={() => router.push(`/event/${heroEvent._id}` as any)}
                          >
                            <Text style={styles.heroButtonText}>View Details</Text>
                            <Ionicons name="arrow-forward" size={14} color={C.bg} />
                          </TouchableOpacity>
                        ) : isPending ? (
                          <View style={styles.heroRsvpRow}>
                            <TouchableOpacity
                              style={[styles.heroButton, styles.heroRsvpAccept]}
                              activeOpacity={0.85}
                              onPress={() => handleRsvp(heroEvent._id, "accept")}
                            >
                              <Text style={styles.heroButtonText}>Accept</Text>
                              <Ionicons name="checkmark" size={14} color={C.bg} />
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
                            <Ionicons name="arrow-forward" size={14} color={C.bg} />
                          </TouchableOpacity>
                        )}
                      </>
                    );
                  })()}
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

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
        ) : afterThat.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="After that →"
              subtitle="This week's calendar"
              onAction={() => router.push("/public-events" as any)}
              actionLabel="All"
            />
            <FlatList
              horizontal
              data={afterThat}
              keyExtractor={(item) => item._id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <SmallEventCard
                  event={item}
                  onPress={() => router.push(`/event/${item._id}` as any)}
                  onPurchase={handlePurchaseTicket}
                  onJoin={handleJoinFreeEvent}
                />
              )}
            />
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <SectionHeader title="Throw something" subtitle="Start planning in 30 seconds" />
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action, i) => (
              <TouchableOpacity
                key={action.label}
                style={styles.quickAction}
                activeOpacity={0.8}
                onPress={() => {
                  if (action.label === "Book Vendor") {
                    router.push("/(tabs)/vendors");
                  } else {
                    setIsModalVisible(true);
                  }
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}18` }]}>
                  <Ionicons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsModalVisible(true)}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[C.purple, C.purpleDeep]} style={styles.fabGradient}>
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

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  greetingSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.3)",
  },
  greetingText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  greetingDate: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: C.textDim,
    marginTop: 4,
  },
  heroCard: {
    marginHorizontal: 14,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 28,
    shadowColor: C.purple,
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
    backgroundColor: "rgba(11,6,19,0.55)",
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
    backgroundColor: C.pink,
  },
  heroBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#fff",
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
    color: "#fff",
    letterSpacing: -1,
    lineHeight: 38,
  },
  heroLocation: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "rgba(244,238,255,0.7)",
    marginTop: 6,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  heroButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: C.bg,
    letterSpacing: -0.2,
  },
  heroRsvpRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  heroRsvpAccept: {
    marginTop: 0,
    backgroundColor: "#fff",
  },
  heroRsvpDecline: {
    marginTop: 0,
    backgroundColor: "rgba(255,255,255,0.15)",
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
    color: C.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: C.textMute,
    marginTop: 2,
  },
  sectionAction: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: C.purple,
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
    borderColor: C.strokeHi,
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
    color: "#fff",
    letterSpacing: 0.3,
  },
  smallCardContent: {
    padding: 10,
  },
  smallCardTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: C.text,
    lineHeight: 17,
  },
  smallCardDate: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: C.textMute,
    marginTop: 4,
  },
  smallCardAction: {
    marginTop: 8,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 8,
    paddingVertical: 5,
    alignItems: "center",
  },
  smallCardActionPaid: {
    backgroundColor: "rgba(168,85,247,0.15)",
    borderColor: "rgba(168,85,247,0.4)",
  },
  smallCardActionText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: C.text,
  },
  smallCardOwned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  smallCardOwnedText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: C.purple,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
  },
  quickAction: {
    width: "47%",
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.stroke,
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
    color: C.text,
    flex: 1,
  },
  vendorCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.stroke,
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
    color: C.text,
  },
  vendorCardType: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: C.textMute,
    marginTop: 3,
  },
  guideCard: {
    width: 220,
    marginRight: 16,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.stroke,
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
    color: C.text,
    lineHeight: 18,
    minHeight: 36,
  },
  guideCardMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: C.textDim,
  },
  guideCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  guideTopicBadge: {
    flexShrink: 1,
    backgroundColor: "rgba(168,85,247,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  guideTopicText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: C.purple,
  },
  guideCardPrice: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: C.purple,
  },
  fab: {
    position: "absolute",
    bottom: 16,
    right: 24,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: C.purple,
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
