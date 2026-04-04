import React, { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import DateTimePicker from "@react-native-community/datetimepicker";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import socketService from "@/services/socket.service";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";

interface Event {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  shareToken: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  userStatus: "creator" | "accepted" | "pending" | "none";
  createdBy: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
  invitedUsers: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  }[];
  pendingInvites: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [inviteTab, setInviteTab] = useState<"people" | "vendors">("people");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [editData, setEditData] = useState({
    title: "",
    date: "",
    location: "",
    image: "",
    description: "",
    isPublic: false,
  });

  const PAGE_LIMIT = 10;

  const fetchEvents = async (pageNum = 1, isRefresh = false) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        `${BASE_URL}/events?page=${pageNum}&limit=${PAGE_LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();

      if (response.ok) {
        const incoming = data.events || [];
        if (isRefresh || pageNum === 1) {
          setEvents(incoming);
        } else {
          setEvents((prev) => [...prev, ...incoming]);
        }
        setTotal(data.total ?? incoming.length);
        setPage(pageNum);
        setHasMore(incoming.length === PAGE_LIMIT);
      } else {
        Alert.alert("Error", data.message || "Failed to fetch events");
      }
    } catch (error) {
      console.error("Fetch events error:", error);
      Alert.alert("Error", "Failed to load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchEvents(page + 1);
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents(1, true);
    }, [])
  );

  // Re-fetch events immediately when this user receives a new invite via socket
  useEffect(() => {
    socketService.on("events-tab", {
      onEventInvite: () => {
        fetchEvents(1, true);
      },
    });
    return () => socketService.off("events-tab");
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents(1, true);
  };

  const handleRespondInvite = async (eventId: string, status: "accepted" | "declined") => {
    setRespondingInvite(eventId);
    try {
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(`${BASE_URL}/events/${eventId}/respond-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (response.ok) {
        // Refresh list to reflect change
        fetchEvents(1, true);
        Alert.alert(
          status === "accepted" ? "Joined!" : "Declined",
          status === "accepted"
            ? "You've joined the event."
            : "Invite declined."
        );
      } else {
        Alert.alert("Error", data.message || "Could not respond to invite");
      }
    } catch {
      Alert.alert("Error", "Failed to respond to invite");
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleShareEvent = async (event: Event) => {
    try {
      const deepLink = `mobile://share/${event.shareToken}`;
      await Share.share({
        message: `Join my event: ${event.title}\nDate: ${new Date(event.date).toLocaleDateString()}\nLocation: ${event.location}\n\nOpen in NightVibe: ${deepLink}`,
        title: event.title,
        url: deepLink,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const openEditModal = (event: Event) => {
    setSelectedEvent(event);
    const eventDate = new Date(event.date);
    setSelectedDate(eventDate);
    setEditData({
      title: event.title,
      date: eventDate.toISOString(),
      location: event.location,
      image: event.image || "",
      description: event.description || "",
      isPublic: event.isPublic,
    });
    setIsEditModalVisible(true);
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
        setEditData({ ...editData, date: date.toISOString() });
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
        setEditData({ ...editData, date: updatedDate.toISOString() });
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

  const openInviteModal = (event: Event) => {
    setSelectedEvent(event);
    setInviteUsername("");
    setSearchedUsers([]);
    setIsInviteModalVisible(true);
  };

  useEffect(() => {
    const searchMutualFollows = async (query: string) => {
      if (query.trim().length < 2) {
        setSearchedUsers([]);
        return;
      }

      try {
        setSearchingUsers(true);
        const token = await SecureStore.getItemAsync("token");
        const response = await fetch(
          `${BASE_URL}/follow/mutual?query=${encodeURIComponent(query)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        if (response.ok) {
          // Filter out users that are already invited or are the creator
          const filteredUsers = (data.users || []).filter(
            (user: any) => {
              const uid = user.id || user._id;
              return (
                uid !== selectedEvent?.createdBy._id &&
                !selectedEvent?.invitedUsers.some((invitedUser) => invitedUser._id === uid) &&
                !selectedEvent?.pendingInvites.some((pending) => pending._id === uid)
              );
            }
          );
          setSearchedUsers(filteredUsers);
        }
      } catch (error) {
        console.error("Error searching mutual follows:", error);
      } finally {
        setSearchingUsers(false);
      }
    };

    if (inviteUsername.trim().length >= 2) {
      const debounce = setTimeout(() => {
        searchMutualFollows(inviteUsername);
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchedUsers([]);
    }
  }, [inviteUsername, selectedEvent]);

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return;

    if (!editData.title || !editData.date || !editData.location) {
      Alert.alert("Error", "Please fill in required fields");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(`${BASE_URL}/events/${selectedEvent._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editData),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "Event updated successfully");
        setIsEditModalVisible(false);
        fetchEvents(1, true);
      } else {
        Alert.alert("Error", data.message || "Failed to update event");
      }
    } catch (error) {
      console.error("Update event error:", error);
      Alert.alert("Error", "Failed to update event");
    }
  };

  const handleInviteUser = async (user: any) => {
    if (!selectedEvent) return;

    try {
      const token = await SecureStore.getItemAsync("token");
      const response = await fetch(
        `${BASE_URL}/events/${selectedEvent._id}/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ username: user.username }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "User invited successfully");
        setIsInviteModalVisible(false);
        setInviteUsername("");
        setSearchedUsers([]);
        setInviteTab("people");
        fetchEvents(1, true);
      } else {
        Alert.alert("Error", data.message || "Failed to invite user");
      }
    } catch (error) {
      console.error("Invite user error:", error);
      Alert.alert("Error", "Failed to invite user");
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("token");
              const response = await fetch(`${BASE_URL}/events/${eventId}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              const data = await response.json();

              if (response.ok) {
                Alert.alert("Success", "Event deleted successfully");
                fetchEvents(1, true);
              } else {
                Alert.alert("Error", data.message || "Failed to delete event");
              }
            } catch (error) {
              console.error("Delete event error:", error);
              Alert.alert("Error", "Failed to delete event");
            }
          },
        },
      ]
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEditData({ ...editData, image: base64Image });
    }
  };

  const handleEventPress = (eventId: string) => {
    router.push(`/event/${eventId}`);
  };

  const renderEvent = (event: Event) => {
    const isCreator = event.createdBy._id;
    const eventDate = new Date(event.date);

    return (
      <TouchableOpacity
        key={event._id}
        style={styles.eventCard}
        onPress={() => handleEventPress(event._id)}
        activeOpacity={0.8}
      >
        {event.image ? (
          <Image source={{ uri: event.image }} style={styles.eventImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="calendar-outline" size={40} color="#6b7280" />
          </View>
        )}

        <View style={styles.eventContent}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            {event.isPublic && (
              <View style={styles.publicBadge}>
                <Ionicons name="globe-outline" size={14} color="#10b981" />
                <Text style={styles.publicBadgeText}>PUBLIC</Text>
              </View>
            )}
          </View>

          <View style={styles.eventDetail}>
            <Ionicons name="calendar" size={16} color="#a855f7" />
            <Text style={styles.eventDetailText}>
              {eventDate.toLocaleDateString()} at{" "}
              {eventDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View style={styles.eventDetail}>
            <Ionicons name="location" size={16} color="#a855f7" />
            <Text style={styles.eventDetailText}>{event.location}</Text>
          </View>

          {event.description ? (
            <View style={styles.eventDetail}>
              <Ionicons name="document-text" size={16} color="#a855f7" />
              <Text style={styles.eventDetailText} numberOfLines={2}>
                {event.description}
              </Text>
            </View>
          ) : null}

          {/* Show ticket stats for public paid events, invited count for private events */}
          {event.isPublic && event.isPaid ? (
            <View style={styles.eventDetail}>
              <Ionicons name="ticket" size={16} color="#a855f7" />
              <Text style={styles.eventDetailText}>
                {event.ticketsSold || 0} / {event.maxGuests} tickets sold
              </Text>
            </View>
          ) : (
            <View style={styles.eventDetail}>
              <Ionicons name="people" size={16} color="#a855f7" />
              <Text style={styles.eventDetailText}>
                {event.invitedUsers.length} invited
              </Text>
            </View>
          )}

          <View style={styles.eventActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleShareEvent(event);
              }}
            >
              <Ionicons name="share-social" size={20} color="#a855f7" />
            </TouchableOpacity>

            {/* Only show invite button for private events */}
            {!event.isPublic && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  openInviteModal(event);
                }}
              >
                <Ionicons name="person-add" size={20} color="#a855f7" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                openEditModal(event);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#a855f7" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteEvent(event._id);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <LinearGradient colors={["#0f0f1a", "#1a1a2e"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>My Events</Text>
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
            <EventCardSkeleton count={5} />
          ) : (() => {
            const pending = events.filter(e => e.userStatus === "pending");
            const myEvents = events.filter(e => e.userStatus !== "pending");
            return (
              <>
                {/* ── Pending Invites ── */}
                {pending.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pending Invites</Text>
                    {pending.map(event => {
                      const eventDate = new Date(event.date);
                      const isResponding = respondingInvite === event._id;
                      return (
                        <TouchableOpacity
                          key={event._id}
                          style={styles.pendingCard}
                          onPress={() => handleEventPress(event._id)}
                          activeOpacity={0.8}
                        >
                          {event.image ? (
                            <Image source={{ uri: event.image }} style={styles.pendingImage} />
                          ) : (
                            <View style={styles.pendingImagePlaceholder}>
                              <Ionicons name="calendar-outline" size={28} color="#6b7280" />
                            </View>
                          )}
                          <View style={styles.pendingContent}>
                            <Text style={styles.pendingTitle} numberOfLines={1}>{event.title}</Text>
                            <Text style={styles.pendingMeta}>
                              {event.createdBy.username} · {eventDate.toLocaleDateString()}
                            </Text>
                            <Text style={styles.pendingMeta} numberOfLines={1}>{event.location}</Text>
                            <View style={styles.pendingActions}>
                              <TouchableOpacity
                                style={[styles.pendingBtn, styles.acceptBtn]}
                                onPress={(e) => { e.stopPropagation(); handleRespondInvite(event._id, "accepted"); }}
                                disabled={isResponding}
                              >
                                {isResponding ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <>
                                    <Ionicons name="checkmark" size={15} color="#fff" />
                                    <Text style={styles.acceptBtnText}>Accept</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.pendingBtn, styles.declineBtn]}
                                onPress={(e) => { e.stopPropagation(); handleRespondInvite(event._id, "declined"); }}
                                disabled={isResponding}
                              >
                                <Ionicons name="close" size={15} color="#ef4444" />
                                <Text style={styles.declineBtnText}>Decline</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── My Events & Attending ── */}
                {myEvents.length === 0 && pending.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="calendar-outline" size={64} color="#6b7280" />
                    <Text style={styles.emptyStateTitle}>No events yet</Text>
                    <Text style={styles.emptyStateText}>
                      Create your first event from the home page
                    </Text>
                  </View>
                ) : myEvents.length > 0 ? (
                  <View style={styles.section}>
                    {pending.length > 0 && (
                      <Text style={styles.sectionTitle}>My Events</Text>
                    )}
                    {myEvents.map(renderEvent)}
                  </View>
                ) : null}

                {/* ── Load More ── */}
                {hasMore && (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={loadMore}
                    disabled={loadingMore}
                    activeOpacity={0.7}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#a855f7" />
                    ) : (
                      <Text style={styles.loadMoreText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                )}
                {!hasMore && events.length > 0 && (
                  <Text style={styles.allLoadedText}>
                    {total} event{total !== 1 ? "s" : ""} total
                  </Text>
                )}
              </>
            );
          })()}
        </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Edit Event Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Event</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
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
                  value={editData.title}
                  onChangeText={(text) =>
                    setEditData({ ...editData, title: text })
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
                    {formatDisplayDate(editData.date)}
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
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Downtown Club"
                  placeholderTextColor="#6b7280"
                  value={editData.location}
                  onChangeText={(text) =>
                    setEditData({ ...editData, location: text })
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
                      {editData.image ? "Change Image" : "Pick an Image"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                {editData.image ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image
                      source={{ uri: editData.image }}
                      style={styles.imagePreview}
                    />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setEditData({ ...editData, image: "" })}
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
                  value={editData.description}
                  onChangeText={(text) =>
                    setEditData({ ...editData, description: text })
                  }
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Visibility</Text>
                <TouchableOpacity
                  style={styles.visibilityToggle}
                  onPress={() =>
                    setEditData({ ...editData, isPublic: !editData.isPublic })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        !editData.isPublic && styles.radioButtonSelected,
                      ]}
                    >
                      {!editData.isPublic && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={styles.visibilityLabel}>Private</Text>
                      <Text style={styles.visibilityHint}>
                        Only invited users can see this event
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.visibilityToggle}
                  onPress={() =>
                    setEditData({ ...editData, isPublic: !editData.isPublic })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.visibilityOption}>
                    <View
                      style={[
                        styles.radioButton,
                        editData.isPublic && styles.radioButtonSelected,
                      ]}
                    >
                      {editData.isPublic && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={styles.visibilityTextContainer}>
                      <Text style={styles.visibilityLabel}>Public</Text>
                      <Text style={styles.visibilityHint}>
                        Anyone can discover and join this event
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleUpdateEvent}
              >
                <LinearGradient
                  colors={["#a855f7", "#7c3aed"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.createButtonGradient}
                >
                  <Text style={styles.createButtonText}>Update Event</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite User Modal */}
      <Modal
        visible={isInviteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsInviteModalVisible(false);
          setInviteUsername("");
          setSearchedUsers([]);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsInviteModalVisible(false);
              setInviteUsername("");
              setSearchedUsers([]);
            }}
          />
          <View style={styles.inviteModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite User</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsInviteModalVisible(false);
                  setInviteUsername("");
                  setSearchedUsers([]);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* People / Vendors tab toggle */}
            <View style={styles.inviteTabRow}>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "people" && styles.inviteTabBtnActive]}
                onPress={() => setInviteTab("people")}
                activeOpacity={0.7}
              >
                <Text style={[styles.inviteTabText, inviteTab === "people" && styles.inviteTabTextActive]}>
                  People
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteTabBtn, inviteTab === "vendors" && styles.inviteTabBtnActive]}
                onPress={() => setInviteTab("vendors")}
                activeOpacity={0.7}
              >
                <Text style={[styles.inviteTabText, inviteTab === "vendors" && styles.inviteTabTextActive]}>
                  Vendors
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Search {inviteTab === "vendors" ? "Vendor" : "User"}</Text>
                <View style={styles.searchInputContainer}>
                  <Ionicons
                    name="search"
                    size={20}
                    color="#6b7280"
                    style={styles.searchIconInModal}
                  />
                  <TextInput
                    style={styles.searchInputInModal}
                    placeholder={inviteTab === "vendors" ? "Enter vendor name..." : "Enter username or email..."}
                    placeholderTextColor="#6b7280"
                    value={inviteUsername}
                    onChangeText={setInviteUsername}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {searchingUsers && (
                <View style={styles.loadingUserContainer}>
                  <ActivityIndicator size="small" color="#a855f7" />
                </View>
              )}

              <FlatList
                data={searchedUsers.filter((u) =>
                  inviteTab === "vendors" ? u.isVendor === true : u.isVendor !== true
                )}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userSearchItem}
                    onPress={() => handleInviteUser(item)}
                  >
                    {item.profilePicture ? (
                      <Image
                        source={{ uri: item.profilePicture }}
                        style={styles.userSearchAvatar}
                      />
                    ) : (
                      <View style={styles.userSearchAvatarPlaceholder}>
                        <Ionicons name="person" size={24} color="#a855f7" />
                      </View>
                    )}
                    <View style={styles.userSearchInfo}>
                      <Text style={styles.userSearchName}>{item.username}</Text>
                      <Text style={styles.userSearchEmail}>
                        {inviteTab === "vendors" && item.businessName
                          ? item.businessName
                          : item.email}
                      </Text>
                    </View>
                    {item.isVendor && inviteTab === "vendors" && (
                      <View style={styles.vendorBadge}>
                        <Text style={styles.vendorBadgeText}>Vendor</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  !searchingUsers && inviteUsername.length >= 2 ? (
                    <View style={styles.emptyUserSearchContainer}>
                      <Ionicons name="people-outline" size={48} color="#6b7280" />
                      <Text style={styles.emptyUserSearchText}>
                        No {inviteTab === "vendors" ? "vendors" : "users"} found
                      </Text>
                    </View>
                  ) : !searchingUsers && inviteUsername.length < 2 ? (
                    <View style={styles.emptyUserSearchContainer}>
                      <Ionicons name="search-outline" size={48} color="#6b7280" />
                      <Text style={styles.emptyUserSearchText}>
                        Type at least 2 characters to search
                      </Text>
                    </View>
                  ) : null
                }
                contentContainerStyle={styles.userSearchListContent}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
    paddingHorizontal: getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: getResponsivePadding(),
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    textAlign: "center",
  },
  // ── Section headings ──
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.semiBold,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 4,
  },
  // ── Pending invite card ──
  pendingCard: {
    flexDirection: "row",
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#a855f7",
  },
  pendingImage: {
    width: 90,
    height: "100%",
    resizeMode: "cover",
  },
  pendingImagePlaceholder: {
    width: 90,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 110,
  },
  pendingContent: {
    flex: 1,
    padding: 12,
  },
  pendingTitle: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  pendingMeta: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 2,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  pendingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  acceptBtn: { backgroundColor: "#a855f7" },
  acceptBtnText: { fontSize: scaleFontSize(13), fontFamily: Fonts.semiBold, color: "#fff" },
  declineBtn: { backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "#ef4444" },
  declineBtnText: { fontSize: scaleFontSize(13), fontFamily: Fonts.semiBold, color: "#ef4444" },
  eventCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#374151",
  },
  eventImage: {
    width: "100%",
    height: 180,
    resizeMode: "cover",
  },
  placeholderImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  eventContent: {
    padding: 16,
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: scaleFontSize(20),
    fontFamily: Fonts.bold,
    color: "#fff",
    flex: 1,
  },
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  publicBadgeText: {
    fontSize: scaleFontSize(10),
    fontFamily: Fonts.bold,
    color: "#10b981",
    letterSpacing: 0.5,
  },
  eventDetail: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  eventDetailText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    flex: 1,
  },
  eventActions: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  inviteModalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "75%",
    maxHeight: 600,
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
    padding: getResponsivePadding(),
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
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  searchIconInModal: {
    marginRight: 8,
  },
  searchInputInModal: {
    flex: 1,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  loadingUserContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  userSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  userSearchAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
  },
  userSearchAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  userSearchInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userSearchName: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  userSearchEmail: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 2,
  },
  vendorBadge: {
    backgroundColor: "#a855f7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vendorBadgeText: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  inviteTabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: "#1f1f2e",
    borderRadius: 10,
    padding: 3,
  },
  inviteTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  inviteTabBtnActive: {
    backgroundColor: "#a855f7",
  },
  inviteTabText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#6b7280",
  },
  inviteTabTextActive: {
    color: "#fff",
  },
  emptyUserSearchContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyUserSearchText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
  },
  userSearchListContent: {
    flexGrow: 1,
  },
  visibilityToggle: {
    marginBottom: 8,
  },
  visibilityOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#6b7280",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: "#a855f7",
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#a855f7",
  },
  visibilityTextContainer: {
    flex: 1,
  },
  visibilityLabel: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  visibilityHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  loadMoreBtn: {
    marginTop: 12,
    marginBottom: 24,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#a855f7",
    minWidth: 140,
    alignItems: "center",
  },
  loadMoreText: {
    color: "#a855f7",
    fontFamily: Fonts.semiBold,
    fontSize: scaleFontSize(14),
  },
  allLoadedText: {
    textAlign: "center",
    color: "#6b7280",
    fontFamily: Fonts.regular,
    fontSize: scaleFontSize(12),
    marginTop: 8,
    marginBottom: 24,
  },
});
