import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Guide } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useFormatPrice } from "@/hooks/useFormatPrice";

export default function GuideDetailPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const formatPrice = useFormatPrice();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    fetchGuide();
  }, [id]);

  const fetchGuide = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");

      const response = await fetch(`${BASE_URL}/guides/${id}`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      const data = await response.json();

      if (response.ok) {
        setGuide(data.guide);
        setHasPurchased(data.hasPurchased || false);
        setIsOwner(data.isOwner || false);
      } else {
        Alert.alert("Error", data.message || "Failed to load guide");
        router.back();
      }
    } catch (error) {
      console.error("Failed to fetch guide:", error);
      Alert.alert("Error", "Failed to load guide");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    try {
      setPurchasing(true);
      const token = await SecureStore.getItemAsync("token");

      if (!token) {
        router.push("/login");
        return;
      }

      const response = await fetch(`${BASE_URL}/guides/${id}/purchase`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "Guide purchased successfully!");
        setHasPurchased(true);
        fetchGuide();
      } else {
        Alert.alert("Error", data.message || "Failed to purchase guide");
      }
    } catch (error) {
      console.error("Purchase error:", error);
      Alert.alert("Error", "Failed to purchase guide");
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (!guide) {
    return null;
  }

  const canViewContent = isOwner || hasPurchased || guide.price === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Guide
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>{guide.title}</Text>
          <View style={styles.authorRow}>
            <Ionicons name="person-circle-outline" size={20} color="#9ca3af" />
            <Text style={styles.authorText}>by {guide.authorName}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location" size={16} color="#a855f7" />
              <Text style={styles.metaText}>
                {guide.city}, {guide.cityState}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag" size={16} color="#a855f7" />
              <Text style={styles.metaText}>{guide.topic}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={16} color="#a855f7" />
              <Text style={styles.metaText}>{guide.views} views</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceSection}>
          <View style={styles.priceContent}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={styles.priceValue}>
              {guide.price === 0 ? "FREE" : `$${formatPrice(guide.price)}`}
            </Text>
          </View>
          {!canViewContent && (
            <TouchableOpacity
              style={styles.purchaseButton}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cart" size={20} color="#fff" />
                  <Text style={styles.purchaseButtonText}>Purchase Guide</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Ionicons name="star" size={16} color="#fbbf24" />
              <Text style={styles.ownerBadgeText}>Your Guide</Text>
            </View>
          )}
          {hasPurchased && !isOwner && (
            <View style={styles.purchasedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.purchasedBadgeText}>Purchased</Text>
            </View>
          )}
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{guide.description}</Text>
        </View>

        {canViewContent ? (
          <View style={styles.sectionsContainer}>
            <Text style={styles.sectionTitle}>
              Guide Sections ({guide.sections.length})
            </Text>
            {guide.sections
              .sort((a, b) => a.rank - b.rank)
              .map((section, index) => (
                <View key={index} style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{section.rank}</Text>
                    </View>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </View>
                  <Text style={styles.sectionDescription}>
                    {section.description}
                  </Text>
                </View>
              ))}
          </View>
        ) : (
          <View style={styles.lockedSection}>
            <Ionicons name="lock-closed" size={48} color="#6b7280" />
            <Text style={styles.lockedTitle}>Content Locked</Text>
            <Text style={styles.lockedText}>
              Purchase this guide to unlock all {guide.sections.length} sections
            </Text>
          </View>
        )}
      </ScrollView>
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
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f1a",
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
    lineHeight: 36,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  authorText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#d1d5db",
  },
  priceSection: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  priceContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  priceValue: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: "#a855f7",
  },
  purchaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#a855f7",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  purchaseButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  ownerBadgeText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fbbf24",
  },
  purchasedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  purchasedBadgeText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#10b981",
  },
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 24,
  },
  sectionsContainer: {
    marginTop: 20,
  },
  sectionCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  rankBadge: {
    backgroundColor: "#a855f7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rankText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 22,
  },
  lockedSection: {
    alignItems: "center",
    paddingVertical: 60,
  },
  lockedTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  lockedText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
