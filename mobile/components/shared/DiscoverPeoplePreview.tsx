import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { useActiveCity } from "@/hooks/useActiveCity";
import PersonSuggestionCard from "./PersonSuggestionCard";
import { fetchPeopleSuggestions, type SuggestedPerson } from "@/services/people.service";

const PREVIEW_LIMIT = 10;

/**
 * The "people to follow" strip on the profile tab — a flattened taste of the
 * standalone Discover People screen. Renders nothing until it has someone to
 * show, so it never leaves an empty block on the profile.
 */
export default function DiscoverPeoplePreview() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const activeCity = useActiveCity();
  const [people, setPeople] = useState<SuggestedPerson[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rails = await fetchPeopleSuggestions(activeCity || undefined);
        if (cancelled) return;
        // The rails are already de-duplicated server-side; flatten to one strip.
        setPeople(rails.flatMap((r) => r.people).slice(0, PREVIEW_LIMIT));
      } catch {
        if (!cancelled) setPeople([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCity]);

  const removePerson = (userId: string) =>
    setPeople((prev) => prev.filter((p) => p._id !== userId));

  if (people.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Discover people</Text>
        <TouchableOpacity
          onPress={() => router.push("/discover-people" as any)}
          activeOpacity={0.7}
          style={styles.seeAll}
        >
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={people}
        keyExtractor={(p) => p._id}
        renderItem={({ item }) => (
          <PersonSuggestionCard person={item} compact onFollowed={removePerson} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginTop: 20, marginBottom: 4 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    title: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
    seeAllText: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.primary },
    strip: { paddingHorizontal: 16, gap: 12 },
  });
