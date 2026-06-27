import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  Alert,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { BASE_URL } from "@/constants/constants";
import { LocationSelection } from "@/libs/interfaces";
import { LocationPicker } from "@/components/shared";
import { PublicEvent } from "@/components/shared/PublicEventCard";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import { useStripePayment } from "@/hooks/useStripePayment";
import { heroEmojiFor } from "@/utils/eventDetails";
import { AU, AU_FONT } from "@/components/auth/tokens";

const SCARCITY_WARN = "#FBA74A";
const EVENTS_PER_PAGE = 10;

// Date-derived categories (the only ones backable by current event data — see
// note in the README; genre tags need a `category` field on events).
const CATEGORIES = ["All", "Tonight", "This week"] as const;
type Category = (typeof CATEGORIES)[number];

type SortKey = "soonest" | "furthest" | "price_asc" | "price_desc";
const SORT_LABEL: Record<SortKey, string> = {
  soonest: "Soonest first",
  furthest: "Furthest first",
  price_asc: "Price: low → high",
  price_desc: "Price: high → low",
};

// Poster gradients for events without a cover image.
const POSTER_GRADIENTS: [string, string, ...string[]][] = [
  ["#F59E0B", "#EC4899", "#7C3AED"],
  ["#22D3EE", "#7C3AED"],
  ["#7C3AED", "#0B0613", "#EC4899"],
  ["#F59E0B", "#EC4899"],
  ["#22D3EE", "#0B0613"],
  ["#A855F7", "#EC4899"],
];
const gradientFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % POSTER_GRADIENTS.length;
  return POSTER_GRADIENTS[h];
};

const priceOf = (e: PublicEvent) => (e.isPaid ? e.ticketPrice ?? 0 : 0);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function PublicEventsPage() {
  const router = useRouter();
  const { payForTicket } = useStripePayment();
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  // External provider events (Ticketmaster, etc) shown alongside native ones.
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);

  const [discoverLoc, setDiscoverLoc] = useState<Partial<LocationSelection> | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [sort, setSort] = useState<SortKey>("soonest");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const fetchPublicEvents = async (
    pageNum: number,
    isRefresh = false,
    loc: Partial<LocationSelection> | null = discoverLoc
  ) => {
    try {
      if (pageNum === 1) setLoading(true);

      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const params = new URLSearchParams({ page: String(pageNum), limit: String(EVENTS_PER_PAGE) });
      if (loc?.city) params.append("city", loc.city);
      if (loc?.state) params.append("state", loc.state);
      if (loc?.country) params.append("country", loc.country);

      // Fetch native + external in parallel. External events only on page 1
      // (they're a fixed batch — pagination tied to the native page count).
      const [nativeRes, externalRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/events/public/explore?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        pageNum === 1
          ? externalEventService.explore({
              city: loc?.city || undefined,
              // ISO code matches what Ticketmaster stores; full country name
              // wouldn't match anything ("Nigeria" vs "NG"). See externalEvent
              // controller for the loose matching logic.
              country: loc?.countryIso || loc?.country || undefined,
              limit: 30,
            })
          : Promise.resolve({ events: [], nextCursor: null }),
      ]);

      // Native (preserve existing behavior + error handling)
      if (nativeRes.status === "fulfilled") {
        const response = nativeRes.value;
        const data = await response.json();
        if (response.ok) {
          const newEvents: PublicEvent[] = data.events || [];
          setPublicEvents((prev) => (isRefresh || pageNum === 1 ? newEvents : [...prev, ...newEvents]));
          setTotalEvents(data.total || newEvents.length);
          setHasMore(newEvents.length === EVENTS_PER_PAGE);
        } else {
          Alert.alert("Error", data.message || "Failed to load events");
        }
      }

      // External: refresh on page 1; failure is silent, the feed degrades gracefully.
      if (pageNum === 1 || isRefresh) {
        if (externalRes.status === "fulfilled") {
          setExternalEvents(externalRes.value.events || []);
        } else {
          console.warn("[public-events] external fetch failed:", externalRes.reason);
          setExternalEvents([]);
        }
      }
    } catch (error) {
      console.error("Fetch public events error:", error);
      Alert.alert("Error", "Failed to load events. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed favorites from the events' own isFavorited flag as they load.
  useEffect(() => {
    setFavorites((prev) => {
      const next = new Set(prev);
      publicEvents.forEach((e) => {
        if (e.isFavorited) next.add(e._id);
      });
      return next;
    });
  }, [publicEvents]);

  const applyLocation = (loc: Partial<LocationSelection> | null) => {
    setDiscoverLoc(loc);
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true, loc);
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true, discoverLoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverLoc]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPublicEvents(nextPage, false, discoverLoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasMore, page, discoverLoc]);

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    // The hook runs checkout AND confirms server-side before returning.
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }
    const token = await SecureStore.getItemAsync("token");
    Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
    fetch(`${BASE_URL}/notifications/sold`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ticket", id: eventId }),
    }).catch(() => {});
    setPage(1);
    fetchPublicEvents(1, true);
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
        setPage(1);
        fetchPublicEvents(1, true);
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch (error) {
      console.error("Join event error:", error);
      Alert.alert("Error", "Failed to join event");
    }
  };

  const toggleFavorite = async (id: string) => {
    const isFav = favorites.has(id);
    setFavorites((prev) => {
      const n = new Set(prev);
      isFav ? n.delete(id) : n.add(id);
      return n;
    });
    Haptics.selectionAsync().catch(() => {});
    try {
      const token = await SecureStore.getItemAsync("token");
      await fetch(`${BASE_URL}/favorites/${id}`, {
        method: isFav ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // revert on failure
      setFavorites((prev) => {
        const n = new Set(prev);
        isFav ? n.add(id) : n.delete(id);
        return n;
      });
    }
  };

  const onGetTicket = (ev: PublicEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (ev.userHasPurchased) {
      router.push({ pathname: "/event/[id]", params: { id: ev._id } });
      return;
    }
    if (ev.isPaid && priceOf(ev) > 0) handlePurchaseTicket(ev._id, ev.title);
    else handleJoinFreeEvent(ev._id, ev.title);
  };

  // Client-side category (date) filter + sort over the loaded events.
  const visibleEvents = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);

    // Unify both feeds into a tagged shape so we can sort/filter together,
    // then branch on `_kind` in the renderer.
    type FeedItem =
      | { _kind: "native"; data: PublicEvent }
      | { _kind: "external"; data: ExternalEvent };

    const inDateWindow = (iso: string) => {
      const d = new Date(iso);
      if (activeCategory === "Tonight") return d.toDateString() === now.toDateString();
      if (activeCategory === "This week") {
        const weekEnd = new Date(startToday);
        weekEnd.setDate(startToday.getDate() + 7);
        return d >= startToday && d <= weekEnd;
      }
      return true;
    };

    const nativeItems: FeedItem[] = publicEvents
      .filter((e) => inDateWindow(e.date))
      .map((e) => ({ _kind: "native", data: e }));

    // Price-based sorts don't make sense for external events (range pricing,
    // some no price at all). Drop external from those sorts.
    const isPriceSort = sort === "price_asc" || sort === "price_desc";
    const externalItems: FeedItem[] = isPriceSort
      ? []
      : externalEvents
          .filter((e) => inDateWindow(e.date))
          .map((e) => ({ _kind: "external", data: e }));

    const all = [...nativeItems, ...externalItems];

    switch (sort) {
      case "furthest":
        all.sort((a, b) => +new Date(b.data.date) - +new Date(a.data.date));
        break;
      case "price_asc":
        all.sort((a, b) => priceOf(a.data as PublicEvent) - priceOf(b.data as PublicEvent));
        break;
      case "price_desc":
        all.sort((a, b) => priceOf(b.data as PublicEvent) - priceOf(a.data as PublicEvent));
        break;
      default:
        all.sort((a, b) => +new Date(a.data.date) - +new Date(b.data.date));
    }
    return all;
  }, [publicEvents, externalEvents, activeCategory, sort]);

  const locationLabel = discoverLoc?.city
    ? `${discoverLoc.city}${discoverLoc.state ? `, ${discoverLoc.state}` : ""}`
    : "All locations";

  const filtersActive =
    activeCategory !== "All" ||
    sort !== "soonest" ||
    !!(discoverLoc?.city || discoverLoc?.state || discoverLoc?.country);

  // ─── Renderers ──────────────────────────────────────────────────────────

  // Heterogeneous render: external events delegate to ExternalEventCard;
  // native events keep the bespoke layout below.
  const renderCard = ({
    item: feedItem,
  }: {
    item:
      | { _kind: "native"; data: PublicEvent }
      | { _kind: "external"; data: ExternalEvent };
  }) => {
    if (feedItem._kind === "external") {
      const ext = feedItem.data;
      const priceLine =
        ext.priceMin == null && ext.priceMax == null
          ? "See tickets"
          : ext.priceMin != null && ext.priceMax != null && ext.priceMin !== ext.priceMax
          ? `$${Math.round(ext.priceMin)}–$${Math.round(ext.priceMax)}`
          : `From $${Math.round((ext.priceMin ?? ext.priceMax) as number)}`;
      const moreDates = ext.additionalDates ?? 0;

      // Same outer shape, poster, body, footer layout as the native renderCard
      // below — only swaps in a "Get tickets" CTA that opens the detail screen
      // (the floating CTA in the detail screen is what actually sends users to
      // the external provider).
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() =>
            router.push({ pathname: "/external-event/[id]", params: { id: ext._id } })
          }
        >
          <View style={styles.poster}>
            {ext.image ? (
              <Image source={{ uri: ext.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={gradientFor(ext._id) as any}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
              >
                <Text style={styles.posterEmoji}>{heroEmojiFor(ext.title)}</Text>
              </LinearGradient>
            )}
            <LinearGradient
              colors={["transparent", "rgba(11,6,19,0.35)"]}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{ext.title}</Text>
            {!!ext.venueName && <Text style={styles.cardHost}>at {ext.venueName}</Text>}

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={AU.textDim} />
              <Text style={styles.metaText}>{formatDate(ext.date)}</Text>
              {!!ext.city && (
                <>
                  <View style={styles.metaDot} />
                  <Ionicons name="location-outline" size={14} color={AU.textDim} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {ext.city}
                    {ext.state ? `, ${ext.state}` : ""}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.priceCluster}>
                <Text style={styles.priceText}>{priceLine}</Text>
                {moreDates > 0 && (
                  <Text style={styles.scarcityText}>
                    +{moreDates} more {moreDates === 1 ? "date" : "dates"}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.ctaBtn}
                activeOpacity={0.85}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push({
                    pathname: "/external-event/[id]",
                    params: { id: ext._id },
                  });
                }}
              >
                <Text style={styles.ctaText}>Get tickets</Text>
                <Ionicons name="arrow-forward" size={14} color={AU.bg} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    const item = feedItem.data;
    const isFree = !item.isPaid || priceOf(item) === 0;
    const left = item.ticketsRemaining;
    const scarce = typeof left === "number" && left <= 15;
    const tag = (item as any).city || item.location?.split(",")[0] || "Event";
    const fav = favorites.has(item._id);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => router.push({ pathname: "/event/[id]", params: { id: item._id } })}
      >
        {/* Poster */}
        <View style={styles.poster}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={gradientFor(item._id) as any}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            >
              <Text style={styles.posterEmoji}>{heroEmojiFor(item.title)}</Text>
            </LinearGradient>
          )}
          {/* bottom darken for legibility */}
          <LinearGradient
            colors={["transparent", "rgba(11,6,19,0.35)"]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.tagPill}>
            <Text style={styles.tagPillText} numberOfLines={1}>
              {String(tag).toUpperCase()}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.heartBtn}
            onPress={(e) => {
              e.stopPropagation();
              toggleFavorite(item._id);
            }}
            hitSlop={8}
            accessibilityLabel={fav ? "Remove from favorites" : "Add to favorites"}
          >
            <Ionicons name={fav ? "heart" : "heart-outline"} size={16} color={fav ? AU.pink : "#fff"} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {!!item.createdBy?.username && (
            <Text style={styles.cardHost}>by {item.createdBy.username}</Text>
          )}

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={AU.textDim} />
            <Text style={styles.metaText}>{formatDate(item.date)}</Text>
            <View style={styles.metaDot} />
            <Ionicons name="location-outline" size={14} color={AU.textDim} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.priceCluster}>
              <Text style={styles.priceText}>{isFree ? "Free" : `$${priceOf(item)}`}</Text>
              {typeof left === "number" && (
                <Text style={[styles.scarcityText, scarce && { color: SCARCITY_WARN }]}>
                  {scarce ? `Only ${left} left` : `${left} spots`}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.ctaBtn}
              activeOpacity={0.85}
              onPress={(e) => {
                e.stopPropagation();
                onGetTicket(item);
              }}
            >
              <Text style={styles.ctaText}>
                {item.userHasPurchased ? "View" : isFree ? "Join free" : "Get ticket"}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={AU.bg} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = (
    <View style={{ gap: 14, paddingBottom: 2 }}>
      {/* Location chip */}
      <TouchableOpacity
        style={styles.locationChip}
        activeOpacity={0.8}
        onPress={() => setLocationSheetOpen(true)}
      >
        <View style={styles.locationIconBox}>
          <Ionicons name="navigate" size={16} color={AU.purpleSoft} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.locationKicker}>SHOWING EVENTS IN</Text>
          <Text style={styles.locationValue} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={AU.textDim} />
      </TouchableOpacity>

      {/* Category row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        {CATEGORIES.map((c) => {
          const active = c === activeCategory;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => setActiveCategory(c)}
              activeOpacity={0.8}
              style={[styles.catChip, active ? styles.catChipActive : styles.catChipIdle]}
            >
              <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort caption row */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>
          {sort.startsWith("price") ? "SORTED BY PRICE" : "SORTED BY DATE"}
        </Text>
        <TouchableOpacity
          style={styles.sortLink}
          onPress={() => setSortSheetOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.sortLinkText}>{SORT_LABEL[sort]}</Text>
          <Ionicons name="chevron-down" size={12} color={AU.purpleSoft} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="compass-outline" size={56} color={AU.textMute} />
        <Text style={styles.emptyTitle}>No events nearby</Text>
        <Text style={styles.emptyText}>Try widening your location or clearing filters.</Text>
        {filtersActive && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setActiveCategory("All");
              setSort("soonest");
              setPickerKey((k) => k + 1);
              applyLocation(null);
            }}
          >
            <Text style={styles.resetBtnText}>Reset filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFooter = () => {
    if (!loading || page === 1) return null;
    return (
      <View style={styles.footerLoader}>
        <Text style={styles.footerText}>Loading more…</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#1A0B2E", AU.bg]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientGlow} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Pinned header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.circleBtn} onPress={() => goBack()} hitSlop={6}>
              <Ionicons name="arrow-back" size={20} color={AU.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setSortSheetOpen(true)}
              hitSlop={6}
              accessibilityLabel="Filters"
            >
              <Ionicons name="options-outline" size={18} color={AU.text} />
              {filtersActive && <View style={styles.filtersDot} />}
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Public events</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.subtitleCount}>{totalEvents}</Text> happening near you
          </Text>
        </View>

        {loading && page === 1 ? (
          <View style={{ paddingTop: 14, gap: 14 }}>
            {ListHeader}
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.card, { marginBottom: 0 }]}>
                <View style={[styles.poster, { backgroundColor: "#241540" }]} />
                <View style={styles.cardBody}>
                  <View style={styles.skelLine} />
                  <View style={[styles.skelLine, { width: "40%", marginTop: 8 }]} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={visibleEvents}
            renderItem={renderCard}
            keyExtractor={(item) => `${item._kind}-${item.data._id}`}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={renderFooter}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={AU.purple}
                colors={[AU.purple]}
              />
            }
          />
        )}
      </SafeAreaView>

      {/* Location bottom sheet */}
      <Modal
        visible={locationSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationSheetOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setLocationSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter by location</Text>
              <TouchableOpacity onPress={() => setLocationSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={AU.text} />
              </TouchableOpacity>
            </View>
            <LocationPicker
              key={pickerKey}
              label=""
              value={discoverLoc ?? undefined}
              onChange={(sel) => applyLocation({ country: sel.country, state: sel.state, city: sel.city })}
            />
            {(discoverLoc?.city || discoverLoc?.state || discoverLoc?.country) && (
              <TouchableOpacity
                style={styles.sheetClearBtn}
                onPress={() => {
                  setPickerKey((k) => k + 1);
                  applyLocation(null);
                }}
              >
                <Ionicons name="close-circle" size={16} color={AU.textDim} />
                <Text style={styles.sheetClearText}>Show all locations</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Sort bottom sheet */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSortSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Sort events</Text>
              <TouchableOpacity onPress={() => setSortSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={AU.text} />
              </TouchableOpacity>
            </View>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => {
              const active = key === sort;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.sortOption}
                  onPress={() => {
                    setSort(key);
                    setSortSheetOpen(false);
                  }}
                >
                  <Text style={[styles.sortOptionText, active && { color: AU.purpleSoft }]}>
                    {SORT_LABEL[key]}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={AU.purpleSoft} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  ambientGlow: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 14 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AU.pink,
    borderWidth: 2,
    borderColor: AU.bg,
  },
  title: {
    fontFamily: AU_FONT.display,
    fontSize: 32,
    color: AU.text,
    letterSpacing: -0.96,
    lineHeight: 33,
  },
  subtitle: { fontFamily: AU_FONT.body, fontSize: 13, color: AU.textDim, marginTop: -8 },
  subtitleCount: { fontFamily: AU_FONT.bodySemi, color: AU.purpleSoft },

  listContent: { paddingTop: 14, paddingBottom: 40, gap: 14 },

  // Location chip
  locationChip: {
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  locationIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(168,85,247,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  locationKicker: {
    fontFamily: AU_FONT.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: AU.purpleSoft,
  },
  locationValue: {
    fontFamily: AU_FONT.bold,
    fontSize: 15,
    color: AU.text,
    letterSpacing: -0.15,
    marginTop: 2,
  },

  // Category row
  categoryRow: { gap: 8, paddingHorizontal: 20 },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  catChipActive: { backgroundColor: AU.text },
  catChipIdle: { backgroundColor: "transparent", borderWidth: 1, borderColor: AU.strokeHi },
  catChipText: { fontFamily: AU_FONT.body, fontSize: 12.5, color: AU.textDim, letterSpacing: -0.06 },
  catChipTextActive: { fontFamily: AU_FONT.bodyBold, color: AU.bg },

  // Sort row
  sortRow: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sortLabel: { fontFamily: AU_FONT.bodySemi, fontSize: 11, letterSpacing: 0.8, color: AU.textMute },
  sortLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortLinkText: { fontFamily: AU_FONT.bodySemi, fontSize: 12, color: AU.purpleSoft },

  // Card
  card: {
    marginHorizontal: 20,
    borderRadius: 18,
    backgroundColor: AU.surface,
    borderWidth: 1,
    borderColor: AU.stroke,
    overflow: "hidden",
  },
  poster: { height: 180, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  posterEmoji: {
    position: "absolute",
    right: -8,
    bottom: -20,
    fontSize: 130,
    opacity: 0.3,
    transform: [{ rotate: "-8deg" }],
  },
  tagPill: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: "rgba(11,6,19,0.55)",
    maxWidth: "60%",
  },
  tagPillText: { fontFamily: AU_FONT.bodyBold, fontSize: 10, color: "#fff", letterSpacing: 0.8 },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(11,6,19,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  cardTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: AU.text, letterSpacing: -0.36, lineHeight: 21 },
  cardHost: { fontFamily: AU_FONT.body, fontSize: 12, color: AU.textMute, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 5 },
  metaText: { fontFamily: AU_FONT.body, fontSize: 12, color: AU.textDim, flexShrink: 1 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: AU.textDim, opacity: 0.55, marginHorizontal: 2 },
  cardFooter: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: AU.stroke,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceCluster: { flexDirection: "row", alignItems: "baseline", gap: 8, flexShrink: 1 },
  priceText: { fontFamily: AU_FONT.bold, fontSize: 20, color: AU.text, letterSpacing: -0.4 },
  scarcityText: { fontFamily: AU_FONT.body, fontSize: 11, color: AU.textMute },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: AU.text,
  },
  ctaText: { fontFamily: AU_FONT.bodyBold, fontSize: 12.5, color: AU.bg, letterSpacing: -0.06 },

  // Skeleton
  skelLine: { height: 14, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)", width: "70%" },

  // Empty
  emptyContainer: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: AU.text, marginTop: 6 },
  emptyText: { fontFamily: AU_FONT.body, fontSize: 14, color: AU.textDim, textAlign: "center", lineHeight: 20 },
  resetBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AU.strokeHi,
  },
  resetBtnText: { fontFamily: AU_FONT.bodyBold, fontSize: 13, color: AU.text },

  footerLoader: { paddingVertical: 20, alignItems: "center" },
  footerText: { fontFamily: AU_FONT.body, fontSize: 13, color: AU.textDim },

  // Sheets
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: AU.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: AU.stroke,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AU.strokeHi,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: AU.text },
  sheetClearBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, marginTop: 4 },
  sheetClearText: { fontFamily: AU_FONT.body, fontSize: 14, color: AU.textDim },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: AU.stroke,
  },
  sortOptionText: { fontFamily: AU_FONT.bodySemi, fontSize: 15, color: AU.text },
});
