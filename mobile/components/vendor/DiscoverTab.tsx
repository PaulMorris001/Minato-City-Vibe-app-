import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { fetchVendorsBrowse } from "@/libs/api";
import { formatLocation } from "@/utils/location";
import { useActiveCity } from "@/hooks/useActiveCity";
import { ActiveLocationChip, VendorRow } from "@/components/shared";
import type { VendorRowItem } from "@/components/shared";
import VendorCardSkeleton from "@/components/skeletons/VendorCardSkeleton";
import MediaTile from "@/components/shared/MediaTile";
import { VNF } from "./vendorTheme";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface BrowseVendor {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { _id: string; name: string; icon: string };
  city?: { name: string; state: string; country?: string };
}

/**
 * The vendor-side "Discover" surface — the same city-scoped vendor browse the
 * client tab offers, so a vendor can find, book and message their peers. The
 * booking flow is entirely shared: tapping a card opens vendor-details, which
 * feeds the global cart and the /orders → vendor-chat path.
 */
export default function DiscoverTab() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [vendors, setVendors] = useState<BrowseVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const activeCity = useActiveCity();
  // Guards against a slow response for a since-changed city overwriting the
  // current one — same reason as the client vendors tab.
  const requestedCityRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VendorRowItem[]>([]);
  const [searching, setSearching] = useState(false);

  const loadVendors = async (city: string | null) => {
    requestedCityRef.current = city;
    setLoading(true);
    try {
      const data = await fetchVendorsBrowse({ city: city || undefined });
      if (requestedCityRef.current !== city) return;
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      if (requestedCityRef.current === city) setVendors([]);
    } finally {
      if (requestedCityRef.current === city) setLoading(false);
    }
  };

  useEffect(() => {
    loadVendors(activeCity);
  }, [activeCity]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const run = setTimeout(async () => {
      try {
        setSearching(true);
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.get(
          `${BASE_URL}/vendors/search?query=${encodeURIComponent(searchQuery)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        setSearchResults(res.data.vendors || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(run);
  }, [searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { type: { _id: string; name: string; icon: string }; vendors: BrowseVendor[] }
    >();
    for (const v of vendors) {
      const t = v.vendorType;
      if (!t?._id) continue;
      if (!map.has(t._id)) map.set(t._id, { type: t, vendors: [] });
      map.get(t._id)!.vendors.push(v);
    }
    return Array.from(map.values()).sort((a, b) => a.type.name.localeCompare(b.type.name));
  }, [vendors]);

  const openVendor = (v: { _id: string; name: string }) =>
    router.push({
      pathname: "/vendor-details/[vendorId]",
      params: { vendorId: v._id, vendorName: v.name },
    });

  const renderCard = (item: BrowseVendor) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openVendor(item)}>
      {item.images && item.images.length > 0 ? (
        <MediaTile uri={item.images[0]} style={styles.cardImage} posterOnly />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="business" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.verified && (
            <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
          )}
        </View>
        {!!item.city?.name && (
          <Text style={styles.cardLocation} numberOfLines={1}>
            {formatLocation({
              city: item.city.name,
              state: item.city.state,
              country: item.city.country,
            })}
          </Text>
        )}
        {typeof item.rating === "number" && item.rating > 0 && (
          <View style={styles.cardRatingRow}>
            <Ionicons name="star" size={11} color={colors.warning} />
            <Text style={styles.cardRating}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Find, book and message other vendors</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search vendors by name..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        searching ? (
          <VendorCardSkeleton count={4} />
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item._id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <VendorRow vendor={item} onPress={openVendor} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No vendors found</Text>
            <Text style={styles.emptySub}>Try a different search term</Text>
          </View>
        )
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <ActiveLocationChip city={activeCity} />

          {loading ? (
            <VendorCardSkeleton count={5} />
          ) : groups.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={44} color={colors.borderMuted} />
              <Text style={styles.emptyTitle}>No vendors yet</Text>
              <Text style={styles.emptySub}>
                {activeCity
                  ? "No vendors in this location — try a different one."
                  : "Check back soon."}
              </Text>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.type._id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name={(g.type.icon as any) || "business"}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.sectionTitle}>{g.type.name}</Text>
                </View>
                <FlatList
                  horizontal
                  data={g.vendors}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => renderCard(item)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 16 },
    header: { paddingTop: 8, marginBottom: 12 },
    title: {
      fontFamily: VNF.heading,
      fontSize: 24,
      color: c.textBright,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontFamily: VNF.body,
      fontSize: 14,
      color: c.textSecondary,
      marginTop: 4,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.backgroundSecondary,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginTop: 14,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 11,
      fontSize: 15,
      fontFamily: VNF.body,
      color: c.text,
    },
    listContent: { paddingBottom: 40 },
    section: { marginBottom: 22 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 17, fontFamily: VNF.sub, color: c.text },
    carousel: { paddingRight: 8, gap: 12 },
    card: {
      width: 158,
      backgroundColor: c.backgroundSecondary,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.glassStroke,
    },
    cardImage: { width: "100%", height: 100 },
    cardImagePlaceholder: {
      backgroundColor: c.cardAlt,
      justifyContent: "center",
      alignItems: "center",
    },
    cardBody: { padding: 10, gap: 4 },
    cardNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cardName: { flex: 1, fontSize: 14, fontFamily: VNF.semibold, color: c.text },
    cardLocation: { fontSize: 12, fontFamily: VNF.body, color: c.textSecondary },
    cardRatingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    cardRating: { fontSize: 12, fontFamily: VNF.medium, color: c.warning },
    empty: { alignItems: "center", paddingTop: 60 },
    emptyTitle: {
      fontSize: 16,
      fontFamily: VNF.semibold,
      color: c.text,
      marginTop: 12,
    },
    emptySub: {
      fontSize: 14,
      fontFamily: VNF.body,
      color: c.textSecondary,
      marginTop: 4,
      textAlign: "center",
      paddingHorizontal: 24,
    },
  });
