import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface LocationSuggestion {
  label: string;
  value: string;
}

export default function SelectLocation() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await SecureStore.getItemAsync("selectedCity");
        setSelectedCity(saved || null);
      } catch {}
    };
    load();
  }, []);

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

    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
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
        const nextSuggestions = rawResults
          .map((item: any) => {
            const address = item?.address || {};
            const city = address.city || address.town || address.village || address.county || address.state || address.country || item?.name || "";
            const country = address.country || "";
            const label = country ? `${city}, ${country}` : city;
            return city ? { label, value: city } : null;
          })
          .filter(Boolean) as LocationSuggestion[];

        const uniqueSuggestions = nextSuggestions.filter((suggestion, index, array) => {
          const currentKey = `${suggestion.label}-${suggestion.value}`.toLowerCase();
          return array.findIndex((item) => `${item.label}-${item.value}`.toLowerCase() === currentKey) === index;
        });

        if (uniqueSuggestions.length > 0) {
          setSuggestions([{ label: "Anywhere", value: "" }, ...uniqueSuggestions]);
          setError(null);
        } else {
          setSuggestions([{ label: "Anywhere", value: "" }]);
          setError("No matching places found. Try another city.");
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError("We couldn't fetch locations right now.");
          setSuggestions([{ label: "Anywhere", value: "" }]);
        }
      } finally {
        if (controllerRef.current === controller) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const saveAndClose = async (suggestion: LocationSuggestion) => {
    const value = suggestion.value || null;
    setSelectedCity(value);
    try {
      if (value) {
        await SecureStore.setItemAsync("selectedCity", value);
      } else {
        await SecureStore.deleteItemAsync("selectedCity");
      }
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
  });
