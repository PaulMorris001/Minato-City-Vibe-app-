import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { useActiveCity } from "@/hooks/useActiveCity";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EmptyState from "@/components/shared/EmptyState";
import PersonSuggestionCard from "@/components/shared/PersonSuggestionCard";
import { UserRow, type UserRowItem } from "@/components/shared";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";
import {
  fetchPeopleSuggestions,
  type SuggestedPerson,
  type SuggestionRail,
} from "@/services/people.service";

export default function DiscoverPeopleScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const activeCity = useActiveCity();

  const [rails, setRails] = useState<SuggestionRail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search by name/username — same endpoint the standalone people search uses.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserRowItem[]>([]);
  const [searching, setSearching] = useState(false);
  const isSearching = query.trim().length >= 2;

  const load = useCallback(async () => {
    try {
      setRails(await fetchPeopleSuggestions(activeCity || undefined));
    } catch {
      setRails([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCity]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const token = await SecureStore.getItemAsync("token");
        const res = await fetch(
          `${BASE_URL}/users/search?query=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (res.ok) setResults(data.users || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Once you follow someone they're no longer a suggestion — drop the card
  // (and the rail, if it empties) so it doesn't sit there until a refetch.
  const removePerson = useCallback((userId: string) => {
    setRails((prev) =>
      prev
        .map((r) => ({ ...r, people: r.people.filter((p) => p._id !== userId) }))
        .filter((r) => r.people.length > 0)
    );
  }, []);

  const sections = rails.map((r) => ({ key: r.key, title: r.title, data: r.people }));

  return (
    <LinearGradient
      colors={[colors.backgroundSecondary, colors.backgroundTertiary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Discover People</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or @username…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {isSearching ? (
          searching ? (
            <UserListItemSkeleton count={6} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => <UserRow user={item} />}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <EmptyState icon="people-outline" title="No people found" />
              }
            />
          )
        ) : loading ? (
          <UserListItemSkeleton count={7} />
        ) : sections.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No suggestions yet"
            subtitle="Follow a few people, RSVP to an event or save a guide and we'll find people worth connecting with — or search above to find someone."
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item: SuggestedPerson) => item._id}
            renderItem={({ item }) => (
              <PersonSuggestionCard person={item} onFollowed={removePerson} />
            )}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          />
        )}
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
      paddingTop: 20,
      paddingBottom: 12,
    },
    backButton: { marginRight: 16 },
    headerTitle: {
      flex: 1,
      fontSize: scaleFontSize(24),
      fontFamily: Fonts.bold,
      color: c.text,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
      padding: 0,
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    sectionTitle: {
      fontSize: scaleFontSize(16),
      fontFamily: Fonts.bold,
      color: c.text,
      marginTop: 20,
      marginBottom: 4,
    },
  });
