import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchVendors } from "@/libs/api";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { Vendor } from "@/libs/interfaces";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function VendorsList() {
  const { cityId, typeId } = useLocalSearchParams();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        console.log(`Fetching vendors for cityId: ${cityId}, typeId: ${typeId}`);
        const data = await fetchVendors(cityId as string, typeId as string);
        console.log("Vendors received:", data);

        // Handle both array response and object with vendors array
        if (Array.isArray(data)) {
          setVendors(data);
        } else if (data && Array.isArray(data.vendors)) {
          setVendors(data.vendors);
        } else {
          console.warn("Unexpected data format:", data);
          setVendors([]);
        }
      } catch (error) {
        console.error("Error loading vendors:", error);
        setVendors([]);
      } finally {
        setLoading(false);
      }
    };
    loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, typeId]);

  const renderPriceRange = (price: number) => {
    const dollars = [];
    for (let i = 0; i < 4; i++) {
      dollars.push(
        <Text
          key={i}
          style={[styles.dollar, i < price ? styles.dollarActive : styles.dollarInactive]}
        >
          $
        </Text>
      );
    }
    return <View style={styles.priceContainer}>{dollars}</View>;
  };

  const renderRating = (rating: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i < Math.floor(rating) ? "star" : "star-outline"}
          size={16}
          color={i < Math.floor(rating) ? "#fbbf24" : "#4b5563"}
        />
      );
    }
    return (
      <View style={styles.ratingContainer}>
        {stars}
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
      </View>
    );
  };

  const handleContact = (type: string, value: string) => {
    if (type === "phone") {
      Linking.openURL(`tel:${value}`);
    } else if (type === "website") {
      Linking.openURL(value.startsWith("http") ? value : `https://${value}`);
    } else if (type === "instagram") {
      Linking.openURL(`https://instagram.com/${value.replace("@", "")}`);
    }
  };

  const renderVendorCard = ({ item }: { item: Vendor }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/vendor-details/[vendorId]",
          params: {
            vendorId: item._id,
            vendorName: item.name,
          },
        })
      }
    >
      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={styles.cardImage} />
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.vendorName}>{item.name}</Text>
          {item.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {item.description || "No description available"}
        </Text>

        <View style={styles.infoRow}>
          {renderPriceRange(item.priceRange)}
          {renderRating(item.rating)}
        </View>

        <View style={styles.contactRow}>
          {item.contact?.phone && (
            <TouchableOpacity
              style={styles.contactButton}
              onPress={(e) => {
                e.stopPropagation();
                handleContact("phone", item.contact.phone);
              }}
            >
              <Ionicons name="call-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
          {item.contact?.instagram && (
            <TouchableOpacity
              style={styles.contactButton}
              onPress={(e) => {
                e.stopPropagation();
                handleContact("instagram", item.contact.instagram);
              }}
            >
              <Ionicons name="logo-instagram" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
          {item.contact?.website && (
            <TouchableOpacity
              style={styles.contactButton}
              onPress={(e) => {
                e.stopPropagation();
                handleContact("website", item.contact.website);
              }}
            >
              <Ionicons name="globe-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Vendors</Text>
      </View>

      <FlatList
        data={vendors}
        keyExtractor={(item) => item._id}
        renderItem={renderVendorCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#4b5563" />
            <Text style={styles.emptyText}>No vendors found in this category</Text>
          </View>
        }
        
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    backgroundColor: Colors.darkBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.darkBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: getResponsivePadding(),
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: scaleFontSize(20),
    fontWeight: "bold",
    color: "#fff",
    marginLeft: 12,
    flex: 1,
  },
  listContent: {
    padding: getResponsivePadding(),
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#374151",
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  vendorName: {
    fontSize: scaleFontSize(18),
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    color: "#22c55e",
    fontSize: scaleFontSize(12),
    fontWeight: "600",
    marginLeft: 4,
  },
  description: {
    fontSize: scaleFontSize(14),
    color: "#9ca3af",
    marginBottom: 12,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: "row",
  },
  dollar: {
    fontSize: scaleFontSize(16),
    fontWeight: "bold",
    marginRight: 2,
  },
  dollarActive: {
    color: "#22c55e",
  },
  dollarInactive: {
    color: "#4b5563",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingText: {
    color: "#fbbf24",
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    marginLeft: 6,
  },
  contactRow: {
    flexDirection: "row",
    gap: 12,
  },
  contactButton: {
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    padding: 10,
    borderRadius: 10,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(16),
    marginTop: 12,
  },
  footer: {
    marginTop: 20,
  },
  ctaContainer: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    padding: getResponsivePadding(),
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  ctaTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  ctaText: {
    fontSize: scaleFontSize(14),
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontWeight: "700",
  },
});
