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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import DateTimePicker from "@react-native-community/datetimepicker";
import Carousel from "@/components/Carousel";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

interface PublicEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  userHasPurchased?: boolean;
  isCreator?: boolean;
  createdBy: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
}

export default function Home() {
  const router = useRouter();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
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

  const fetchPublicEvents = async () => {
    try {
      setLoadingEvents(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const response = await fetch(`${BASE_URL}/events/public/explore?limit=10`, {
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

    // Fetch public events
    fetchPublicEvents();
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEventData({ ...eventData, image: base64Image });
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
      }

      // On iOS, handle dismissal
      if (event && event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }

      // Update the selected date
      if (date) {
        setSelectedDate(date);
        setEventData({ ...eventData, date: date.toISOString() });
      }
    } catch (error) {
      console.error('Date picker error:', error);
      setShowDatePicker(false);
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

      const payload = {
        ...eventData,
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
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      const response = await fetch(`${BASE_URL}/events/${eventId}/purchase`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success!", `Successfully purchased ticket for "${eventTitle}"`);
        fetchPublicEvents();
      } else {
        Alert.alert("Error", data.message || "Failed to purchase ticket");
      }
    } catch (error) {
      console.error("Purchase ticket error:", error);
      Alert.alert("Error", "Failed to purchase ticket");
    }
  };


  const AnimatedFeatureCard = ({
    icon,
    title,
    description,
    gradient,
    delay,
    page,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    title: string;
    description: string;
    gradient: readonly [string, string];
      delay: number;
    page?: string;
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
        if (page) {
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

        {/* Explore Events Section */}
        {publicEvents.length > 0 && (
          <View style={styles.exploreSection}>
            <View style={styles.exploreSectionHeader}>
              <Text style={styles.sectionTitle}>Explore Events</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/events")}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionSubtitle}>
              Discover amazing public events happening near you
            </Text>

            {loadingEvents ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#a855f7" />
              </View>
            ) : (
              <Carousel itemWidth={320} gap={16}>
                {publicEvents.map((event) => (
                  <TouchableOpacity
                    key={event._id}
                    style={styles.eventCard}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/event/${event._id}` as any)}
                  >
                    <View style={styles.eventCardInner}>
                      {event.image ? (
                        <Image source={{ uri: event.image }} style={styles.eventCardImage} />
                      ) : (
                        <LinearGradient
                          colors={["#667eea", "#764ba2"]}
                          style={styles.eventCardImagePlaceholder}
                        >
                          <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.5)" />
                        </LinearGradient>
                      )}

                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.9)"]}
                        style={styles.eventCardGradient}
                      >
                        <View style={styles.eventCardContent}>
                          <Text style={styles.eventCardTitle} numberOfLines={2}>
                            {event.title}
                          </Text>

                          <View style={styles.eventCardDetail}>
                            <Ionicons name="location" size={14} color="#a855f7" />
                            <Text style={styles.eventCardDetailText} numberOfLines={1}>
                              {event.location}
                            </Text>
                          </View>

                          <View style={styles.eventCardDetail}>
                            <Ionicons name="calendar" size={14} color="#a855f7" />
                            <Text style={styles.eventCardDetailText}>
                              {new Date(event.date).toLocaleDateString()}
                            </Text>
                          </View>

                          {event.isPaid && (
                            <>
                              <View style={styles.eventCardPriceContainer}>
                                <LinearGradient
                                  colors={["#f093fb", "#f5576c"]}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={styles.eventCardPriceBadge}
                                >
                                  <Ionicons name="pricetag" size={12} color="#fff" />
                                  <Text style={styles.eventCardPriceText}>
                                    ${event.ticketPrice}
                                  </Text>
                                </LinearGradient>

                                {event.ticketsRemaining !== undefined && (
                                  <Text style={styles.eventCardTicketsText}>
                                    {event.ticketsRemaining} left
                                  </Text>
                                )}
                              </View>

                              {/* Show Buy Ticket button only if user hasn't purchased and isn't the creator */}
                              {!event.userHasPurchased && !event.isCreator && (
                                <TouchableOpacity
                                  style={styles.buyTicketButton}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseTicket(event._id, event.title);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <LinearGradient
                                    colors={["#a855f7", "#7c3aed"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.buyTicketGradient}
                                  >
                                    <Ionicons name="ticket" size={16} color="#fff" />
                                    <Text style={styles.buyTicketText}>Buy Ticket</Text>
                                  </LinearGradient>
                                </TouchableOpacity>
                              )}

                              {/* Show "Purchased" badge if user has a ticket */}
                              {event.userHasPurchased && (
                                <View style={styles.purchasedBadge}>
                                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                                  <Text style={styles.purchasedText}>Purchased</Text>
                                </View>
                              )}

                              {/* Show "Your Event" badge if user is the creator */}
                              {event.isCreator && (
                                <View style={styles.creatorBadge}>
                                  <Ionicons name="star" size={16} color="#f59e0b" />
                                  <Text style={styles.creatorText}>Your Event</Text>
                                </View>
                              )}
                            </>
                          )}

                          {!event.isPaid && (
                            <View style={styles.freeEventBadge}>
                              <Text style={styles.freeEventText}>FREE EVENT</Text>
                            </View>
                          )}
                        </View>
                      </LinearGradient>
                    </View>
                  </TouchableOpacity>
                ))}
              </Carousel>
            )}
          </View>
        )}

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
              page="events"
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
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Downtown Club"
                  placeholderTextColor="#6b7280"
                  value={eventData.location}
                  onChangeText={(text) =>
                    setEventData({ ...eventData, location: text })
                  }
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
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  eventCard: {
    width: "100%",
    height: 400,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  eventCardInner: {
    flex: 1,
    position: "relative",
  },
  eventCardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  eventCardImagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  eventCardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    justifyContent: "flex-end",
  },
  eventCardContent: {
    padding: 20,
  },
  eventCardTitle: {
    fontSize: scaleFontSize(22),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  eventCardDetail: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  eventCardDetailText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    flex: 1,
  },
  eventCardPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  eventCardPriceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  eventCardPriceText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  eventCardTicketsText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.medium,
    color: "#fbbf24",
  },
  buyTicketButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  buyTicketGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  buyTicketText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  freeEventBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  freeEventText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.bold,
    color: "#fff",
    letterSpacing: 0.5,
  },
  purchasedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  purchasedText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#10b981",
  },
  creatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  creatorText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#f59e0b",
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
});
