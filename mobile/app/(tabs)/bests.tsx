import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { City } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { AnimatedListCard, LoadingScreen } from "@/components/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { BASE_URL } from "@/constants/constants";

export default function BestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkAuthStatus();
    fetchCities();

    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  const checkAuthStatus = async () => {
    const token = await SecureStore.getItemAsync("token");
    setIsLoggedIn(!!token);
  };

  const fetchCities = async () => {
    try {
      const response = await fetch(`${BASE_URL}/cities`);
      const data = await response.json();

      if (response.ok) {
        setCities(Array.isArray(data) ? data : []);
      } else {
        console.error("Failed to fetch cities:", data.message);
      }
    } catch (error) {
      console.error("Fetch cities error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGuide = () => {
    if (isLoggedIn) {
      router.push("/guide/create" as any);
    } else {
      router.push("/login");
    }
  };

  const handleCityPress = (cityId: string, cityName: string) => {
    router.push({
      pathname: "/guide/city/[id]" as any,
      params: { cityName, cityId },
    });
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.fixedHeader,
          {
            opacity: headerAnim,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Best of Your City</Text>
          {isLoggedIn && (
            <TouchableOpacity
              style={styles.myGuidesButton}
              onPress={() => router.push("/my-guides" as any)}
            >
              <Ionicons name="documents-outline" size={20} color="#a855f7" />
              <Text style={styles.myGuidesText}>My Guides</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      <FlatList
        data={cities}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={
          <View style={styles.scrollableHeader}>
            <Text style={styles.subtitle}>Lists and Guides</Text>
            <Text style={styles.description}>
              Create and sell guides and lists of the best things in your city for
              others to purchase! Make money and share your opinion on the best
              things in your city!
            </Text>

            <TouchableOpacity
              style={styles.sampleGuideLink}
              onPress={() => router.push("/guide/sample" as any)}
            >
              <Ionicons name="document-text-outline" size={16} color="#a855f7" />
              <Text style={styles.sampleGuideText}>See a sample guide HERE</Text>
            </TouchableOpacity>

            <Text style={styles.examplesText}>
              Sample topics: &ldquo;Best Pizza spots in New York City,&rdquo; &ldquo;Best Night Clubs
              in Washington DC,&rdquo; &ldquo;Best Hair salons in Miami, Florida,&rdquo; &ldquo;Best plastic
              surgeons in Los Angeles.&rdquo;
            </Text>

            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateGuide}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.createButtonText}>
                Create your Best of Your City List and Guide
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Select Your City</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <AnimatedListCard
            icon="location"
            title={item.name}
            subtitle={item.state}
            index={index}
            onPress={() => handleCityPress(item._id, item.name)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  fixedHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myGuidesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  myGuidesText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  scrollableHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  subtitle: {
    fontSize: 24,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 20,
    marginBottom: 12,
  },
  sampleGuideLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sampleGuideText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    textDecorationLine: "underline",
  },
  examplesText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    lineHeight: 18,
    fontStyle: "italic",
    marginBottom: 20,
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
    marginBottom: 24,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 90,
  },
});
