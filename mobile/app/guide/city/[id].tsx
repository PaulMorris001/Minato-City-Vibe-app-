import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Guide, GUIDE_TOPICS } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useFormatPrice } from "@/hooks/useFormatPrice";

export default function CityGuidesPage() {
  const router = useRouter();
  const { cityName } = useLocalSearchParams<{ cityName: string }>();
  const formatPrice = useFormatPrice();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">(
    "all"
  );

  const fetchGuides = useCallback(async () => {
    try {
      setLoading(true);

      const token = await SecureStore.getItemAsync("token");

      // Convert city name to URL-safe format (e.g., "New York City" -> "new-york-city")
      const urlSafeCityName = cityName.toLowerCase().replace(/\s+/g, "-");
      const url = `${BASE_URL}/guide/by-city?name=${urlSafeCityName}`;

      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      } else {
        console.warn(
          "⚠️ debug: No token found, making unauthenticated request"
        );
      }

      const response = await fetch(url, {
        headers,
      });

      const data = await response.json();

      if (response.status === 401) {
        console.warn(
          "⛔️ debug: 401 Unauthorized received. Redirecting to login..."
        );
        router.push("/login"); // or whatever your login route is, assume /login based on context
        return;
      }

      if (response.ok) {
        setGuides(data.guides || []);
      }
    } catch (error) {
      console.error("Failed to fetch guides:", error);
    } finally {
      setLoading(false);
    }
  }, [cityName, router]);

  const filterGuides = useCallback(() => {
    let filtered = [...guides];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (guide) =>
          guide.title.toLowerCase().includes(query) ||
          guide.description.toLowerCase().includes(query) ||
          guide.authorName.toLowerCase().includes(query)
      );
    }

    if (selectedTopic) {
      filtered = filtered.filter((guide) => guide.topic === selectedTopic);
    }

    if (priceFilter === "free") {
      filtered = filtered.filter((guide) => guide.price === 0);
    } else if (priceFilter === "paid") {
      filtered = filtered.filter((guide) => guide.price > 0);
    }

    setFilteredGuides(filtered);
  }, [guides, searchQuery, selectedTopic, priceFilter]);

  useEffect(() => {
    fetchGuides();
  }, [fetchGuides]);

  useEffect(() => {
    filterGuides();
  }, [filterGuides]);

  const renderGuideCard = ({ item }: { item: Guide }) => (
    <TouchableOpacity
      style={styles.guideCard}
      onPress={() => router.push(`/guide/${item._id}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.guideHeader}>
        <View style={styles.guideHeaderLeft}>
          <Text style={styles.guideTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.guideAuthor}>by {item.authorName}</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>
            {item.price === 0 ? "FREE" : `$${formatPrice(item.price)}`}
          </Text>
        </View>
      </View>

      <Text style={styles.guideDescription} numberOfLines={3}>
        {item.description}
      </Text>

      <View style={styles.guideFooter}>
        <View style={styles.topicBadge}>
          <Ionicons name="pricetag" size={12} color="#a855f7" />
          <Text style={styles.topicText}>{item.topic}</Text>
        </View>
        <View style={styles.statsRow}>
          <Ionicons name="eye-outline" size={14} color="#6b7280" />
          <Text style={styles.statsText}>{item.views} views</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderTopicFilter = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        styles.topicFilterButton,
        selectedTopic === item && styles.topicFilterButtonActive,
      ]}
      onPress={() => setSelectedTopic(selectedTopic === item ? null : item)}
    >
      <Text
        style={[
          styles.topicFilterText,
          selectedTopic === item && styles.topicFilterTextActive,
        ]}
      >
        {item}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{cityName}</Text>
          <Text style={styles.headerSubtitle}>Best of Lists & Guides</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search guides..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color="#6b7280" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.priceFilterRow}>
        <TouchableOpacity
          style={[
            styles.priceFilterButton,
            priceFilter === "all" && styles.priceFilterButtonActive,
          ]}
          onPress={() => setPriceFilter("all")}
        >
          <Text
            style={[
              styles.priceFilterText,
              priceFilter === "all" && styles.priceFilterTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.priceFilterButton,
            priceFilter === "free" && styles.priceFilterButtonActive,
          ]}
          onPress={() => setPriceFilter("free")}
        >
          <Text
            style={[
              styles.priceFilterText,
              priceFilter === "free" && styles.priceFilterTextActive,
            ]}
          >
            Free
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.priceFilterButton,
            priceFilter === "paid" && styles.priceFilterButtonActive,
          ]}
          onPress={() => setPriceFilter("paid")}
        >
          <Text
            style={[
              styles.priceFilterText,
              priceFilter === "paid" && styles.priceFilterTextActive,
            ]}
          >
            Paid
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.topicSection}>
        <Text style={styles.sectionTitle}>Filter by Topic</Text>
        <FlatList
          horizontal
          data={GUIDE_TOPICS}
          keyExtractor={(item) => item}
          renderItem={renderTopicFilter}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topicFilterList}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      ) : (
        <FlatList
          data={filteredGuides}
          keyExtractor={(item) => item._id}
          renderItem={renderGuideCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="document-text-outline"
                size={64}
                color="#6b7280"
              />
              <Text style={styles.emptyTitle}>No guides found</Text>
              <Text style={styles.emptyText}>
                {searchQuery || selectedTopic
                  ? "Try adjusting your filters"
                  : "Be the first to create a guide for this city!"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  priceFilterRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  priceFilterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  priceFilterButtonActive: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  priceFilterText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
  },
  priceFilterTextActive: {
    color: "#fff",
  },
  topicSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  topicFilterList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  topicFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 8,
  },
  topicFilterButtonActive: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  topicFilterText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#9ca3af",
  },
  topicFilterTextActive: {
    color: "#fff",
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  guideCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  guideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  guideHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  guideTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  guideAuthor: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  priceLabel: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#a855f7",
  },
  guideDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 20,
    marginBottom: 12,
  },
  guideFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topicBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  topicText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#a855f7",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
