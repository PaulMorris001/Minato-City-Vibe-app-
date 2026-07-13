import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView } from "react-native-safe-area-context";
import { Guide } from "@/libs/interfaces";
import { Colors } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import GuideCardSkeleton from "@/components/skeletons/GuideCardSkeleton";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
const { width: screenWidth } = Dimensions.get("window");

export default function MyGuidesPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMyGuides();
  }, []);

  const fetchMyGuides = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`${BASE_URL}/guides/my-guides`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setGuides(data.guides || []);
      } else {
        Alert.alert("Error", data.message || "Failed to fetch guides");
      }
    } catch (error) {
      console.error("Failed to fetch my guides:", error);
      Alert.alert("Error", "Failed to load your guides");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyGuides();
  };

  const handleDeleteGuide = async (guideId: string) => {
    Alert.alert(
      "Delete Guide",
      "Are you sure you want to delete this guide? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("token");
              const response = await fetch(`${BASE_URL}/guides/${guideId}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (response.ok) {
                Alert.alert("Success", "Guide deleted successfully");
                fetchMyGuides();
              } else {
                const data = await response.json();
                Alert.alert("Error", data.message || "Failed to delete guide");
              }
            } catch (error) {
              console.error("Delete guide error:", error);
              Alert.alert("Error", "Failed to delete guide");
            }
          },
        },
      ]
    );
  };

  const renderGuideCard = ({ item }: { item: Guide }) => (
    <TouchableOpacity
      style={styles.guideCard}
      onPress={() => router.push(`/guide/${item._id}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.guideTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.metadataRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metadataText}>
              {item.city}, {item.cityState}
            </Text>
            <Text style={styles.metadataSeparator}>•</Text>
            <Text style={styles.metadataText}>{item.topic}</Text>
          </View>
        </View>
        {item.isDraft && (
          <View style={styles.draftBadge}>
            <Text style={styles.draftText}>Draft</Text>
          </View>
        )}
      </View>

      <Text style={styles.guideDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.statsRow}>
          <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
          <Text style={styles.statsText}>{item.views} views</Text>
          <Text style={styles.statsSeparator}>•</Text>
          <Text style={styles.priceText}>
            {item.price === 0 ? "FREE" : `$${formatPrice(item.price)}`}
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/guide/edit/${item._id}` as any);
            }}
          >
            <Ionicons name="create-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteGuide(item._id);
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Guides</Text>
          <Text style={styles.headerSubtitle}>
            {guides.length} {guides.length === 1 ? "guide" : "guides"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push("/guide/create" as any)}
        >
          <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
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
              <Ionicons name="document-text-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No guides yet</Text>
              <Text style={styles.emptyText}>
                Create your first guide to share your local knowledge!
              </Text>
              <TouchableOpacity
                style={styles.emptyCreateButton}
                onPress={() => router.push("/guide/create" as any)}
              >
                <Text style={styles.emptyCreateButtonText}>Create Guide</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: screenWidth > 400 ? 28 : 24,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  headerSubtitle: {
    fontSize: screenWidth > 400 ? 13 : 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 2,
  },
  createButton: {
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  guideCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  guideTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 6,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  metadataSeparator: {
    fontSize: 12,
    color: c.textMuted,
    marginHorizontal: 4,
  },
  draftBadge: {
    backgroundColor: c.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  draftText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: c.background,
  },
  guideDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textTertiary,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textMuted,
  },
  statsSeparator: {
    fontSize: 12,
    color: c.textMuted,
    marginHorizontal: 6,
  },
  priceText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.border,
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
    color: c.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  emptyCreateButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCreateButtonText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: c.white,
  },
});
