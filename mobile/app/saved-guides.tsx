import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Guide } from "@/libs/interfaces";
import { Colors } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { fetchSavedGuides } from "@/libs/api";
import { formatLocation } from "@/utils/location";
import GuideCardSkeleton from "@/components/skeletons/GuideCardSkeleton";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function SavedGuidesPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchSavedGuides();
      setGuides(Array.isArray(data) ? data : []);
    } catch {
      setGuides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch on focus so a guide unsaved on the detail screen drops off here
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderGuideCard = ({ item }: { item: Guide }) => (
    <TouchableOpacity
      style={styles.guideCard}
      onPress={() => router.push(`/guide/${item._id}` as any)}
      activeOpacity={0.8}
    >
      <Text style={styles.guideTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.metadataRow}>
        <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.metadataText} numberOfLines={1}>
          {formatLocation({ city: item.city, state: item.cityState, country: item.country })}
        </Text>
        <Text style={styles.metadataSeparator}>•</Text>
        <Text style={styles.metadataText}>{item.topic}</Text>
      </View>
      <Text style={styles.guideDescription} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.author} numberOfLines={1}>by {item.authorName}</Text>
        <Text style={styles.priceText}>
          {item.price === 0 ? "FREE" : `$${formatPrice(item.price)}`}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Saved Guides</Text>
          <Text style={styles.headerSubtitle}>
            {guides.length} {guides.length === 1 ? "guide" : "guides"}
          </Text>
        </View>
      </View>

      {loading ? (
        <GuideCardSkeleton count={3} />
      ) : (
        <FlatList
          data={guides}
          keyExtractor={(item) => item._id}
          renderItem={renderGuideCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bookmark-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No saved guides</Text>
              <Text style={styles.emptyText}>
                Tap the bookmark on a guide to save it here for later.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: { marginRight: 12 },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 24, fontFamily: Fonts.bold, color: c.text },
  headerSubtitle: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 2 },
  listContent: { padding: 20, paddingBottom: 40 },
  guideCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  guideTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text, marginBottom: 6 },
  metadataRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  metadataText: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, flexShrink: 1 },
  metadataSeparator: { fontSize: 12, color: c.textMuted, marginHorizontal: 4 },
  guideDescription: { fontSize: 14, fontFamily: Fonts.regular, color: c.textTertiary, lineHeight: 20, marginBottom: 12 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  author: { fontSize: 12, fontFamily: Fonts.regular, color: c.textMuted, flex: 1, marginRight: 12 },
  priceText: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.primary },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center", paddingHorizontal: 40 },
});
