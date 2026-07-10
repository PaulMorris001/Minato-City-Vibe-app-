/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  Animated,
  TextInput,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { fetchVendorsBrowse } from "@/libs/api";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { ensureAuth } from "@/utils/requireAuth";
import { LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";
import { Fonts } from "@/constants/fonts";
import BecomeVendorModal from "@/components/client/BecomeVendorModal";
import { LocationFilterBar } from "@/components/shared";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";
import { scaleFontSize } from "@/utils/responsive";

interface BrowseVendor {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { _id: string; name: string; icon: string };
  city?: { name: string; state: string; country?: string };
  // 'yelp' | 'google' = external listing (opens the external detail screen)
  source?: "internal" | "yelp" | "google";
  externalUrl?: string;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  yelp: { label: "Yelp", color: "#d32323" },
  google: { label: "Google", color: "#4285F4" },
};

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<BrowseVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [locFilter, setLocFilter] = useState<LocationSelection | null>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<{ isVendor?: boolean }>({ isVendor: false });

  const fetchUserProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (token) {
        const res = await axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser({ isVendor: res.data.user?.isVendor || false });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const loadVendors = async (loc: LocationSelection | null) => {
    setLoading(true);
    try {
      const data = await fetchVendorsBrowse({
        country: loc?.country || undefined,
        state: loc?.state || undefined,
        city: loc?.city || undefined,
      });
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
    checkAuthStatus();
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    loadVendors(locFilter);
  }, [locFilter]);

  const checkAuthStatus = async () => {
    const token = await SecureStore.getItemAsync("token");
    setIsLoggedIn(!!token);
  };

  const handleBecomeVendor = async () => {
    if (!(await ensureAuth("become a vendor"))) return;
    setShowVendorModal(true);
  };

  const searchVendors = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const token = await SecureStore.getItemAsync("token");
      // Include cached external results when a city filter is active
      const cityParam = locFilter?.city
        ? `&city=${encodeURIComponent(locFilter.city)}&includeExternal=true`
        : "";
      const response = await axios.get(
        `${BASE_URL}/vendors/search?query=${encodeURIComponent(query)}${cityParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      setSearchResults(response.data.vendors || []);
    } catch (error) {
      console.error("Error searching vendors:", error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const debounce = setTimeout(() => searchVendors(searchQuery), 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Group vendors into per-type carousels (alphabetical by type name)
  const groups = useMemo(() => {
    const map = new Map<string, { type: { _id: string; name: string; icon: string }; vendors: BrowseVendor[] }>();
    for (const v of vendors) {
      const t = v.vendorType;
      if (!t?._id) continue;
      if (!map.has(t._id)) map.set(t._id, { type: t, vendors: [] });
      map.get(t._id)!.vendors.push(v);
    }
    return Array.from(map.values()).sort((a, b) => a.type.name.localeCompare(b.type.name));
  }, [vendors]);

  const openVendor = (v: { _id: string; name: string; source?: string }) => {
    if (v.source === "yelp" || v.source === "google") {
      router.push({
        pathname: "/external-vendor/[id]",
        params: { id: v._id },
      } as any);
      return;
    }
    router.push({
      pathname: "/vendor-details/[vendorId]",
      params: { vendorId: v._id, vendorName: v.name },
    });
  };

  const renderSourceBadge = (source?: string, inline = false) => {
    const badge = source ? SOURCE_BADGES[source] : undefined;
    if (!badge) return null;
    return (
      <View
        style={[
          inline ? styles.sourceBadgeInline : styles.sourceBadge,
          { backgroundColor: badge.color },
        ]}
      >
        <Text style={styles.sourceBadgeText}>{badge.label}</Text>
      </View>
    );
  };

  const renderVendorCard = (item: BrowseVendor) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openVendor(item)}>
      {item.images && item.images.length > 0 ? (
        <Image source={{ uri: item.images[0] }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="business" size={26} color="#6b7280" />
        </View>
      )}
      {renderSourceBadge(item.source)}
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.verified && <Ionicons name="checkmark-circle" size={14} color="#a855f7" />}
        </View>
        {!!item.city?.name && (
          <Text style={styles.cardLocation} numberOfLines={1}>
            {formatLocation({ city: item.city.name, state: item.city.state, country: item.city.country })}
          </Text>
        )}
        {typeof item.rating === "number" && item.rating > 0 && (
          <View style={styles.cardRatingRow}>
            <Ionicons name="star" size={12} color="#f59e0b" />
            <Text style={styles.cardRating}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.headerContainer,
          {
            opacity: headerAnim,
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Find Vendors</Text>
            <Text style={styles.subtitle}>Browse by category & location</Text>
          </View>
          {!user.isVendor && (
            <TouchableOpacity style={styles.becomeVendorButton} onPress={handleBecomeVendor}>
              <Ionicons name="briefcase" size={20} color="#fff" />
              <Text style={styles.becomeVendorText}>Become a Vendor</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search vendors by name..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Search mode */}
      {searchQuery.length >= 2 ? (
        <>
          {searching && <VendorCardSkeleton count={4} />}
          {!searching && searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item._id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.searchRow} onPress={() => openVendor(item)}>
                  {item.images && item.images.length > 0 ? (
                    <Image source={{ uri: item.images[0] }} style={styles.searchRowImage} />
                  ) : (
                    <View style={[styles.searchRowImage, styles.cardImagePlaceholder]}>
                      <Ionicons name="business" size={24} color="#6b7280" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.searchNameRow}>
                      <Text style={styles.cardName}>{item.name}</Text>
                      {renderSourceBadge(item.source, true)}
                    </View>
                    <Text style={styles.cardType}>{item.vendorType || "Vendor"}</Text>
                    {item.location?.city && <Text style={styles.cardLocation}>{item.location.city}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
          {!searching && searchResults.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyTitle}>No vendors found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          )}
        </>
      ) : (
        /* Browse mode — location filter + per-type carousels */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <LocationFilterBar
            value={locFilter}
            onChange={setLocFilter}
            onClear={() => setLocFilter(null)}
          />

          {loading ? (
            <VendorCardSkeleton count={5} />
          ) : groups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={48} color="#4b5563" />
              <Text style={styles.emptyTitle}>No vendors yet</Text>
              <Text style={styles.emptySubtext}>
                {locFilter ? "No vendors in this location — try a different one." : "Check back soon."}
              </Text>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.type._id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={(g.type.icon as any) || "business"} size={18} color="#a855f7" />
                  <Text style={styles.sectionTitle}>{g.type.name}</Text>
                </View>
                <FlatList
                  horizontal
                  data={g.vendors}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => renderVendorCard(item)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}

      <BecomeVendorModal visible={showVendorModal} onClose={() => setShowVendorModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerContainer: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  becomeVendorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#a855f7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  becomeVendorText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  title: {
    fontSize: scaleFontSize(28),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  carousel: {
    paddingRight: 8,
    gap: 12,
  },
  card: {
    width: 160,
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#252538",
  },
  cardImage: {
    width: "100%",
    height: 100,
  },
  cardImagePlaceholder: {
    backgroundColor: "#2a2a3e",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    padding: 10,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  cardType: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  cardLocation: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  cardRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  cardRating: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#f59e0b",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  searchRowImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  searchNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceBadgeInline: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
