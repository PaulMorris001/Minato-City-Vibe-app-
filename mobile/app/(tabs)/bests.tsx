import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Guide, GUIDE_TOPICS, LocationSelection } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { LocationFilterBar } from "@/components/shared";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchGuidesAll } from "@/libs/api";
import { formatLocation } from "@/utils/location";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function BestsPage() {
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [locFilter, setLocFilter] = useState<LocationSelection | null>(null);
  const headerAnim = useRef(new Animated.Value(0)).current;

  const loadGuides = async (loc: LocationSelection | null) => {
    setLoading(true);
    try {
      const data = await fetchGuidesAll({
        country: loc?.country || undefined,
        state: loc?.state || undefined,
        city: loc?.city || undefined,
      });
      setGuides(Array.isArray(data) ? data : []);
    } catch {
      setGuides([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  useEffect(() => {
    loadGuides(locFilter);
  }, [locFilter]);

  const checkAuthStatus = async () => {
    const token = await SecureStore.getItemAsync("token");
    setIsLoggedIn(!!token);
  };

  const handleCreateGuide = () => {
    router.push(isLoggedIn ? ("/guide/create" as any) : "/login");
  };

  // Group guides into per-topic carousels, ordered by the canonical topic list
  const groups = useMemo(() => {
    const map = new Map<string, Guide[]>();
    for (const g of guides) {
      if (!map.has(g.topic)) map.set(g.topic, []);
      map.get(g.topic)!.push(g);
    }
    return GUIDE_TOPICS.filter((t) => map.has(t)).map((t) => ({ topic: t, guides: map.get(t)! }));
  }, [guides]);

  const renderGuideCard = (g: Guide) => (
    <TouchableOpacity
      style={styles.guideCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/guide/${g._id}` as any)}
    >
      <Text style={styles.guideTitle} numberOfLines={2}>{g.title}</Text>
      <Text style={styles.guideMeta} numberOfLines={1}>
        {formatLocation({ city: g.city, state: g.cityState, country: g.country })}
      </Text>
      <Text style={styles.guideAuthor} numberOfLines={1}>by {g.authorName}</Text>
      <View style={styles.guideFooter}>
        <Text style={styles.guidePrice}>
          {g.price === 0 ? "FREE" : `$${formatPrice(g.price)}`}
        </Text>
        <View style={styles.guideViews}>
          <Ionicons name="eye-outline" size={13} color="#6b7280" />
          <Text style={styles.guideViewsText}>{g.views}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    // Top edge only — content should run under the floating tab bar on iOS.
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={[styles.fixedHeader, { opacity: headerAnim }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Best of Your City</Text>
          {isLoggedIn && (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.myGuidesButton}
                onPress={() => router.push("/saved-guides" as any)}
              >
                <Ionicons name="bookmark-outline" size={18} color="#a855f7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.myGuidesButton}
                onPress={() => router.push("/my-guides" as any)}
              >
                <Ionicons name="documents-outline" size={18} color="#a855f7" />
                <Text style={styles.myGuidesText}>My Guides</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>

      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scrollableHeader}>
          <Text style={styles.subtitle}>City Guides & Lists</Text>
          <Text style={styles.description}>
            Share your favorite spots and create curated guides for your city.
            Others can purchase your guides to discover the best places!
          </Text>

          <TouchableOpacity style={styles.createButton} onPress={handleCreateGuide}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.createButtonText}>Create Your Guide</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sampleGuideLink}
            onPress={() => router.push("/guide/sample" as any)}
          >
            <Ionicons name="document-text-outline" size={18} color="#a855f7" />
            <Text style={styles.sampleGuideText}>View Sample Guide</Text>
          </TouchableOpacity>

          <Text style={styles.sectionHeading}>Browse Guides</Text>
        </View>

        <LocationFilterBar
          value={locFilter}
          onChange={setLocFilter}
          onClear={() => setLocFilter(null)}
        />

        {loading ? (
          <UserListItemSkeleton count={6} showButton={false} />
        ) : groups.length === 0 ? (
          <Text style={styles.emptyText}>
            {locFilter
              ? "No guides in this location yet — try another, or create the first one!"
              : "No guides yet. Be the first to create one for your city!"}
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.topic} style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{g.topic}</Text>
                <Text style={styles.sectionCount}>{g.guides.length}</Text>
              </View>
              <FlatList
                horizontal
                data={g.guides}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => renderGuideCard(item)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  list: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  fixedHeader: {
    paddingHorizontal: getResponsivePadding(),
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  myGuidesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  myGuidesText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  scrollableHeader: {
    paddingTop: 16,
  },
  title: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
    flex: 1,
  },
  subtitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    marginBottom: 12,
  },
  description: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 22,
    marginBottom: 20,
  },
  sampleGuideLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    borderRadius: 8,
  },
  sampleGuideText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#a855f7",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  createButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    textAlign: "center",
  },
  sectionHeading: {
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: getResponsivePadding(),
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: scaleFontSize(17),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  sectionCount: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  carousel: {
    paddingRight: 8,
    gap: 12,
  },
  guideCard: {
    width: 220,
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#252538",
  },
  guideTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#fff",
    lineHeight: 19,
    minHeight: 38,
  },
  guideMeta: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 6,
  },
  guideAuthor: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  guideFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  guidePrice: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#a855f7",
  },
  guideViews: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  guideViewsText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
});
