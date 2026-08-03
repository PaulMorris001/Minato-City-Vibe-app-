import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { POPULAR_CITIES } from "@/hooks/useLocation";
import { useActiveCity, setActiveCity } from "@/hooks/useActiveCity";

interface LocationSuggestion {
  label: string;
  value: string;
}

const RECENT_KEY = "recentCitySearches";
const MAX_RECENT = 6;

/**
 * Instant, offline matches from the user's own recent picks and CityVibe's
 * curated city list — shown the moment a character is typed, no network round
 * trip. The debounced Nominatim search merges in broader results shortly after,
 * for queries specific enough to be worth it.
 */
function localCityMatches(query: string, recent: string[]): LocationSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const results: LocationSuggestion[] = [];
  for (const city of recent) {
    const key = city.toLowerCase();
    if (key.startsWith(q) && !seen.has(key)) {
      seen.add(key);
      results.push({ label: city, value: city });
    }
  }
  for (const c of POPULAR_CITIES) {
    const key = c.city.toLowerCase();
    if (key.startsWith(q) && !seen.has(key)) {
      seen.add(key);
      results.push({ label: c.state ? `${c.city}, ${c.state}` : c.city, value: c.city });
    }
  }
  return results.slice(0, 8);
}

/**
 * City picker as a bottom sheet. Writes to the shared active-city store, so
 * picking here updates the home feed, vendors, guides and search at once.
 *
 * Was a full screen (`/select-location`) — a city list is not enough content to
 * justify a whole route, and pushing a screen for it lost the caller's context.
 */
export default function LocationPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const selectedCity = useActiveCity();
  const [recent, setRecent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const savedRecent = await SecureStore.getItemAsync(RECENT_KEY);
        if (savedRecent) setRecent(JSON.parse(savedRecent));
      } catch {}
    })();
  }, []);

  // Reset the query each time the sheet opens — a stale term from last time is
  // never what the user wants to see.
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const addToRecent = async (city: string) => {
    const next = [city, ...recent.filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(
      0,
      MAX_RECENT
    );
    setRecent(next);
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const removeFromRecent = async (city: string) => {
    const next = recent.filter((c) => c.toLowerCase() !== city.toLowerCase());
    setRecent(next);
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (controllerRef.current) controllerRef.current.abort();

    if (!trimmed) {
      setSuggestions([{ label: "Anywhere", value: "" }]);
      setLoading(false);
      setError(null);
      return;
    }

    // Instant offline suggestions on every keystroke, including the first —
    // the debounced network search below only refines this.
    const instantMatches = localCityMatches(trimmed, recent);
    setSuggestions([{ label: "Anywhere", value: "" }, ...instantMatches]);
    setError(null);

    // One character is too broad to search Nominatim usefully (and hammers
    // their rate limit) — the local matches already cover it.
    if (trimmed.length < 2) {
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        // featureType=settlement restricts Nominatim's ranking to populated
        // places instead of mixing in states, countries and POIs. limit=12
        // (not 5) because the addresstype filter below discards some entries.
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12&addressdetails=1&accept-language=en&featureType=settlement&q=${encodeURIComponent(trimmed)}`,
          {
            headers: { "Accept-Language": "en", "User-Agent": "CityVibe-App/1.0" },
            signal: controller.signal,
          }
        );
        if (!response.ok) throw new Error(`Location lookup failed (${response.status})`);

        const data = await response.json();
        const rawResults = Array.isArray(data) ? data : [];
        // `addresstype` says what actually matched. Without this filter,
        // "Lagos" also surfaces "Lagos State" (the admin region) and other
        // non-city matches that look like confusing near-duplicates. The list
        // is intentionally broader than just "city" so towns aren't dropped.
        const CITY_LIKE_TYPES = new Set([
          "city",
          "town",
          "village",
          "municipality",
          "hamlet",
          "suburb",
          "borough",
          "township",
          "city_district",
        ]);
        const nextSuggestions = rawResults
          .filter((item: any) => CITY_LIKE_TYPES.has(item?.addresstype))
          .map((item: any) => {
            const address = item?.address || {};
            const city =
              address[item.addresstype] ||
              address.city ||
              address.town ||
              address.village ||
              item?.name ||
              "";
            const country = address.country || "";
            const label = country ? `${city}, ${country}` : city;
            return city ? { label, value: city } : null;
          })
          .filter(Boolean) as LocationSuggestion[];

        // Dedupe on the bare city name, not label+country: `value` is all that
        // gets stored and filtered on, so "Lagos, Nigeria" and "Lagos,
        // Portugal" resolve to the same filter — showing both is two picks for
        // one outcome. Results arrive by relevance, so the first wins.
        const uniqueSuggestions = nextSuggestions.filter((suggestion, index, array) => {
          const currentKey = suggestion.value.toLowerCase();
          return array.findIndex((item) => item.value.toLowerCase() === currentKey) === index;
        });

        // Merge into what's already on screen — append only genuinely new
        // cities so results grow instead of flickering when the response lands.
        const merged = [...instantMatches];
        const seen = new Set(merged.map((s) => s.value.toLowerCase()));
        for (const s of uniqueSuggestions) {
          const key = s.value.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(s);
          }
        }

        if (merged.length > 0) {
          setSuggestions([{ label: "Anywhere", value: "" }, ...merged]);
          setError(null);
        } else {
          setSuggestions([{ label: "Anywhere", value: "" }]);
          setError("No matching places found. Try another city.");
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // Keep the local matches on screen — only complain if there was
          // nothing to fall back on.
          if (instantMatches.length === 0) setError("We couldn't fetch locations right now.");
        }
      } finally {
        if (controllerRef.current === controller) setLoading(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, recent, visible]);

  const pick = async (suggestion: LocationSuggestion) => {
    const value = suggestion.value || null;
    await setActiveCity(value);
    try {
      if (value) await addToRecent(value);
      // Marks this an explicit choice — see resolveHomeLocation in home.tsx,
      // which won't overwrite a manual pick with a fresh GPS/IP guess later.
      await SecureStore.setItemAsync("citySource", "manual");
    } catch {}
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        {/* Tap outside to dismiss. */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Choose location</Text>
              <Text style={styles.subtitle}>Filters events, guides and vendors.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.textDim} />
            <TextInput
              style={styles.searchInput}
              placeholder="Type a city"
              placeholderTextColor={colors.textDim}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery("")} activeOpacity={0.7} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textDim} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Searching places…</Text>
            </View>
          ) : null}
          {!loading && error ? <Text style={styles.statusText}>{error}</Text> : null}

          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {suggestions.map((suggestion, index) => {
              const active = selectedCity === (suggestion.value || null);
              return (
                <TouchableOpacity
                  key={`${suggestion.label}-${suggestion.value || "anywhere"}-${index}`}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => pick(suggestion)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {suggestion.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}

            {!query.trim() && recent.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Recent</Text>
                {recent.map((city, index) => {
                  const active = selectedCity === city;
                  return (
                    <TouchableOpacity
                      key={`recent-${city}-${index}`}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => pick({ label: city, value: city })}
                      activeOpacity={0.9}
                    >
                      <View style={styles.recentLabelRow}>
                        <Ionicons name="time-outline" size={16} color={colors.textDim} />
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {city}
                        </Text>
                      </View>
                      <View style={styles.recentActions}>
                        {active ? (
                          <Ionicons name="checkmark" size={18} color={colors.primary} />
                        ) : null}
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            removeFromRecent(city);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={18} color={colors.textDim} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
      backgroundColor: c.backgroundDeep,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 28,
      // Tall enough for a useful list, short enough to keep the caller visible.
      maxHeight: "78%",
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginTop: 10,
      marginBottom: 6,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 12,
      gap: 12,
    },
    title: { fontFamily: Fonts.bold, fontSize: 18, color: c.textBright },
    subtitle: { fontFamily: Fonts.regular, fontSize: 13, color: c.textDim, marginTop: 2 },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: c.textBright,
      padding: 0,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    statusText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    list: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    optionActive: { borderColor: c.primary },
    optionText: { fontFamily: Fonts.semiBold, fontSize: 15, color: c.textBright },
    optionTextActive: { color: c.primary },
    sectionLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 12,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 14,
      marginBottom: 2,
    },
    recentLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    recentActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  });
