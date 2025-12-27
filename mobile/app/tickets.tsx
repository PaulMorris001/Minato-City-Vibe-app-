import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import TicketCard from "@/components/TicketCard";

const { width: screenWidth } = Dimensions.get("window");

interface Ticket {
  _id: string;
  event: {
    _id: string;
    title: string;
    date: string;
    location: string;
    image?: string;
    createdBy: {
      _id: string;
      username: string;
      email: string;
      profilePicture?: string;
    };
  };
  ticketPrice: number;
  purchaseDate: string;
  ticketCode: string;
  isValid: boolean;
}

export default function TicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickets = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(`${BASE_URL}/tickets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setTickets(data.tickets || []);
      } else {
        Alert.alert("Error", data.message || "Failed to fetch tickets");
      }
    } catch (error) {
      console.error("Fetch tickets error:", error);
      Alert.alert("Error", "Failed to load tickets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTickets();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  return (
    <LinearGradient colors={["#0f0f1a", "#1a1a2e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Tickets</Text>
          <Text style={styles.headerSubtitle}>Your event tickets</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#a855f7"
            />
          }
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#a855f7" />
              <Text style={styles.loadingText}>Loading tickets...</Text>
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="ticket-outline" size={64} color="#6b7280" />
              <Text style={styles.emptyStateTitle}>No tickets yet</Text>
              <Text style={styles.emptyStateText}>
                Purchase tickets for public events to see them here
              </Text>
            </View>
          ) : (
            tickets.map((ticket) => (
              <TicketCard key={ticket._id} ticket={ticket} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: {
    fontSize: screenWidth > 400 ? 32 : 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: screenWidth > 400 ? 14 : 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: "#9ca3af",
    marginTop: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
