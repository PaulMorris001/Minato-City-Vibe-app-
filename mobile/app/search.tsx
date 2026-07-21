import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { formatLocation } from "@/utils/location";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { useStripePayment } from "@/hooks/useStripePayment";
import { ensureAuth } from "@/utils/requireAuth";
import { trackEvent } from "@/utils/analytics";
import { LocationFilterBar } from "@/components/shared";
import GlassBackButton from "@/components/shared/GlassBackButton";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import ExternalEventCard from "@/components/shared/ExternalEventCard";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import type { Guide, LocationSelection } from "@/libs/interfaces";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

const RECENT_SEARCHES_KEY = "recentSearches";
const MAX_RECENT_SEARCHES = 8;

type TypeFilter = "all" | "events" | "guides";
type EventFeedItem =
  | { _kind: "native"; data: PublicEvent }
  | { _kind: "external"; data: ExternalEvent };

function GuideResultCard({ guide, onPress }: { guide: Guide; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const formatPrice = useFormatPrice();
  return (
    <TouchableOpacity style={styles.guideCard} activeOpacity={0.85} onPress={onPress}>
      <Text style={styles.guideTitle} numberOfLines={2}>{guide.title}</Text>
      <Text style={styles.guideMeta} numberOfLines={1}>
        {formatLocation({ city: guide.city, state: guide.cityState, country: guide.country || "" })}
      </Text>
      <Text style={styles.guideAuthor} numberOfLines={1}>by {guide.authorName}</Text>
      <View style={styles.guideFooter}>
        <Text style={styles.guidePrice}>
          {guide.price === 0 ? "FREE" : `$${formatPrice(guide.price)}`}
        </Text>
        <View style={styles.guideViews}>
          <Ionicons name="eye-outline" size={13} color={colors.textDim} />
          <Text style={styles.guideViewsText}>{guide.views}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { payForTicket } = useStripePayment();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [locationFilter, setLocationFilter] = useState<LocationSelection | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [guides, setGuides] = useState<Guide[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(false);

  const fetchEventsPool = async (loc: LocationSelection | null) => {
    setEventsLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const qs = new URLSearchParams({ limit: "50" });
      if (loc?.city) qs.append("city", loc.city);
      if (loc?.state) qs.append("state", loc.state);
      if (loc?.country) qs.append("country", loc.country);
      const response = await fetch(`${BASE_URL}/events/public/explore?${qs.toString()}`, { headers });
      const data = await response.json();
      if (response.ok) setPublicEvents(data.events || []);
    } catch {
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchExternalEventsPool = async (loc: LocationSelection | null) => {
    try {
      const res = await externalEventService.explore({
        city: loc?.city || undefined,
        country: loc?.country || undefined,
        limit: 30,
      });
      setExternalEvents(res.events || []);
    } catch {
      setExternalEvents([]);
    }
  };

  useEffect(() => {
    fetchEventsPool(locationFilter);
    fetchExternalEventsPool(locationFilter);
  }, [locationFilter]);

  useEffect(() => {
    const loadRecentSearches = async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (raw) setRecentSearches(JSON.parse(raw));
      } catch {}
    };
    loadRecentSearches();
  }, []);

  const saveRecentSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const deduped = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...deduped].slice(0, MAX_RECENT_SEARCHES);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item !== term);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setGuides([]);
      setGuidesLoading(false);
      return;
    }
    setGuidesLoading(true);
    const handle = setTimeout(async () => {
      saveRecentSearch(trimmed);
      try {
        const token = await SecureStore.getItemAsync("token");
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const qs = new URLSearchParams({ search: trimmed });
        if (locationFilter?.city) qs.append("city", locationFilter.city);
        if (locationFilter?.state) qs.append("state", locationFilter.state);
        if (locationFilter?.country) qs.append("country", locationFilter.country);
        const response = await fetch(`${BASE_URL}/guides/all?${qs.toString()}`, { headers });
        const data = await response.json();
        if (response.ok) setGuides(data.guides || []);
      } catch {
      } finally {
        setGuidesLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, locationFilter]);

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    if (!(await ensureAuth("buy a ticket"))) return;
    const result = await payForTicket(eventId);
    if (!result.success) {
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
    fetchEventsPool(locationFilter);
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
        fetchEventsPool(locationFilter);
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch {
      Alert.alert("Error", "Failed to join event");
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const buildSearchableText = (values: (string | undefined | null)[]) =>
    values.filter(Boolean).join(" ").toLowerCase();

  const eventMatchesQuery = (event: PublicEvent | ExternalEvent) => {
    const haystack = buildSearchableText([
      event.title,
      (event as PublicEvent).location,
      (event as ExternalEvent).venueName,
      (event as ExternalEvent).location,
      (event as PublicEvent).description,
    ]);
    return haystack.includes(normalizedQuery);
  };

  const eventResults: EventFeedItem[] = hasQuery
    ? [
        ...publicEvents.filter(eventMatchesQuery).map((data) => ({ _kind: "native" as const, data })),
        ...externalEvents.filter(eventMatchesQuery).map((data) => ({ _kind: "external" as const, data })),
      ].sort((a, b) => new Date(a.data.date).getTime() - new Date(b.data.date).getTime())
    : [];

  const showEvents = typeFilter === "all" || typeFilter === "events";
  const showGuides = typeFilter === "all" || typeFilter === "guides";

  return (
    <LinearGradient colors={[colors.backgroundSecondary, colors.backgroundTertiary]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Search</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events & guides"
            placeholderTextColor={colors.textDim}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {(["all", "events", "guides"] as const).map((option) => {
            const active = typeFilter === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setTypeFilter(option)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {option === "all" ? "All" : option === "events" ? "Events" : "Guides"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.locationFilterWrap}>
          <LocationFilterBar
            value={locationFilter}
            onChange={setLocationFilter}
            onClear={() => setLocationFilter(null)}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!hasQuery ? (
            recentSearches.length > 0 ? (
              <View style={styles.recentContainer}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>Recent searches</Text>
                  <TouchableOpacity onPress={clearRecentSearches} activeOpacity={0.7}>
                    <Text style={styles.recentClear}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.recentChips}>
                  {recentSearches.map((term) => (
                    <TouchableOpacity
                      key={term}
                      style={styles.recentChip}
                      onPress={() => setQuery(term)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textDim} />
                      <Text style={styles.recentChipText}>{term}</Text>
                      <TouchableOpacity
                        onPress={() => removeRecentSearch(term)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={14} color={colors.textDim} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={48} color={colors.textDim} />
                <Text style={styles.emptyText}>Search for events and guides</Text>
              </View>
            )
          ) : (
            <>
              {showEvents && (
                <View style={styles.resultGroup}>
                  <Text style={styles.resultGroupTitle}>Events</Text>
                  {eventsLoading ? (
                    <Text style={styles.statusText}>Searching events…</Text>
                  ) : eventResults.length > 0 ? (
                    eventResults.map((item) => (
                      <View key={`${item._kind}-${item.data._id}`} style={styles.resultCardWrap}>
                        {item._kind === "native" ? (
                          <PublicEventCard
                            event={item.data}
                            onPurchaseTicket={handlePurchaseTicket}
                            onJoinFreeEvent={handleJoinFreeEvent}
                            style={styles.eventCardOverride}
                          />
                        ) : (
                          <ExternalEventCard event={item.data} style={styles.eventCardOverride} />
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyGroupText}>No events matched your search.</Text>
                  )}
                </View>
              )}

              {showGuides && (
                <View style={styles.resultGroup}>
                  <Text style={styles.resultGroupTitle}>Guides</Text>
                  {guidesLoading ? (
                    <Text style={styles.statusText}>Searching guides…</Text>
                  ) : guides.length > 0 ? (
                    guides.map((guide) => (
                      <View key={guide._id} style={styles.resultCardWrap}>
                        <GuideResultCard guide={guide} onPress={() => router.push(`/guide/${guide._id}` as any)} />
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyGroupText}>No guides matched your search.</Text>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: { marginRight: 16 },
  headerTitle: {
    flex: 1,
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: c.textBright,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: c.textBright,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterChipActive: {
    backgroundColor: c.primaryFadedStrong,
    borderColor: c.primaryBorder,
  },
  filterChipText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: c.textSecondary,
  },
  filterChipTextActive: {
    color: c.primaryLight,
    fontFamily: "BricolageGrotesque_700Bold",
  },
  locationFilterWrap: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textDim,
    marginTop: 12,
    textAlign: "center",
  },
  recentContainer: {
    paddingTop: 8,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  recentTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    color: c.textBright,
  },
  recentClear: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: c.primary,
  },
  recentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  recentChipText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: c.textSecondary,
  },
  resultGroup: {
    gap: 10,
    marginBottom: 24,
  },
  resultGroupTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 16,
    color: c.textBright,
    marginBottom: 2,
  },
  resultCardWrap: {
    marginBottom: 8,
  },
  eventCardOverride: {
    height: 300,
    borderRadius: 18,
  },
  statusText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: c.textDim,
    paddingVertical: 8,
  },
  emptyGroupText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: c.textDim,
    paddingVertical: 8,
  },
  guideCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.glassFillSubtle,
    padding: 14,
    gap: 6,
  },
  guideTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: c.textBright,
    lineHeight: 19,
  },
  guideMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textDim,
  },
  guideAuthor: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textFaint,
  },
  guideFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  guidePrice: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: c.primary,
  },
  guideViews: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  guideViewsText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: c.textDim,
  },
});
