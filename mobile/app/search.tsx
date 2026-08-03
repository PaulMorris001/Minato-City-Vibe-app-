import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { useActiveCity } from "@/hooks/useActiveCity";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { useDiscoverFeed, DiscoverItem } from "@/hooks/useDiscoverFeed";
import { useEventActions } from "@/hooks/useEventActions";
import {
  search as runSearch,
  emptySearchResponse,
  SearchResponse,
  SearchType,
} from "@/services/search.service";
import {
  ActiveLocationChip,
  GlassBackButton,
  EmptyState,
  GuideCard,
  VendorRow,
  UserRow,
} from "@/components/shared";
import PublicEventCard from "@/components/shared/PublicEventCard";
import ExternalEventCard from "@/components/shared/ExternalEventCard";

const RECENT_KEY = "recentSearches";
const MAX_RECENT = 8;
const MIN_QUERY = 2;

/** Chips across the top. "all" shows a preview of every type. */
type Chip = "all" | SearchType;
const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "events", label: "Events" },
  { key: "guides", label: "Guides" },
  { key: "vendors", label: "Vendors" },
  { key: "users", label: "People" },
];

/** Preview size under the "All" chip; a focused chip pages properly. */
const PREVIEW_LIMIT = 5;
const FOCUSED_LIMIT = 20;

type Section =
  | { kind: "discover"; title: null; total: 0; data: DiscoverItem[] }
  | { kind: SearchType; title: string; total: number; data: any[] };

/**
 * Search and browse in one screen.
 *
 * Empty query → the Discover feed (public + promoted third-party events for the
 * active city). Two characters or more → results across events, guides, vendors
 * and people. This screen absorbed the home header's separate location pill and
 * search bar, so the location control lives here and writes to the app-wide
 * active city.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // Only autofocus when arriving from a search affordance. This screen doubles
  // as the browse surface, so an unconditional keyboard would cover the feed.
  const params = useLocalSearchParams<{ focus?: string }>();

  const activeCity = useActiveCity();

  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [online, setOnline] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);

  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmed = debouncedQuery.trim();
  const isSearching = trimmed.length >= MIN_QUERY;

  const [results, setResults] = useState<SearchResponse>(() => emptySearchResponse());
  const [loading, setLoading] = useState(false);

  const discover = useDiscoverFeed({ city: activeCity, online });
  const { purchaseTicket, joinFreeEvent } = useEventActions({ onDone: discover.refresh });

  // ── Recent searches ────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => raw && setRecents(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  /**
   * Persist a term. Called only on an explicit commit (submit, tapping a
   * result, choosing a chip) — never on a debounce tick, which used to store
   * every partial prefix of what the user typed.
   */
  const commitRecent = useCallback((term: string) => {
    const value = term.trim();
    if (value.length < MIN_QUERY) return;
    setRecents((prev) => {
      const next = [value, ...prev.filter((r) => r !== value)].slice(0, MAX_RECENT);
      // Persisted outside the updater — a side effect in a reducer double-fires
      // under StrictMode.
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  }, []);

  // ── Search ─────────────────────────────────────────────────────────────────
  // Debouncing alone doesn't prevent an earlier slow response landing after a
  // later fast one, so requests are both aborted and sequence-checked.
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isSearching) {
      abortRef.current?.abort();
      setResults(emptySearchResponse());
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    runSearch({
      q: trimmed,
      types: chip === "all" ? undefined : [chip],
      city: activeCity,
      limit: chip === "all" ? PREVIEW_LIMIT : FOCUSED_LIMIT,
      signal: controller.signal,
    })
      .then((data) => {
        if (requestId !== requestIdRef.current) return; // superseded
        setResults(data);
      })
      .catch((err) => {
        if (err?.name === "AbortError" || requestId !== requestIdRef.current) return;
        setResults(emptySearchResponse(trimmed));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [trimmed, isSearching, chip, activeCity]);

  // ── Sections ───────────────────────────────────────────────────────────────
  const sections = useMemo<Section[]>(() => {
    if (!isSearching) {
      return [{ kind: "discover", title: null, total: 0, data: discover.items }];
    }
    const { buckets } = results;
    const order: { key: SearchType; title: string }[] = [
      { key: "events", title: "Events" },
      { key: "guides", title: "Guides" },
      { key: "vendors", title: "Vendors" },
      { key: "users", title: "People" },
    ];
    return order
      .filter(({ key }) => (chip === "all" ? true : key === chip))
      .map(({ key, title }) => ({
        kind: key,
        title,
        total: buckets[key].total,
        data: buckets[key].items,
      }))
      .filter((s) => s.data.length > 0 || (s.kind === "users" && results.buckets.users.requiresAuth));
  }, [isSearching, discover.items, results, chip]);

  const openResult = (term: string, go: () => void) => {
    commitRecent(term);
    go();
  };

  // ── Rendering ──────────────────────────────────────────────────────────────
  const renderItem = ({ item, section }: { item: any; section: Section }) => {
    if (section.kind === "discover" || section.kind === "events") {
      const isDiscover = section.kind === "discover";
      const kind = isDiscover ? item._kind : item.kind;
      const data = isDiscover ? item.data : item;
      return (
        <View style={styles.cardWrap}>
          {kind === "external" ? (
            <ExternalEventCard event={data} />
          ) : (
            <PublicEventCard
              event={data}
              onPurchaseTicket={purchaseTicket}
              onJoinFreeEvent={joinFreeEvent}
            />
          )}
        </View>
      );
    }
    if (section.kind === "guides") {
      return (
        <View style={styles.rowWrap}>
          <GuideCard
            guide={item}
            onPress={(g) => openResult(trimmed, () => router.push(`/guide/${g._id}` as any))}
          />
        </View>
      );
    }
    if (section.kind === "vendors") {
      return (
        <View style={styles.rowWrap}>
          <VendorRow
            vendor={item}
            onPress={(v) =>
              openResult(trimmed, () => router.push(`/vendor-details/${v._id}` as any))
            }
          />
        </View>
      );
    }
    return (
      <View style={styles.rowWrap}>
        <UserRow user={item} />
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: Section }) => {
    if (!section.title) return null;
    const showAll = chip === "all" && section.total > section.data.length;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {showAll && (
          <TouchableOpacity onPress={() => setChip(section.kind as Chip)} activeOpacity={0.7}>
            <Text style={styles.seeAll}>See all ({section.total})</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.filterRow}>
        <ActiveLocationChip city={activeCity} />
        {!isSearching && (
          <View style={styles.onlineToggle}>
            <Text style={styles.onlineLabel}>Online</Text>
            <Switch
              value={online}
              onValueChange={setOnline}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        )}
      </View>

      {isSearching && (
        <View style={styles.chipsRow}>
          {CHIPS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, chip === c.key && styles.chipActive]}
              onPress={() => {
                setChip(c.key);
                commitRecent(trimmed);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, chip === c.key && styles.chipTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!isSearching && recents.length > 0 && (
        <View style={styles.recentsBlock}>
          <View style={styles.recentsHeader}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <TouchableOpacity onPress={clearRecents} activeOpacity={0.7}>
              <Text style={styles.seeAll}>Clear</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recentsRow}>
            {recents.map((r) => (
              <TouchableOpacity
                key={r}
                style={styles.recentChip}
                onPress={() => setQuery(r)}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={styles.recentChipText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!isSearching && !discover.loading && (
        <Text style={styles.sectionTitle}>
          {online ? "Online events" : activeCity ? `Happening in ${activeCity}` : "Happening soon"}
        </Text>
      )}
    </View>
  );

  const listEmpty = () => {
    if (loading || discover.loading) return null;
    if (isSearching) {
      if (results.buckets.users.requiresAuth && chip === "users") {
        return (
          <EmptyState
            icon="person-outline"
            title="Log in to search people"
            subtitle="Events, guides and vendors are open to everyone."
            actionLabel="Log in"
            onAction={() => router.push("/login")}
          />
        );
      }
      return (
        <EmptyState
          title={`No results for "${trimmed}"`}
          subtitle="Try a different spelling, or widen your location."
        />
      );
    }
    return (
      <EmptyState
        icon="calendar-outline"
        title="Nothing here yet"
        subtitle={
          activeCity
            ? `No upcoming events in ${activeCity}. Try another city.`
            : "Pick a location to see what's on."
        }
      />
    );
  };

  const listFooter = () => {
    if (isSearching) return loading ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null;
    if (discover.loadingMore) return <ActivityIndicator style={styles.footer} color={colors.primary} />;
    // The nearby fallback: this city is quiet, here's the nearest one that isn't.
    if (discover.nearby && discover.nearby.events.length > 0) {
      const label = discover.nearby.state
        ? `${discover.nearby.city}, ${discover.nearby.state}`
        : discover.nearby.city;
      return (
        <View style={styles.nearbyBlock}>
          <Text style={styles.nearbyTitle}>Not much happening here — check out {label}</Text>
          {discover.nearby.events.map((ev) => (
            <View key={`nearby-${ev._id}`} style={styles.cardWrap}>
              <PublicEventCard
                event={ev}
                onPurchaseTicket={purchaseTicket}
                onJoinFreeEvent={joinFreeEvent}
              />
            </View>
          ))}
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textDim} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, guides, vendors, people"
            placeholderTextColor={colors.textDim}
            autoFocus={params.focus === "1"}
            returnKeyType="search"
            onSubmitEditing={() => commitRecent(query)}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(loading && isSearching) || (discover.loading && !isSearching) ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : null}

      <SectionList
        sections={sections as any}
        keyExtractor={(item: any, index) => `${item._id || item.id || index}`}
        renderItem={renderItem as any}
        renderSectionHeader={renderSectionHeader as any}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={!isSearching ? discover.loadMore : undefined}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backButton: {},
    searchBar: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    input: { flex: 1, fontSize: 15, fontFamily: Fonts.regular, color: c.text, padding: 0 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    onlineToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
    onlineLabel: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    chip: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary },
    chipTextActive: { color: c.white },
    recentsBlock: { marginBottom: 16 },
    recentsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    recentsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    recentChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    recentChipText: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: c.background,
    },
    sectionTitle: { fontSize: 17, fontFamily: Fonts.bold, color: c.text },
    seeAll: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.primary },
    cardWrap: { marginBottom: 12 },
    rowWrap: { marginBottom: 4 },
    loader: { marginTop: 24 },
    footer: { marginVertical: 20 },
    nearbyBlock: { marginTop: 20 },
    nearbyTitle: {
      fontSize: 15,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 12,
    },
  });
