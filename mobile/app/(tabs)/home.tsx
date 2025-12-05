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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      // Format date as ISO string for the backend
      setEventData({ ...eventData, date: date.toISOString() });
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

  // Mock top vendors data
  const topVendors: {
    id: number;
    name: string;
    category: string;
    rating: number;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    gradient: readonly [string, string];
  }[] = [
    {
      id: 1,
      name: "Electric Lounge",
      category: "Nightclub",
      rating: 4.8,
      icon: "musical-notes",
      gradient: ["#667eea", "#764ba2"] as const,
    },
    {
      id: 2,
      name: "Skybar Rooftop",
      category: "Bar & Lounge",
      rating: 4.9,
      icon: "wine",
      gradient: ["#f093fb", "#f5576c"] as const,
    },
    {
      id: 3,
      name: "Groove Station",
      category: "DJ Services",
      rating: 4.7,
      icon: "disc",
      gradient: ["#4facfe", "#00f2fe"] as const,
    },
  ];

  // Pricing plans
  const pricingPlans: {
    id: number;
    name: string;
    price: string;
    period: string;
    features: string[];
    gradient: readonly [string, string];
    popular?: boolean;
  }[] = [
    {
      id: 1,
      name: "Basic",
      price: "$20",
      period: "/month",
      features: [
        "Profile listing",
        "Contact information",
        "Basic analytics",
      ],
      gradient: ["#667eea", "#764ba2"] as const,
    },
    {
      id: 2,
      name: "Pro",
      price: "$35",
      period: "/month",
      features: [
        "Everything in Basic",
        "Featured placement",
        "Advanced analytics",
        "Priority support",
      ],
      gradient: ["#f093fb", "#f5576c"] as const,
      popular: true,
    },
    {
      id: 3,
      name: "Premium",
      price: "$50",
      period: "/month",
      features: [
        "Everything in Pro",
        "Top placement",
        "Booking system",
        "Dedicated account manager",
      ],
      gradient: ["#43e97b", "#38f9d7"] as const,
    },
  ];

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

        {/* Top Vendors Section */}
        <View style={styles.vendorsSection}>
          <Text style={styles.sectionTitle}>Top Rated Vendors</Text>
          <Text style={styles.sectionSubtitle}>
            Trusted partners for exceptional experiences
          </Text>

          {topVendors.map((vendor, index) => {
            const VendorCard = () => {
              const vendorFade = useRef(new Animated.Value(0)).current;
              const vendorSlide = useRef(new Animated.Value(50)).current;

              useEffect(() => {
                Animated.parallel([
                  Animated.timing(vendorFade, {
                    toValue: 1,
                    duration: 500,
                    delay: index * 150,
                    useNativeDriver: true,
                  }),
                  Animated.spring(vendorSlide, {
                    toValue: 0,
                    delay: index * 150,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                  }),
                ]).start();
              }, []);

              return (
                <Animated.View
                  style={{
                    opacity: vendorFade,
                    transform: [{ translateX: vendorSlide }],
                  }}
                >
                  <TouchableOpacity
                    style={styles.vendorCard}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={vendor.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.vendorIconGradient}
                    >
                      <Ionicons name={vendor.icon} size={24} color="white" />
                    </LinearGradient>
                    <View style={styles.vendorInfo}>
                      <Text style={styles.vendorName}>{vendor.name}</Text>
                      <Text style={styles.vendorCategory}>
                        {vendor.category}
                      </Text>
                      <View style={styles.ratingContainer}>
                        <Ionicons name="star" size={14} color="#fbbf24" />
                        <Text style={styles.ratingText}>{vendor.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.vendorArrow}>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            };
            return <VendorCard key={vendor.id} />;
          })}
        </View>

        {/* Pricing Section */}
        <LinearGradient
          colors={["#1a1a2e", "#16213e", "#0f0f1a"]}
          style={styles.pricingSection}
        >
          <Text style={styles.pricingSectionTitle}>Become a Vendor</Text>
          <Text style={styles.pricingSectionSubtitle}>
            Choose the perfect plan for your business
          </Text>

          {pricingPlans.map((plan) => (
            <View
              key={plan.id}
              style={[styles.pricingCard, plan.popular && styles.popularCard]}
            >
              {plan.popular && (
                <LinearGradient
                  colors={["#f093fb", "#f5576c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.popularBadge}
                >
                  <Text style={styles.popularText}>MOST POPULAR</Text>
                </LinearGradient>
              )}
              <Text style={styles.planName}>{plan.name}</Text>
              <View style={styles.priceContainer}>
                <LinearGradient
                  colors={plan.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.priceGradientBg}
                >
                  <Text style={styles.price}>{plan.price}</Text>
                </LinearGradient>
                <Text style={styles.period}>{plan.period}</Text>
              </View>
              <View style={styles.planFeaturesContainer}>
                {plan.features.map((feature, idx) => (
                  <View key={idx} style={styles.planFeatureRow}>
                    <LinearGradient
                      colors={plan.gradient}
                      style={styles.checkCircle}
                    >
                      <Ionicons name="checkmark" size={12} color="white" />
                    </LinearGradient>
                    <Text style={styles.planFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.planButton} activeOpacity={0.8}>
                <LinearGradient
                  colors={plan.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.planButtonGradient}
                >
                  <Text style={styles.planButtonText}>Get Started</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ))}
        </LinearGradient>

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
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
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
    paddingHorizontal: 24,
    position: "relative",
    overflow: "hidden",
  },
  heroContent: {
    alignItems: "center",
  },
  logoText: {
    fontSize: 48,
    fontFamily: Fonts.black,
    color: "#a855f7",
    marginBottom: 16,
    textShadowColor: "rgba(168, 85, 247, 0.5)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 36,
  },
  heroSubtitle: {
    fontSize: 16,
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
    fontSize: 18,
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
    paddingHorizontal: 24,
    backgroundColor: "#0f0f1a",
  },
  sectionTitle: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 15,
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
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  featureDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    lineHeight: 20,
  },
  vendorsSection: {
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: "#1f1f2e",
  },
  vendorCard: {
    backgroundColor: "#0f0f1a",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  vendorIconGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  vendorInfo: {
    flex: 1,
  },
  vendorName: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  vendorCategory: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fbbf24",
  },
  vendorArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  pricingSection: {
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  pricingSectionTitle: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  pricingSectionSubtitle: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 32,
  },
  pricingCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#374151",
    position: "relative",
  },
  popularCard: {
    borderColor: "#f093fb",
    borderWidth: 2,
  },
  popularBadge: {
    position: "absolute",
    top: -14,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  popularText: {
    color: "white",
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1,
  },
  planName: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  priceGradientBg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  price: {
    fontSize: 36,
    fontFamily: Fonts.black,
    color: "white",
  },
  period: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  planFeaturesContainer: {
    gap: 14,
    marginBottom: 24,
  },
  planFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  planFeatureText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    flex: 1,
  },
  planButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  planButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  planButtonText: {
    color: "white",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  footer: {
    paddingVertical: 30,
    alignItems: "center",
    backgroundColor: "#0f0f1a",
  },
  footerText: {
    fontSize: 14,
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
    fontSize: 24,
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
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 14,
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
    fontSize: 16,
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
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  seeAllText: {
    fontSize: 14,
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
    fontSize: 22,
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
    fontSize: 14,
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
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  eventCardTicketsText: {
    fontSize: 14,
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
    fontSize: 16,
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
    fontSize: 14,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
  },
  visibilityOptionTextActive: {
    color: "#a855f7",
  },
});
