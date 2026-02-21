/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { BASE_URL, CITIES } from "@/constants/constants";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { City } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import BecomeVendorModal from "@/components/client/BecomeVendorModal";
import { AnimatedListCard, LoadingScreen } from "@/components/shared";
import { scaleFontSize } from "@/utils/responsive";


export default function VendorsPage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<{
      id: string;
      username: string;
      email: string;
      profilePicture?: string;
      isVendor?: boolean;
    }>({
      id: "",
      username: "",
      email: "",
      profilePicture: "",
      isVendor: false,
    });
  
  const fetchUserProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (token) {
        const res = await axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = res.data.user;
        setUser({
          id: userData._id,
          username: userData.username,
          email: userData.email,
          profilePicture: userData.profilePicture || "",
          isVendor: userData.isVendor || false,
        });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    checkAuthStatus();
    setCities(CITIES);
    setLoading(false);

    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const checkAuthStatus = async () => {
    const token = await SecureStore.getItemAsync("token");
    setIsLoggedIn(!!token);
  };

  const handleBecomeVendor = () => {
    if (isLoggedIn) {
      setShowVendorModal(true);
    } else {
      router.push("/login");
    }
  };

  const searchVendors = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const token = await SecureStore.getItemAsync("token");
      const response = await axios.get(
        `${BASE_URL}/vendors/search?query=${encodeURIComponent(query)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
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
      const debounce = setTimeout(() => {
        searchVendors(searchQuery);
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  if (loading) {
    return <LoadingScreen />;
  }
  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.headerContainer,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Find Vendors</Text>
            <Text style={styles.subtitle}>Search or select your city</Text>
          </View>
          {!user.isVendor && <TouchableOpacity
            style={styles.becomeVendorButton}
            onPress={handleBecomeVendor}
          >
            <Ionicons name="briefcase" size={20} color="#fff" />
            <Text style={styles.becomeVendorText}>Become a Vendor</Text>
          </TouchableOpacity>}
        </View>

        {/* Search Bar */}
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

      {/* Show search results or cities */}
      {searching && (
        <View style={styles.searchingContainer}>
          <ActivityIndicator size="small" color="#a855f7" />
          <Text style={styles.searchingText}>Searching vendors...</Text>
        </View>
      )}

      {searchQuery.length >= 2 && searchResults.length > 0 && !searching && (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.vendorCard}
              onPress={() =>
                router.push({
                  pathname: "/vendor-details/[vendorId]",
                  params: { vendorId: item._id, vendorName: item.name },
                })
              }
            >
              {item.images && item.images.length > 0 ? (
                <Image source={{ uri: item.images[0] }} style={styles.vendorImage} />
              ) : (
                <View style={styles.vendorImagePlaceholder}>
                  <Ionicons name="business" size={24} color="#6b7280" />
                </View>
              )}
              <View style={styles.vendorInfo}>
                <Text style={styles.vendorName}>{item.name}</Text>
                <Text style={styles.vendorType}>{item.vendorType || "Vendor"}</Text>
                {item.location?.city && (
                  <Text style={styles.vendorLocation}>{item.location.city}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
        <View style={styles.emptySearchContainer}>
          <Ionicons name="search-outline" size={48} color="#6b7280" />
          <Text style={styles.emptySearchText}>No vendors found</Text>
          <Text style={styles.emptySearchSubtext}>Try a different search term</Text>
        </View>
      )}

      {searchQuery.length < 2 && (
        <FlatList
          data={cities}
          keyExtractor={(item) => item._id}
          renderItem={({ item, index }) => (
            <AnimatedListCard
              icon="location"
              title={item.name}
              subtitle={item.state}
              index={index}
              onPress={() =>
                router.push({
                  pathname: "/vendor-types/[cityId]",
                  params: { cityId: item._id },
                })
              }
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="location-outline" size={48} color="#4b5563" />
              <Text style={styles.emptyText}>No cities available</Text>
            </View>
          }
        />
      )}

      <BecomeVendorModal
        visible={showVendorModal}
        onClose={() => setShowVendorModal(false)}
      />
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
    marginBottom: 30,
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
  searchingContainer: {
    alignItems: "center",
    paddingTop: 40,
  },
  searchingText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 12,
  },
  vendorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  vendorImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  vendorImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#2a2a3e",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  vendorInfo: {
    flex: 1,
  },
  vendorName: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  vendorType: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 4,
  },
  vendorLocation: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 4,
  },
  emptySearchContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptySearchText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginTop: 12,
  },
  emptySearchSubtext: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 12,
  },
});
