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
import { CITIES } from "@/constants/constants";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

export default function BestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkAuthStatus();
    setCities(CITIES);
    setLoading(false);

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

  const handleCreateGuide = () => {
    if (isLoggedIn) {
      router.push("/guide/create" as any);
    } else {
      router.push("/login");
    }
  };

  const handleCityPress = (cityName: string) => {
    router.push({
      pathname: "/guide/city/[id]" as any,
      params: { cityName },
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
            <Text style={styles.subtitle}>City Guides & Lists</Text>
            <Text style={styles.description}>
              Share your favorite spots and create curated guides for your city.
              Others can purchase your guides to discover the best places!
            </Text>

            <View style={styles.highlightBox}>
              <View style={styles.highlightIconContainer}>
                <Ionicons name="bulb" size={24} color="#a855f7" />
              </View>
              <View style={styles.highlightContent}>
                <Text style={styles.highlightTitle}>How it Works</Text>
                <Text style={styles.highlightText}>
                  1. Create a list of your favorite spots in your city{"\n"}
                  2. Set a price for your guide{"\n"}
                  3. Earn money when others purchase it
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.sampleGuideLink}
              onPress={() => router.push("/guide/sample" as any)}
            >
              <Ionicons name="document-text-outline" size={18} color="#a855f7" />
              <Text style={styles.sampleGuideText}>View Sample Guide</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateGuide}
            >
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.createButtonText}>
                Create Your Guide
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Browse Guides by City</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <AnimatedListCard
            icon="location"
            title={item.name}
            subtitle={item.state}
            index={index}
            onPress={() => handleCityPress(item.name)}
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
    // flex: 1,
    backgroundColor: "#0f0f1a",
  },
  fixedHeader: {
    paddingHorizontal: getResponsivePadding(),
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
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
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  scrollableHeader: {
    paddingTop: 16,
  },
  title: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
    flex: 1,
  },
  subtitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    marginBottom: 12,
  },
  description: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 22,
    marginBottom: 20,
  },
  highlightBox: {
    flexDirection: "row",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  highlightIconContainer: {
    marginRight: 12,
  },
  highlightContent: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  highlightText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    lineHeight: 20,
  },
  sampleGuideLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    borderRadius: 8,
  },
  sampleGuideText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
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
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: getResponsivePadding(),
    paddingBottom: 20,
  },
});
