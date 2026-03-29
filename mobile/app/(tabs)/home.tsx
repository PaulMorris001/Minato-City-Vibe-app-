import React, { useState, useRef, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Animated,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { BASE_URL, CITIES } from "@/constants/constants";
import DateTimePicker from "@react-native-community/datetimepicker";
import Carousel from "@/components/Carousel";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import PublicEventCard, { PublicEvent } from "@/components/shared/PublicEventCard";
import { useStripePayment } from "@/hooks/useStripePayment";
import { uploadImage } from "@/utils/imageUpload";
import { trackEvent } from "@/utils/analytics";

export default function Home() {
  const router = useRouter();
  const { payForTicket } = useStripePayment();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [highlights, setHighlights] = useState<{ trending: PublicEvent[]; upcoming: PublicEvent[] }>({ trending: [], upcoming: [] });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [eventData, setEventData] = useState({
    title: "",
    date: "",
    location: "",
    image: "",
    description: "",
    isPublic: false,
    isPaid: false,
    ticketPrice: "",
    maxGuests: "",
  });

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const fetchPublicEvents = async (city?: string | null, silent = false) => {
    try {
      if (!silent) setLoadingEvents(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
      const response = await fetch(`${BASE_URL}/events/public/explore?limit=10${cityParam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (response.ok) {
        setPublicEvents(data.events || []);
      }
    } catch (error) {
      console.error("Fetch public events error:", error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchHighlights = async () => {
    try {
      setLoadingHighlights(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const response = await fetch(`${BASE_URL}/events/highlights`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        setHighlights({ trending: data.trending || [], upcoming: data.upcoming || [] });
      }
    } catch (error) {
      console.error("Fetch highlights error:", error);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPublicEvents(selectedCity, true), fetchHighlights()]);
    setRefreshing(false);
  };

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for FAB
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Initial data fetch
    fetchPublicEvents(null);
    fetchHighlights();

    // Background auto-refresh every 30s
    intervalRef.current = setInterval(() => {
      fetchPublicEvents(selectedCity, true);
    }, 30000);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        fetchPublicEvents(selectedCity, true);
        fetchHighlights();
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setEventData({ ...eventData, image: result.assets[0].uri });
    }
  };

  const onDateChange = (event: any, date?: Date) => {
    try {
      // Handle dismissal on Android
      if (Platform.OS === 'android') {
        setShowDatePicker(false);

        // If user cancelled or no date, don't update
        if (!event || event.type === 'dismissed' || !date) {
          return;
        }

        // On Android, after selecting date, show time picker
        if (date) {
          setSelectedDate(date);
          setShowTimePicker(true);
        }
        return;
      }

      // On iOS, handle dismissal
      if (event && event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }

      // Update the selected date (iOS only - handles both date and time)
      if (date) {
        setSelectedDate(date);
        setEventData({ ...eventData, date: date.toISOString() });
      }
    } catch (error) {
      console.error('Date picker error:', error);
      setShowDatePicker(false);
    }
  };

  const onTimeChange = (event: any, date?: Date) => {
    try {
      setShowTimePicker(false);

      // If user cancelled or no date, don't update
      if (!event || event.type === 'dismissed' || !date) {
        return;
      }

      // Combine the selected date with the new time
      if (date) {
        const updatedDate = new Date(selectedDate);
        updatedDate.setHours(date.getHours());
        updatedDate.setMinutes(date.getMinutes());
        setSelectedDate(updatedDate);
        setEventData({ ...eventData, date: updatedDate.toISOString() });
      }
    } catch (error) {
      console.error('Time picker error:', error);
      setShowTimePicker(false);
    }
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "Select date and time";
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCreateEvent = async () => {
    if (!eventData.title || !eventData.date || !eventData.location) {
      Alert.alert("Error", "Please fill in required fields (Title, Date, Location)");
      return;
    }

    if (eventData.isPublic && eventData.isPaid) {
      if (!eventData.ticketPrice || parseFloat(eventData.ticketPrice) <= 0) {
        Alert.alert("Error", "Please enter a valid ticket price");
        return;
      }
      if (!eventData.maxGuests || parseInt(eventData.maxGuests) <= 0) {
        Alert.alert("Error", "Please enter a valid number of max guests");
        return;
      }
    }

    setIsLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      if (!token) {
        Alert.alert("Error", "Please log in to create an event");
        setIsModalVisible(false);
        router.push("/login");
        return;
      }

      let imageUrl = eventData.image;
      if (imageUrl && (imageUrl.startsWith("file://") || imageUrl.startsWith("content://"))) {
        const uploadResult = await uploadImage(imageUrl, "events", token);
        imageUrl = uploadResult.url;
      }

      const payload = {
        ...eventData,
        image: imageUrl,
        ticketPrice: eventData.isPaid ? parseFloat(eventData.ticketPrice) : 0,
        maxGuests: eventData.isPaid ? parseInt(eventData.maxGuests) : 0,
      };

      const response = await fetch(`${BASE_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        trackEvent("event_created", { isPublic: eventData.isPublic, isPaid: eventData.isPaid });
        Alert.alert(
          "Event Created!",
          `Your event "${eventData.title}" has been created successfully.`,
          [
            {
              text: "View Events",
              onPress: () => {
                setEventData({
                  title: "",
                  date: "",
                  location: "",
                  image: "",
                  description: "",
                  isPublic: false,
                  isPaid: false,
                  ticketPrice: "",
                  maxGuests: "",
                });
                setIsModalVisible(false);
                router.push("/(tabs)/events");
              },
            },
            {
              text: "OK",
              onPress: () => {
                setEventData({
                  title: "",
                  date: "",
                  location: "",
                  image: "",
                  description: "",
                  isPublic: false,
                  isPaid: false,
                  ticketPrice: "",
                  maxGuests: "",
                });
                setIsModalVisible(false);
                fetchPublicEvents();
              },
            },
          ]
        );
      } else {
        Alert.alert("Error", data.message || "Failed to create event");
      }
    } catch (error) {
      console.error("Create event error:", error);
      Alert.alert("Error", "Failed to create event. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseTicket = async (eventId: string, eventTitle: string) => {
    const result = await payForTicket(eventId);
    if (!result.success) {
      if (result.error) Alert.alert("Payment Failed", result.error);
      return;
    }

    const token = await SecureStore.getItemAsync("token");
    const confirmRes = await fetch(`${BASE_URL}/stripe/confirm/ticket/${eventId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
    });

    if (confirmRes.ok) {
      trackEvent("ticket_purchased", { eventId, eventTitle });
      Alert.alert("Success!", `You're going to "${eventTitle}"! Check your tickets.`);
      fetch(`${BASE_URL}/notifications/sold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ticket", id: eventId }),
      }).catch(() => {});
      fetchPublicEvents();
    } else {
      const d = await confirmRes.json();
      Alert.alert("Error", d.message || "Payment succeeded but ticket could not be issued. Please contact support.");
    }
  };

  const handleJoinFreeEvent = async (eventId: string, eventTitle: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const response = await fetch(`${BASE_URL}/events/${eventId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success!", `You've joined "${eventTitle}"`);
        fetchPublicEvents();
      } else {
        Alert.alert("Error", data.message || "Failed to join event");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to join event");
    }
  };


  const AnimatedFeatureCard = ({
    icon,
    title,
    description,
    gradient,
    delay,
    page,
    onPress,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    title: string;
    description: string;
    gradient: readonly [string, string];
    delay: number;
    page?: string;
    onPress?: () => void;
  }) => {
    const cardFade = useRef(new Animated.Value(0)).current;
    const cardSlide = useRef(new Animated.Value(30)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(cardFade, {
          toValue: 1,
          duration: 500,
          delay,
          useNativeDriver: true,
        }),
        Animated.spring(cardSlide, {
          toValue: 0,
          delay,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, []);

    return (
      <Animated.View
        style={{
          opacity: cardFade,
          transform: [{ translateY: cardSlide }],
        }}
      >
        <TouchableOpacity
          style={styles.featureCard}
          activeOpacity={0.8}
          onPress={() => {
            if (onPress) {
              onPress();
            } else if (page) {
              const target = page.startsWith("/") ? page : `/${page}`;
              router.push(target as any);
            }
          }}
        >
          <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featureGradient}
          >
        <View style={styles.featureIconContainer}>
          <Ionicons name={icon} size={32} color="white" />
        </View>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#a855f7"
            colors={["#a855f7"]}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Section */}
        <LinearGradient
          colors={["#0f0f1a", "#1a1a2e", "#16213e"]}
          style={styles.heroSection}
        >
          <Animated.View
            style={[
              styles.heroContent,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              },
            ]}
          >
            <Text style={styles.logoText}>NightVibe</Text>
            <Text style={styles.heroTitle}>
              Plan Epic Nights Out {"\n"}& Unforgettable Parties
            </Text>
            <Text style={styles.heroSubtitle}>
              Discover venues, vendors, and experiences in your city
            </Text>

            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.8}
              onPress={() => router.push("/(tabs)/vendors")}
            >
              <LinearGradient
                colors={["#a855f7", "#7c3aed"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>Explore Vendors</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Decorative elements */}
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
        </LinearGradient>

        {/* Trending Now Section */}
        <View style={styles.exploreSection}>
          <View style={styles.exploreSectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flame" size={20} color="#f97316" style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Trending Now</Text>
            </View>
          </View>
          {loadingHighlights ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#a855f7" />
            </View>
          ) : highlights.trending.length > 0 ? (
            <Carousel itemWidth={300} gap={16}>
              {highlights.trending.map((event) => (
                <PublicEventCard
                  key={event._id}
                  event={event}
                  onPurchaseTicket={handlePurchaseTicket}
                  onJoinFreeEvent={handleJoinFreeEvent}
                />
              ))}
            </Carousel>
          ) : (
            <View style={styles.emptySectionContainer}>
              <Ionicons name="flame-outline" size={36} color="#4b5563" />
              <Text style={styles.emptySectionText}>No trending events yet</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(true)}>
                <Text style={styles.emptySectionCta}>Create the first one</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* This Week Section */}
        {(highlights.upcoming.length > 0 || !loadingHighlights) && (
          <View style={styles.exploreSection}>
            <View style={styles.exploreSectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar" size={18} color="#a855f7" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>This Week</Text>
              </View>
            </View>
            {loadingHighlights ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#a855f7" />
              </View>
            ) : highlights.upcoming.length > 0 ? (
              <Carousel itemWidth={300} gap={16}>
                {highlights.upcoming.map((event) => (
                  <PublicEventCard
                    key={event._id}
                    event={event}
                    onPurchaseTicket={handlePurchaseTicket}
                    onJoinFreeEvent={handleJoinFreeEvent}
                  />
                ))}
              </Carousel>
            ) : (
              <View style={styles.emptySectionContainer}>
                <Text style={styles.emptySectionText}>No events this week</Text>
              </View>
            )}
          </View>
        )}

        {/* Upcoming Events Section */}
        <View style={styles.exploreSection}>
          <View style={styles.exploreSectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <TouchableOpacity onPress={() => router.push("/public-events" as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>
            Discover amazing public events happening near you
          </Text>

          {/* City filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.cityFilterScroll}
            contentContainerStyle={styles.cityFilterContent}
          >
            <TouchableOpacity
              style={[styles.cityChip, !selectedCity && styles.cityChipActive]}
              onPress={() => {
                setSelectedCity(null);
                fetchPublicEvents(null);
              }}
            >
              <Text style={[styles.cityChipText, !selectedCity && styles.cityChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {CITIES.map((city) => (
              <TouchableOpacity
                key={city._id}
                style={[styles.cityChip, selectedCity === city.name && styles.cityChipActive]}
                onPress={() => {
                  setSelectedCity(city.name);
                  fetchPublicEvents(city.name);
                }}
              >
                <Text style={[styles.cityChipText, selectedCity === city.name && styles.cityChipTextActive]}>
                  {city.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingEvents ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#a855f7" />
            </View>
          ) : publicEvents.length > 0 ? (
            <Carousel itemWidth={320} gap={16}>
              {publicEvents.map((event) => (
                <PublicEventCard
                  key={event._id}
                  event={event}
                  onPurchaseTicket={handlePurchaseTicket}
                  onJoinFreeEvent={handleJoinFreeEvent}
                />
              ))}
            </Carousel>
          ) : (
            <View style={styles.emptySectionContainer}>
              <Ionicons name="calendar-outline" size={36} color="#4b5563" />
              <Text style={styles.emptySectionText}>
                {selectedCity ? `No events in ${selectedCity}` : "No upcoming events"}
              </Text>
            </View>
          )}
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What We Offer</Text>
          <Text style={styles.sectionSubtitle}>
            Everything you need for the perfect night
          </Text>

          <View style={styles.featuresGrid}>
            <AnimatedFeatureCard
              icon="business"
              title="Find Vendors & Venues"
              description="Discover the best nightlife spots and service providers"
              gradient={["#667eea", "#764ba2"] as const}
              delay={100}
              page="vendors"
            />
            <AnimatedFeatureCard
              icon="calendar"
              title="Plan Your Event"
              description="Organize every detail of your perfect night out"
              gradient={["#f093fb", "#f5576c"] as const}
              delay={200}
              onPress={() => setIsModalVisible(true)}
            />
            <AnimatedFeatureCard
              icon="star"
              title="Curated Lists"
              description="Explore top-rated picks and local favorites"
              gradient={["#4facfe", "#00f2fe"] as const}
              delay={300}
              page="bests"
            />
          </View>
        </View>

        {/* Quick Actions Section */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.sectionSubtitle}>
            Everything you need at your fingertips
          </Text>

          <View style={styles.quickActionsGrid}>
            {/* Row 1 */}
            <View style={styles.quickActionRow}>
              <TouchableOpacity
                style={[styles.quickActionCard, styles.quickActionCardHalf]}
                activeOpacity={0.8}
                onPress={() => router.push("/(tabs)/vendors")}
              >
                <LinearGradient
                  colors={["#5b21b6", "#7c3aed"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickActionGradient}
                >
                  <View style={styles.quickActionIconBg}>
                    <Ionicons name="business" size={24} color="white" />
                  </View>
                  <Text style={styles.quickActionText}>Browse Vendors</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, styles.quickActionCardHalf]}
                activeOpacity={0.8}
                onPress={() => router.push("/(tabs)/events")}
              >
                <LinearGradient
                  colors={["#be123c", "#e11d48"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickActionGradient}
                >
                  <View style={styles.quickActionIconBg}>
                    <Ionicons name="calendar" size={24} color="white" />
                  </View>
                  <Text style={styles.quickActionText}>My Events</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Row 2 */}
            <View style={styles.quickActionRow}>
              <TouchableOpacity
                style={[styles.quickActionCard, styles.quickActionCardHalf]}
                activeOpacity={0.8}
                onPress={() => router.push("/(tabs)/bests")}
              >
                <LinearGradient
                  colors={["#0369a1", "#0284c7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickActionGradient}
                >
                  <View style={styles.quickActionIconBg}>
                    <Ionicons name="star" size={24} color="white" />
                  </View>
                  <Text style={styles.quickActionText}>Best of Lists</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, styles.quickActionCardHalf]}
                activeOpacity={0.8}
                onPress={() => router.push("/(tabs)/chats")}
              >
                <LinearGradient
                  colors={["#15803d", "#16a34a"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickActionGradient}
                >
                  <View style={styles.quickActionIconBg}>
                    <Ionicons name="chatbubbles" size={24} color="white" />
                  </View>
                  <Text style={styles.quickActionText}>Messages</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with love for nightlife enthusiasts
          </Text>
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <Animated.View
        style={[styles.fabContainer, { transform: [{ scale: pulseAnim }] }]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setIsModalVisible(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#a855f7", "#7c3aed"]}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Create Event Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Event</Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Birthday Party"
                  placeholderTextColor="#6b7280"
                  value={eventData.title}
                  onChangeText={(text) =>
                    setEventData({ ...eventData, title: text })
                  }
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date & Time *</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={20} color="#a855f7" />
                  <Text style={styles.datePickerText}>
                    {formatDisplayDate(eventData.date)}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && Platform.OS === 'ios' && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="datetime"
                    display="spinner"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                    themeVariant="dark"
                  />
                )}
                {showDatePicker && Platform.OS === 'android' && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="spinner"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                )}
                {showTimePicker && Platform.OS === 'android' && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="time"
                    display="spinner"
                    onChange={onTimeChange}
                    is24Hour={false}
                  />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location *</Text>
                <TouchableOpacity
                  style={styles.cityPickerButton}
                  onPress={() => setShowCityPicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location-outline" size={18} color="#9ca3af" />
                  <Text style={[styles.cityPickerText, eventData.location && styles.cityPickerTextFilled]}>
                    {eventData.location || "Pick a city..."}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="Specific venue or address (optional)"
                  placeholderTextColor="#6b7280"
                  value={eventData.location.includes(",") ? eventData.location.split(",").slice(1).join(",").trim() : ""}
                  onChangeText={(text) => {
                    const cityPart = eventData.location.includes(",")
                      ? eventData.location.split(",")[0]
                      : eventData.location;
                    setEventData({ ...eventData, location: text ? `${cityPart}, ${text}` : cityPart });
                  }}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Image</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={["#667eea", "#764ba2"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.imagePickerGradient}
                  >
                    <Ionicons name="image-outline" size={20} color="white" />
                    <Text style={styles.imagePickerText}>
                      {eventData.image ? "Change Image" : "Pick an Image"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                {eventData.image ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image
                      source={{ uri: eventData.image }}
                      style={styles.imagePreview}
                    />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() =>
                        setEventData({ ...eventData, image: "" })
                      }
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe your event..."
                  placeholderTextColor="#6b7280"
                  value={eventData.description}
                  onChangeText={(text) =>
                    setEventData({ ...eventData, description: text })
                  }
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Visibility</Text>
                <View style={styles.visibilityOptions}>
                  <TouchableOpacity
                    style={[
                      styles.visibilityOption,
                      !eventData.isPublic && styles.visibilityOptionActive,
                    ]}
                    onPress={() =>
                      setEventData({ ...eventData, isPublic: false, isPaid: false })
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="lock-closed"
                      size={20}
                      color={!eventData.isPublic ? "#a855f7" : "#6b7280"}
                    />
                    <Text
                      style={[
                        styles.visibilityOptionText,
                        !eventData.isPublic && styles.visibilityOptionTextActive,
                      ]}
                    >
                      Private
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.visibilityOption,
                      eventData.isPublic && styles.visibilityOptionActive,
                    ]}
                    onPress={() => setEventData({ ...eventData, isPublic: true })}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="globe"
                      size={20}
                      color={eventData.isPublic ? "#a855f7" : "#6b7280"}
                    />
                    <Text
                      style={[
                        styles.visibilityOptionText,
                        eventData.isPublic && styles.visibilityOptionTextActive,
                      ]}
                    >
                      Public
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {eventData.isPublic && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Pricing</Text>
                    <View style={styles.visibilityOptions}>
                      <TouchableOpacity
                        style={[
                          styles.visibilityOption,
                          !eventData.isPaid && styles.visibilityOptionActive,
                        ]}
                        onPress={() =>
                          setEventData({
                            ...eventData,
                            isPaid: false,
                            ticketPrice: "",
                            maxGuests: "",
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="gift"
                          size={20}
                          color={!eventData.isPaid ? "#10b981" : "#6b7280"}
                        />
                        <Text
                          style={[
                            styles.visibilityOptionText,
                            !eventData.isPaid && styles.visibilityOptionTextActive,
                          ]}
                        >
                          Free
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.visibilityOption,
                          eventData.isPaid && styles.visibilityOptionActive,
                        ]}
                        onPress={() => setEventData({ ...eventData, isPaid: true })}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="card"
                          size={20}
                          color={eventData.isPaid ? "#a855f7" : "#6b7280"}
                        />
                        <Text
                          style={[
                            styles.visibilityOptionText,
                            eventData.isPaid && styles.visibilityOptionTextActive,
                          ]}
                        >
                          Paid
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {eventData.isPaid && (
                    <>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Ticket Price ($) *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 25"
                          placeholderTextColor="#6b7280"
                          value={eventData.ticketPrice}
                          onChangeText={(text) =>
                            setEventData({ ...eventData, ticketPrice: text })
                          }
                          keyboardType="decimal-pad"
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Max Guests *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 100"
                          placeholderTextColor="#6b7280"
                          value={eventData.maxGuests}
                          onChangeText={(text) =>
                            setEventData({ ...eventData, maxGuests: text })
                          }
                          keyboardType="number-pad"
                        />
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateEvent}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={["#a855f7", "#7c3aed"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.createButtonGradient}
                >
                  <Text style={styles.createButtonText}>
                    {isLoading ? "Creating..." : "Create Event"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* City Picker Modal */}
      <Modal
        visible={showCityPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCityPicker(false)}
      >
        <TouchableOpacity
          style={styles.cityModalOverlay}
          activeOpacity={1}
          onPress={() => setShowCityPicker(false)}
        >
          <View style={styles.cityModalContent}>
            <View style={styles.cityModalHeader}>
              <Text style={styles.cityModalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {CITIES.map((city) => (
              <TouchableOpacity
                key={city._id}
                style={styles.cityOption}
                onPress={() => {
                  setEventData({ ...eventData, location: city.name });
                  setShowCityPicker(false);
                }}
              >
                <Ionicons name="location" size={18} color="#a855f7" />
                <Text style={styles.cityOptionText}>{city.name}</Text>
                <Text style={styles.cityOptionState}>{city.state}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroSection: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 40 : 80,
    paddingBottom: 60,
    paddingHorizontal: getResponsivePadding(),
    position: "relative",
    overflow: "hidden",
  },
  heroContent: {
    alignItems: "center",
  },
  logoText: {
    fontSize: scaleFontSize(40),
    fontFamily: Fonts.black,
    color: "#a855f7",
    marginBottom: 16,
    textShadowColor: "rgba(168, 85, 247, 0.5)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  heroTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#a855f7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
  },
  ctaText: {
    color: "white",
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
  },
  decorCircle1: {
    position: "absolute",
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -50,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(124, 58, 237, 0.1)",
  },
  featuresSection: {
    paddingVertical: 50,
    paddingHorizontal: getResponsivePadding(),
    backgroundColor: "#0f0f1a",
  },
  sectionTitle: {
    fontSize: scaleFontSize(22),
    fontFamily: Fonts.bold,
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 32,
  },
  featuresGrid: {
    gap: 16,
  },
  featureCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  featureGradient: {
    padding: 24,
    alignItems: "center",
  },
  featureIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  featureDescription: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    lineHeight: 20,
  },
  quickActionsSection: {
    paddingVertical: 40,
    paddingHorizontal: getResponsivePadding(),
    backgroundColor: "#1f1f2e",
  },
  quickActionsGrid: {
    gap: 12,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 0,
  },
  quickActionCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  quickActionCardHalf: {
    flex: 1,
  },
  quickActionGradient: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
  },
  quickActionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.bold,
    color: "white",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  footer: {
    paddingVertical: 30,
    alignItems: "center",
    backgroundColor: "#0f0f1a",
  },
  footerText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#6b7280",
  },
  fabContainer: {
    position: "absolute",
    bottom: 16,
    right: 24,
  },
  fab: {
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#a855f7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  fabGradient: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#374151",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#9ca3af",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
  },
  createButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  createButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  createButtonText: {
    color: "white",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
  imagePickerButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  imagePickerGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  imagePickerText: {
    color: "white",
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
  },
  imagePreviewContainer: {
    marginTop: 12,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 12,
  },
  datePickerButton: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  datePickerText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
    flex: 1,
  },
  exploreSection: {
    paddingVertical: 50,
    backgroundColor: "#0f0f1a",
  },
  exploreSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: getResponsivePadding(),
    marginBottom: 8,
  },
  seeAllText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cityFilterScroll: {
    marginTop: 8,
    marginBottom: 12,
  },
  cityFilterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  cityChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#374151",
    marginRight: 8,
  },
  cityChipActive: {
    backgroundColor: "#a855f7",
  },
  cityChipText: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.medium,
    color: "#9ca3af",
  },
  cityChipTextActive: {
    color: "#fff",
  },
  emptySectionContainer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptySectionText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
  },
  emptySectionCta: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
    marginTop: 6,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  visibilityOptions: {
    flexDirection: "row",
    gap: 12,
  },
  visibilityOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#374151",
    borderWidth: 2,
    borderColor: "transparent",
  },
  visibilityOptionActive: {
    borderColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  visibilityOptionText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
  },
  visibilityOptionTextActive: {
    color: "#a855f7",
  },
  cityPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#4b5563",
    gap: 8,
  },
  cityPickerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#6b7280",
  },
  cityPickerTextFilled: {
    color: "#fff",
  },
  cityModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  cityModalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  cityModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cityModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  cityOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    gap: 12,
  },
  cityOptionText: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: "#fff",
  },
  cityOptionState: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
});
