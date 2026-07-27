import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

// Instant, offline matches from the user's own recent picks and CityVibe's
// curated city list — shown the moment a character is typed, no network
// round trip. The debounced Nominatim search (below) merges in broader
// results shortly after for queries specific enough to be worth it.
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

export default function SelectLocation() {
  const router = useRouter();
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
    const load = async () => {
      try {
        const savedRecent = await SecureStore.getItemAsync(RECENT_KEY);
        if (savedRecent) setRecent(JSON.parse(savedRecent));
      } catch {}
    };
    load();
  }, []);

  const addToRecent = async (city: string) => {
    const next = [city, ...recent.filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(0, MAX_RECENT);
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
    const trimmed = query.trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    if (!trimmed) {
      setSuggestions([{ label: "Anywhere", value: "" }]);
      setLoading(false);
      setError(null);
      return;
    }

    // Instant, offline suggestions — shown immediately on every keystroke
    // (even the very first character), no network wait. The debounced
    // network search below only refines/broadens this once the query is
    // specific enough to be worth a real lookup.
    const instantMatches = localCityMatches(trimmed, recent);
    setSuggestions([{ label: "Anywhere", value: "" }, ...instantMatches]);
    setError(null);

    // A single character is too broad to search Nominatim usefully (and
    // hammers their rate limit for little benefit) — the instant local
    // matches above already cover that case.
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
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&accept-language=en&q=${encodeURIComponent(trimmed)}`,
          {
            headers: { "Accept-Language": "en", "User-Agent": "CityVibe-App/1.0" },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Location lookup failed with status ${response.status}`);
        }

        const data = await response.json();
        const rawResults = Array.isArray(data) ? data : [];
        // Nominatim's `addresstype` says what kind of place actually matched
        // (city/town/village vs. state/country/etc). Without this filter, a
        // query like "Lagos" also surfaces "Lagos State" (the admin region,
        // not the city) and other non-city matches, which look like extra
        // confusing near-duplicate "Lagos" entries — none of them a real
        // city a user meant to pick. Restrict to actual populated places.
        const CITY_LIKE_TYPES = new Set(["city", "town", "village", "municipality"]);
        const nextSuggestions = rawResults
          .filter((item: any) => CITY_LIKE_TYPES.has(item?.addresstype))
          .map((item: any) => {
            const address = item?.address || {};
            const city =
              address[item.addresstype] || address.city || address.town || address.village || item?.name || "";
            const country = address.country || "";
            const label = country ? `${city}, ${country}` : city;
            return city ? { label, value: city } : null;
          })
          .filter(Boolean) as LocationSuggestion[];

        // Dedupe on the bare city name alone, NOT label+country: `value` is
        // all that actually gets stored/filtered on (see saveAndClose below
        // and the backend's city match), so "Lagos, Nigeria" and "Lagos,
        // Portugal" would resolve to the exact same filter — showing both
        // is two picks for one outcome, not a real disambiguation. Results
        // arrive ordered by relevance, so the first (most relevant) match
        // for a given city name wins.
        const uniqueSuggestions = nextSuggestions.filter((suggestion, index, array) => {
          const currentKey = suggestion.value.toLowerCase();
          return array.findIndex((item) => item.value.toLowerCase() === currentKey) === index;
        });

        // Merge into the instant local matches already on screen — append
        // only genuinely new cities so results grow/refine instead of
        // flickering as the network response lands.
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
          // Keep the instant local matches on screen — only complain if
          // there was nothing to fall back on.
          if (instantMatches.length === 0) {
            setError("We couldn't fetch locations right now.");
          }
        }
      } finally {
        if (controllerRef.current === controller) {
          setLoading(false);
        }
      }
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, recent]);

  const saveAndClose = async (suggestion: LocationSuggestion) => {
    const value = suggestion.value || null;
    await setActiveCity(value);
    try {
      if (value) {
        await addToRecent(value);
      }
      // Marks this as an explicit user choice — see resolveHomeLocation in
      // home.tsx, which won't silently overwrite a manual pick with a fresh
      // GPS/IP guess on a later app open.
      await SecureStore.setItemAsync("citySource", "manual");
    } catch {}
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.textBright} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Choose location</Text>
          <Text style={styles.subtitle}>Pick a city to filter the home feed.</Text>
        </View>
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
          <TouchableOpacity onPress={() => setQuery("")} activeOpacity={0.7}>
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

      <ScrollView contentContainerStyle={styles.list}>
        {suggestions.map((suggestion, index) => {
          const active = selectedCity === (suggestion.value || null);
          return (
            <TouchableOpacity
              key={`${suggestion.label}-${suggestion.value || "anywhere"}-${index}`}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => saveAndClose(suggestion)}
              activeOpacity={0.9}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{suggestion.label}</Text>
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
                  onPress={() => saveAndClose({ label: city, value: city })}
                  activeOpacity={0.9}
                >
                  <View style={styles.recentLabelRow}>
                    <Ionicons name="time-outline" size={16} color={colors.textDim} />
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{city}</Text>
                  </View>
                  <View style={styles.recentActions}>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
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
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.backgroundDeep,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: {
      fontFamily: "BricolageGrotesque_700Bold",
      fontSize: 18,
      color: c.textBright,
    },
    subtitle: {
      fontFamily: Fonts.regular,
      fontSize: 12,
      color: c.textDim,
      marginTop: 2,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 14,
      color: c.textBright,
      paddingVertical: 0,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 10,
    },
    statusText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      marginHorizontal: 16,
      marginTop: 8,
    },
    list: {
      padding: 16,
      gap: 10,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    optionActive: {
      borderColor: c.primaryBorder,
      backgroundColor: c.primaryFadedStrong,
    },
    optionText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14,
      color: c.textBright,
    },
    optionTextActive: {
      color: c.primaryLight,
    },
    sectionLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 12,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 4,
      marginBottom: -2,
    },
    recentLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    recentActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
  });
