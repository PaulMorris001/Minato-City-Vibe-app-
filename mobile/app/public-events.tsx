import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { BASE_URL } from "@/constants/constants";
import EventFiltersPage, {
  DEFAULT_EVENT_FILTERS,
  DATE_LABEL,
  PRICE_LABEL,
  SORT_LABEL,
  activeFilterCount,
  inDateWindow,
  type EventFilters,
} from "@/components/shared/EventFiltersPage";
import { useEventCategories } from "@/hooks/useEventCategories";
import { PublicEvent } from "@/components/shared/PublicEventCard";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import { usePayment } from "@/hooks/usePayment";
import { currencyPrefix } from "@/constants/payments";
import { heroEmojiFor } from "@/utils/eventDetails";
import { AU_FONT } from "@/components/auth/tokens";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
const SCARCITY_WARN = "#FBA74A";
const EVENTS_PER_PAGE = 20;

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
// Lowest listed price for an external event; null when the provider gave none.
const externalPriceOf = (e: ExternalEvent) => e.priceMin ?? e.priceMax ?? null;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Events carry no coordinates, so "nearby" is a proxy: the most active OTHER
// city in the same state/country (see findNearbyCityEvents on the server),
// returned only when the searched city's own results are thin.
interface NearbyCity {
  city: string;
  state: string | null;
  country: string | null;
  totalThere: number;
  events: PublicEvent[];
}

export default function PublicEventsPage() {
  const { isDark, colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { payForTicket } = usePayment();
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  // External provider events (Ticketmaster, etc) shown alongside native ones.
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);
  const [nearby, setNearby] = useState<NearbyCity | null>(null);

  // Everything the Filter page sets. Location, category and price go to the
  // server (the feed is paginated — filtering loaded pages would only search
  // page 1); date and sort apply to what's loaded. Mirrored in a ref so
  // every fetch path (refresh, load-more, after a purchase) sends the current
  // filters without threading them through each call.
  const { categories: eventCategories } = useEventCategories();
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_EVENT_FILTERS);
  const filtersRef = useRef<EventFilters>(DEFAULT_EVENT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Each page-1 load bumps this; a slower response for filters the user has
  // already moved off is dropped instead of overwriting the newer feed.
  const loadSeq = useRef(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchPublicEvents = async (pageNum: number, isRefresh = false) => {
    const f = filtersRef.current;
    const seq = pageNum === 1 ? ++loadSeq.current : loadSeq.current;
    const loc = f.online ? null : f.location;
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      // Guest-accessible — the explore routes use optionalAuth on the server,
      // so only attach the token when one exists.
      const token = await SecureStore.getItemAsync("token");

      const params = new URLSearchParams({ page: String(pageNum), limit: String(EVENTS_PER_PAGE) });
      if (f.online) {
        params.append("online", "true");
      } else {
        if (loc?.city) params.append("city", loc.city);
        if (loc?.state) params.append("state", loc.state);
        if (loc?.country) params.append("country", loc.country);
      }
      if (f.category) params.append("category", f.category);
      if (f.price !== "any") params.append("price", f.price);

      // Fetch native + external in parallel. External events only on page 1
      // (they're a fixed batch — pagination tied to the native page count).
      // Skipped for the Online filter — Ticketmaster events are always physical.
      const [nativeRes, externalRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/events/public/explore?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        pageNum === 1 && !f.online
          ? externalEventService.explore({
              city: loc?.city || undefined,
              // ISO code matches what Ticketmaster stores; full country name
              // wouldn't match anything ("Nigeria" vs "NG"). See externalEvent
              // controller for the loose matching logic.
              country: loc?.countryIso || loc?.country || undefined,
              category: f.category || undefined,
              // Server clamps to 100 max (see getExternalEventsExplore) — external
              // events aren't paginated here (fixed batch on page 1), so this is
              // the full ceiling of how many can ever show in one session.
              limit: 100,
            })
          : Promise.resolve({ events: [], nextCursor: null }),
      ]);
      if (seq !== loadSeq.current) return;

      // Native (preserve existing behavior + error handling)
      if (nativeRes.status === "fulfilled") {
        const response = nativeRes.value;
        const data = await response.json();
        if (response.ok) {
          const newEvents: PublicEvent[] = data.events || [];
          setPublicEvents((prev) => (isRefresh || pageNum === 1 ? newEvents : [...prev, ...newEvents]));
          setTotalEvents(data.total || newEvents.length);
          setHasMore(newEvents.length === EVENTS_PER_PAGE);
          if (pageNum === 1) setNearby(data.nearby || null);
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
      if (seq !== loadSeq.current) return;
      console.error("Fetch public events error:", error);
      Alert.alert("Error", "Failed to load events. Please try again.");
    } finally {
      // A superseded load leaves the spinners to the newer one.
      if (seq === loadSeq.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true);
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

  // "Apply Filter" on the Filter page. Refetches only when a server-side filter
  // changed; date/sort just re-slice what's already loaded.
  // Resolves once the new results are in, so the Filter page can keep its
  // button spinning until then and close onto a finished feed.
  const applyFilters = async (next: EventFilters) => {
    const prev = filtersRef.current;
    filtersRef.current = next;
    setFilters(next);
    const refetch =
      prev.online !== next.online ||
      prev.category !== next.category ||
      prev.price !== next.price ||
      JSON.stringify(prev.location) !== JSON.stringify(next.location);
    if (refetch) {
      setPage(1);
      setHasMore(true);
      await fetchPublicEvents(1, true);
    }
    setFiltersOpen(false);
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchPublicEvents(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPublicEvents(nextPage, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadingMore, hasMore, page]);

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    if (!(await SecureStore.getItemAsync("token"))) {
      router.push("/login");
      return;
    }
    // The hook runs checkout AND confirms server-side before returning.
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.code === "tier_required") {
        // Multi-tier event — the detail screen owns the tier picker.
        router.push({ pathname: "/event/[id]", params: { id: eventId } });
        return;
      }
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }
    // The organizer's sale notification is sent server-side by fulfillment.js.
    Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
    setPage(1);
    fetchPublicEvents(1, true);
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.push("/login");
        return;
      }
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
    // Favorites need an account — don't flip local state for guests.
    if (!(await SecureStore.getItemAsync("token"))) {
      router.push("/login");
      return;
    }
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
    if (ev.hidePrice || ev.userHasPurchased) {
      router.push({ pathname: "/event/[id]", params: { id: ev._id } });
      return;
    }
    if (ev.isPaid && priceOf(ev) > 0) handlePurchaseTicket(ev._id, ev.title);
    else handleJoinFreeEvent(ev._id, ev.title);
  };

  // One mixed feed — CityVibe and Ticketmaster/Eventbrite side by side — with
  // the client-side filters (date, external price) and the sort.
  const visibleEvents = useMemo(() => {
    const now = new Date();

    // Unify both feeds into a tagged shape so we can sort/filter together,
    // then branch on `_kind` in the renderer.
    type FeedItem =
      | { _kind: "native"; data: PublicEvent }
      | { _kind: "external"; data: ExternalEvent };

    const nativeItems: FeedItem[] = publicEvents
      .filter((e) => inDateWindow(e.date, filters.date, now))
      .map((e) => ({ _kind: "native", data: e }));

    // The server already applied category + location to these; price has to
    // be done here, because providers only give a price range. An unpriced
    // show counts as paid — ticketed shows almost always are.
    const externalItems: FeedItem[] = externalEvents
      .filter((e) => inDateWindow(e.date, filters.date, now))
      .filter((e) => {
        const p = externalPriceOf(e);
        if (filters.price === "free") return p === 0;
        if (filters.price === "paid") return p !== 0;
        return true;
      })
      .map((e) => ({ _kind: "external", data: e }));

    const all = [...nativeItems, ...externalItems];

    // Comparable price across both kinds; null (hidden or not listed) sorts
    // last in either direction rather than pretending to be free.
    const priceKey = (item: FeedItem): number | null =>
      item._kind === "native"
        ? item.data.hidePrice
          ? null
          : priceOf(item.data)
        : externalPriceOf(item.data);
    const byPrice = (dir: 1 | -1) => (a: FeedItem, b: FeedItem) => {
      const pa = priceKey(a);
      const pb = priceKey(b);
      if (pa === null) return pb === null ? 0 : 1;
      if (pb === null) return -1;
      return (pa - pb) * dir;
    };

    switch (filters.sort) {
      case "furthest":
        all.sort((a, b) => +new Date(b.data.date) - +new Date(a.data.date));
        break;
      case "price_asc":
        all.sort(byPrice(1));
        break;
      case "price_desc":
        all.sort(byPrice(-1));
        break;
      default:
        all.sort((a, b) => +new Date(a.data.date) - +new Date(b.data.date));
    }
    return all;
  }, [publicEvents, externalEvents, filters]);

  const loc = filters.location;
  const locationLabel = filters.online
    ? "Online"
    : loc?.city
    ? `${loc.city}${loc.state ? `, ${loc.state}` : ""}`
    : loc?.state
    ? `${loc.state}${loc.country ? `, ${loc.country}` : ""}`
    : loc?.country || "Anywhere";

  const filterCount = activeFilterCount(filters);
  const resetFilters = () => applyFilters(DEFAULT_EVENT_FILTERS);

  // The applied filters as removable pills under the header, so the effect of
  // the Filter page stays visible (and undoable) without reopening it.
  const activePills: { key: string; label: string; clear: () => void }[] = [];
  if (filters.online || loc?.city || loc?.state || loc?.country) {
    activePills.push({
      key: "loc",
      label: `📍 ${locationLabel}`,
      clear: () => applyFilters({ ...filters, location: null, online: false }),
    });
  }
  if (filters.category) {
    activePills.push({ key: "cat", label: filters.category, clear: () => applyFilters({ ...filters, category: null }) });
  }
  if (filters.date !== "any") {
    activePills.push({ key: "date", label: DATE_LABEL[filters.date], clear: () => applyFilters({ ...filters, date: "any" }) });
  }
  if (filters.price !== "any") {
    activePills.push({ key: "price", label: PRICE_LABEL[filters.price], clear: () => applyFilters({ ...filters, price: "any" }) });
  }
  if (filters.sort !== "soonest") {
    activePills.push({ key: "sort", label: SORT_LABEL[filters.sort], clear: () => applyFilters({ ...filters, sort: "soonest" }) });
  }

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
      const extSym = currencyPrefix(ext.currency);
      const priceLine =
        ext.priceMin == null && ext.priceMax == null
          ? "See tickets"
          : ext.priceMin != null && ext.priceMax != null && ext.priceMin !== ext.priceMax
          ? `${extSym}${Math.round(ext.priceMin)}–${extSym}${Math.round(ext.priceMax)}`
          : `From ${extSym}${Math.round((ext.priceMin ?? ext.priceMax) as number)}`;
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
              <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
              <Text style={styles.metaText}>{formatDate(ext.date)}</Text>
              {!!ext.city && (
                <>
                  <View style={styles.metaDot} />
                  <Ionicons name="location-outline" size={14} color={colors.textDim} />
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
                <Ionicons name="arrow-forward" size={14} color={colors.backgroundDeep} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    const item = feedItem.data;
    const isFree = !item.isPaid && !item.hidePrice;
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
            <Ionicons name={fav ? "heart" : "heart-outline"} size={16} color={fav ? colors.accentPink : "#fff"} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {!!item.createdBy?.username && (
            <Text style={styles.cardHost}>by {item.createdBy.username}</Text>
          )}

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
            <Text style={styles.metaText}>{formatDate(item.date)}</Text>
            <View style={styles.metaDot} />
            <Ionicons name={item.isVirtual ? "videocam-outline" : "location-outline"} size={14} color={colors.textDim} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.priceCluster}>
              <Text style={styles.priceText}>
                {item.hidePrice ? "Price on request" : isFree ? "Free" : `${currencyPrefix(item.currency)}${priceOf(item)}`}
              </Text>
              {/* Spot counts are organizer-only; guests just get "Sold out". */}
              {typeof left === "number" ? (
                <Text style={[styles.scarcityText, scarce && { color: SCARCITY_WARN }]}>
                  {scarce ? `Only ${left} left` : `${left} spots`}
                </Text>
              ) : item.soldOut ? (
                <Text style={[styles.scarcityText, { color: SCARCITY_WARN }]}>Sold out</Text>
              ) : null}
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
                {item.userHasPurchased ? "View" : item.hidePrice ? "Negotiate" : isFree ? "Join free" : "Get ticket"}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.backgroundDeep} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = (
    <View style={{ gap: 14, paddingBottom: 2 }}>
      {/* Location summary — opens the Filter page */}
      <TouchableOpacity
        style={styles.locationChip}
        activeOpacity={0.8}
        onPress={() => setFiltersOpen(true)}
      >
        <View style={styles.locationIconBox}>
          <Ionicons name="navigate" size={16} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.locationKicker}>SHOWING EVENTS IN</Text>
          <Text style={styles.locationValue} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </TouchableOpacity>

      {/* Applied filters — each removable, plus Clear all */}
      {activePills.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {activePills.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={styles.activePill}
              onPress={p.clear}
              activeOpacity={0.8}
              accessibilityLabel={`Remove filter ${p.label}`}
            >
              <Text style={styles.activePillText} numberOfLines={1}>{p.label}</Text>
              <Ionicons name="close" size={13} color={colors.textBright} />
            </TouchableOpacity>
          ))}
          {activePills.length > 1 && (
            <TouchableOpacity style={styles.clearAll} onPress={resetFilters} activeOpacity={0.7}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="compass-outline" size={56} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>No events nearby</Text>
        <Text style={styles.emptyText}>Try widening your location or clearing filters.</Text>
        {filterCount > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
            <Text style={styles.resetBtnText}>Reset filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Rendered below the primary list — either after a thin result set or
  // after the "no events" empty state (ListFooterComponent renders in both
  // cases). Reuses the same card layout as the primary feed.
  const renderNearbySection = () => {
    if (!nearby || nearby.events.length === 0) return null;
    const label = nearby.state ? `${nearby.city}, ${nearby.state}` : nearby.city;
    return (
      <View style={styles.nearbySection}>
        <Text style={styles.nearbyTitle}>Not much happening here — check out {label}</Text>
        {nearby.events.map((ev) => (
          <View key={`nearby-${ev._id}`}>{renderCard({ item: { _kind: "native", data: ev } })}</View>
        ))}
      </View>
    );
  };

  const renderFooter = () => {
    if (loading) return null;
    if (visibleEvents.length === 0) return renderNearbySection();
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <Text style={styles.footerText}>Loading more…</Text>
        </View>
      );
    }
    if (!hasMore) {
      // Confirms pagination actually finished rather than silently stopping —
      // otherwise the list just ends with no feedback, which reads as broken.
      return (
        <>
          <View style={styles.footerLoader}>
            <Text style={styles.footerText}>You've reached the end</Text>
          </View>
          {renderNearbySection()}
        </>
      );
    }
    return (
      <>
        <TouchableOpacity style={styles.seeMoreBtn} onPress={handleLoadMore} activeOpacity={0.85}>
          <Text style={styles.seeMoreBtnText}>See more events</Text>
        </TouchableOpacity>
        {renderNearbySection()}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Ambient header wash — deep purple on dark, soft lavender on light so
          the top of the page doesn't clash with the light background. */}
      <LinearGradient
        colors={[isDark ? "#1A0B2E" : "#EDE9FE", colors.backgroundDeep]}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.ambientGlow} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Pinned header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <GlassBackButton size={38} />
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setFiltersOpen(true)}
              hitSlop={6}
              accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : "Filters"}
            >
              <Ionicons name="options-outline" size={18} color={colors.textBright} />
              {filterCount > 0 && (
                <View style={styles.filtersBadge}>
                  <Text style={styles.filtersBadgeText}>{filterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Public events</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.subtitleCount}>
              {totalEvents + visibleEvents.filter((e) => e._kind === "external").length}
            </Text>{" "}
            happening near you
          </Text>
        </View>

        {loading && page === 1 ? (
          <View style={{ paddingTop: 14, gap: 14 }}>
            {ListHeader}
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.card, { marginBottom: 0 }]}>
                <View
                  style={[
                    styles.poster,
                    { backgroundColor: isDark ? "#241540" : colors.cardAlt },
                  ]}
                />
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          />
        )}
      </SafeAreaView>

      <EventFiltersPage
        visible={filtersOpen}
        value={filters}
        categories={eventCategories}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.backgroundDeep },
  ambientGlow: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: c.primaryFadedStrong,
  },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 14 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassFill,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: c.accentPink,
    borderWidth: 2,
    borderColor: c.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersBadgeText: { fontFamily: AU_FONT.bodyBold, fontSize: 9.5, color: c.white },
  title: {
    fontFamily: AU_FONT.display,
    fontSize: 32,
    color: c.textBright,
    letterSpacing: -0.96,
    lineHeight: 33,
  },
  subtitle: { fontFamily: AU_FONT.body, fontSize: 13, color: c.textDim, marginTop: -8 },
  subtitleCount: { fontFamily: AU_FONT.bodySemi, color: c.primaryLight },

  listContent: { paddingTop: 14, paddingBottom: 40, gap: 14 },

  // Location chip
  locationChip: {
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: c.primaryFaded,
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
    backgroundColor: c.primaryFadedStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  locationKicker: {
    fontFamily: AU_FONT.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: c.primaryLight,
  },
  locationValue: {
    fontFamily: AU_FONT.bold,
    fontSize: 15,
    color: c.textBright,
    letterSpacing: -0.15,
    marginTop: 2,
  },

  // Applied-filter pills
  pillRow: { gap: 8, paddingHorizontal: 20, alignItems: "center" },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: c.primaryFadedStrong,
    maxWidth: 220,
  },
  activePillText: { fontFamily: AU_FONT.bodySemi, fontSize: 12.5, color: c.textBright, flexShrink: 1 },
  clearAll: { paddingVertical: 7, paddingHorizontal: 6 },
  clearAllText: { fontFamily: AU_FONT.bodySemi, fontSize: 12.5, color: c.primaryLight },

  // Card
  card: {
    marginHorizontal: 20,
    borderRadius: 18,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassFill,
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
    backgroundColor: c.imageScrim,
    maxWidth: "60%",
  },
  tagPillText: { fontFamily: AU_FONT.bodyBold, fontSize: 10, color: c.white, letterSpacing: 0.8 },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.imageScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  cardTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: c.textBright, letterSpacing: -0.36, lineHeight: 21 },
  cardHost: { fontFamily: AU_FONT.body, fontSize: 12, color: c.textFaint, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 5 },
  metaText: { fontFamily: AU_FONT.body, fontSize: 12, color: c.textDim, flexShrink: 1 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.textDim, opacity: 0.55, marginHorizontal: 2 },
  cardFooter: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: c.glassFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceCluster: { flexDirection: "row", alignItems: "baseline", gap: 8, flexShrink: 1 },
  priceText: { fontFamily: AU_FONT.bold, fontSize: 20, color: c.textBright, letterSpacing: -0.4 },
  scarcityText: { fontFamily: AU_FONT.body, fontSize: 11, color: c.textFaint },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: c.textBright,
  },
  ctaText: { fontFamily: AU_FONT.bodyBold, fontSize: 12.5, color: c.backgroundDeep, letterSpacing: -0.06 },

  // Skeleton
  skelLine: { height: 14, borderRadius: 7, backgroundColor: c.glassFill, width: "70%" },

  // Empty
  emptyContainer: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: c.textBright, marginTop: 6 },
  emptyText: { fontFamily: AU_FONT.body, fontSize: 14, color: c.textDim, textAlign: "center", lineHeight: 20 },
  resetBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
  },
  resetBtnText: { fontFamily: AU_FONT.bodyBold, fontSize: 13, color: c.textBright },

  footerLoader: { paddingVertical: 20, alignItems: "center" },
  footerText: { fontFamily: AU_FONT.body, fontSize: 13, color: c.textDim },
  seeMoreBtn: {
    marginHorizontal: 20,
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primaryFaded,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  seeMoreBtnText: { fontFamily: AU_FONT.bodyBold, fontSize: 14, color: c.primaryLight },

  // Nearby-city fallback
  nearbySection: { marginTop: 22, gap: 14 },
  nearbyTitle: {
    fontFamily: AU_FONT.bodySemi,
    fontSize: 13,
    color: c.textDim,
    marginHorizontal: 20,
  },
});
