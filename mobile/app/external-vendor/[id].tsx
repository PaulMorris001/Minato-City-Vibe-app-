import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  Share,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import { fetchExternalVendorById } from "@/libs/api";

/**
 * Detail screen for external vendors discovered via Yelp / Google Places.
 *
 * These businesses are not app users, so there is deliberately no booking,
 * chat, services list, or in-app rating here — just their provider info and
 * ways to reach them (call / website / open in Yelp or Google Maps), plus an
 * "Invite to Cityvibe" share so users can help bring them onto the platform.
 */

interface ExternalVendorDetail {
  _id: string;
  source: "yelp" | "google";
  name: string;
  vendorType?: { name: string; icon: string };
  description?: string;
  images: string[];
  rating: number;
  reviewCount: number;
  priceRange?: number | null;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
  externalUrl: string;
}

const SOURCE_META = {
  yelp: { label: "Yelp", color: "#d32323", openLabel: "Open in Yelp" },
  google: { label: "Google", color: "#4285F4", openLabel: "Open in Google Maps" },
} as const;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 40;

export default function ExternalVendorDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vendor, setVendor] = useState<ExternalVendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchExternalVendorById(id)
      .then((data) => setVendor(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const openLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const handleInvite = async () => {
    if (!vendor) return;
    try {
      await Share.share({
        message: `Hey! I found ${vendor.name} and thought they'd be a great fit for OurCityvibe — join as a vendor to reach event organizers and get bookings: https://ourcityvibe.com`,
      });
    } catch {}
  };

  const renderPrice = (price?: number | null) => {
    if (!price) return null;
    return (
      <Text style={styles.priceText}>
        {Array.from({ length: 4 }, (_, i) => (
          <Text key={i} style={i < price ? styles.dollarActive : styles.dollarInactive}>
            $
          </Text>
        ))}
      </Text>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !vendor) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="business-outline" size={48} color="#4b5563" />
          <Text style={styles.errorText}>Couldn't load this vendor.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = SOURCE_META[vendor.source];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {vendor.name}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Images */}
        {vendor.images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imageCarousel}
          >
            {vendor.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.image} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="business" size={48} color="#6b7280" />
          </View>
        )}

        {/* Name + type + source */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{vendor.name}</Text>
            {!!vendor.vendorType?.name && (
              <Text style={styles.typeText}>{vendor.vendorType.name}</Text>
            )}
          </View>
          <View style={[styles.sourceBadge, { backgroundColor: meta.color }]}>
            <Text style={styles.sourceBadgeText}>{meta.label}</Text>
          </View>
        </View>

        {/* Rating + price */}
        {(vendor.rating > 0 || vendor.priceRange) && (
          <View style={styles.metaRow}>
            {vendor.rating > 0 && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color="#f59e0b" />
                <Text style={styles.ratingText}>
                  {vendor.rating.toFixed(1)}
                  {vendor.reviewCount > 0 ? ` (${vendor.reviewCount} reviews)` : ""} via {meta.label}
                </Text>
              </View>
            )}
            {renderPrice(vendor.priceRange)}
          </View>
        )}

        {/* Categories / description */}
        {!!vendor.description && <Text style={styles.description}>{vendor.description}</Text>}

        {/* Address */}
        {!!vendor.address && (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={18} color="#9ca3af" />
            <Text style={styles.addressText}>{vendor.address}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {!!vendor.phone && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openLink(`tel:${vendor.phone}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={20} color="#22c55e" />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
          )}
          {!!vendor.website && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openLink(vendor.website)}
              activeOpacity={0.8}
            >
              <Ionicons name="globe-outline" size={20} color="#a855f7" />
              <Text style={styles.actionText}>Website</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openLink(vendor.externalUrl)}
            activeOpacity={0.8}
          >
            <Ionicons name="open-outline" size={20} color={meta.color} />
            <Text style={styles.actionText}>{meta.openLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Invite to Cityvibe */}
        <TouchableOpacity style={styles.inviteButton} onPress={handleInvite} activeOpacity={0.8}>
          <Ionicons name="paper-plane-outline" size={18} color="#fff" />
          <Text style={styles.inviteText}>Invite to Cityvibe</Text>
        </TouchableOpacity>
        <Text style={styles.inviteHint}>
          Know this business? Invite them to join OurCityvibe so you can book and message them
          right here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  imageCarousel: {
    marginBottom: 16,
  },
  image: {
    width: IMAGE_WIDTH,
    height: 220,
    borderRadius: 16,
    backgroundColor: "#1a1a2e",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  name: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  typeText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#a855f7",
    marginTop: 2,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 4,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#f59e0b",
  },
  priceText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  dollarActive: {
    color: "#22c55e",
  },
  dollarInactive: {
    color: "#4b5563",
  },
  description: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 20,
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 20,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 20,
  },
  actions: {
    gap: 10,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#252538",
  },
  actionText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  inviteText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  inviteHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 17,
  },
});
