/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
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
            <Text style={styles.subtitle}>Select your city to get started</Text>
          </View>
          {!user.isVendor && <TouchableOpacity
            style={styles.becomeVendorButton}
            onPress={handleBecomeVendor}
          >
            <Ionicons name="briefcase" size={20} color="#fff" />
            <Text style={styles.becomeVendorText}>Become a Vendor</Text>
          </TouchableOpacity>}
        </View>
      </Animated.View>

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
    alignItems: "flex-start",
  },
  becomeVendorButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#a855f7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
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
