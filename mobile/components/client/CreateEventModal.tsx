import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL, CITIES } from "@/constants/constants";
import { Colors } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ImagePickerButton } from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

interface City {
  _id: string;
  name: string;
  state: string;
}

interface CreateEventModalProps {
  visible: boolean;
  onClose: () => void;
  onEventCreated?: () => void;
}

export default function CreateEventModal({
  visible,
  onClose,
  onEventCreated,
}: CreateEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    date: "",
    location: "",
    description: "",
    isPublic: false,
    isPaid: false,
    ticketPrice: "",
    maxGuests: "",
  });
  const [eventImage, setEventImage] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (visible) {
      setCities(CITIES);
      setLoadingCities(false);
    }
  }, [visible]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const onDateChange = (event: any, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "dismissed" || !date) return;
      setSelectedDate(date);
      // Show time picker after date selection on Android
      setShowTimePicker(true);
      return;
    }
    // iOS handles date and time together
    if (date) {
      setSelectedDate(date);
      setFormData((prev) => ({ ...prev, date: date.toISOString() }));
    }
  };

  const onTimeChange = (event: any, date?: Date) => {
    setShowTimePicker(false);
    if (event.type === "dismissed" || !date) return;
    // Combine selected date with new time
    const updatedDate = new Date(selectedDate);
    updatedDate.setHours(date.getHours());
    updatedDate.setMinutes(date.getMinutes());
    setSelectedDate(updatedDate);
    setFormData((prev) => ({ ...prev, date: updatedDate.toISOString() }));
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "Select date and time";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCreateEvent = async () => {
    // Validation
    if (!formData.title.trim()) {
      Alert.alert("Validation Error", "Please enter an event title");
      return;
    }
    if (!formData.date) {
      Alert.alert("Validation Error", "Please select an event date and time");
      return;
    }
    if (!formData.location) {
      Alert.alert("Validation Error", "Please select a location");
      return;
    }

    if (formData.isPublic && formData.isPaid) {
      if (!formData.ticketPrice || parseFloat(formData.ticketPrice) <= 0) {
        Alert.alert("Validation Error", "Please enter a valid ticket price");
        return;
      }
      if (!formData.maxGuests || parseInt(formData.maxGuests) <= 0) {
        Alert.alert("Validation Error", "Please enter maximum number of guests");
        return;
      }
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Error", "Authentication token not found");
        return;
      }

      let eventImageUrl = "";

      // Upload event image to Cloudinary if selected
      if (eventImage && eventImage.startsWith("file://")) {
        try {
          const result = await uploadImage(eventImage, "events", token);
          eventImageUrl = result.url;
        } catch (uploadError) {
          console.error("Error uploading event image:", uploadError);
          Alert.alert("Upload Error", "Failed to upload event image");
          setLoading(false);
          return;
        }
      } else if (eventImage) {
        eventImageUrl = eventImage;
      }

      // Create event
      const eventData = {
        title: formData.title.trim(),
        date: formData.date.trim(),
        location: formData.location,
        description: formData.description.trim(),
        image: eventImageUrl,
        isPublic: formData.isPublic,
        isPaid: formData.isPaid,
        ticketPrice: formData.isPaid ? parseFloat(formData.ticketPrice) : 0,
        maxGuests: formData.isPaid ? parseInt(formData.maxGuests) : 0,
      };

      await axios.post(`${BASE_URL}/events`, eventData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Alert.alert("Success", "Event created successfully!");

      // Reset form
      setFormData({
        title: "",
        date: "",
        location: "",
        description: "",
        isPublic: false,
        isPaid: false,
        ticketPrice: "",
        maxGuests: "",
      });
      setEventImage("");

      // Callback and close
      if (onEventCreated) onEventCreated();
      onClose();
    } catch (error: any) {
      console.error("Error creating event:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to create event";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalContainer}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.modalTitle}>Create Event</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Event Image */}
              <ImagePickerButton
                imageUri={eventImage}
                onImageSelected={setEventImage}
                label="Event Image"
                size={120}
                shape="square"
              />

              {/* Event Title */}
              <Text style={styles.label}>Event Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Birthday Party"
                placeholderTextColor="#999"
                value={formData.title}
                onChangeText={(value) => handleInputChange("title", value)}
              />

              {/* Event Date */}
              <Text style={styles.label}>Event Date & Time *</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#a855f7" />
                <Text style={styles.datePickerText}>
                  {formatDisplayDate(formData.date)}
                </Text>
              </TouchableOpacity>
              {showDatePicker && Platform.OS === "ios" && (
                <DateTimePicker
                  value={selectedDate}
                  mode="datetime"
                  display="spinner"
                  onChange={onDateChange}
                  minimumDate={new Date()}
                  themeVariant="dark"
                />
              )}
              {showDatePicker && Platform.OS === "android" && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  onChange={onDateChange}
                  minimumDate={new Date()}
                />
              )}
              {showTimePicker && Platform.OS === "android" && (
                <DateTimePicker
                  value={selectedDate}
                  mode="time"
                  onChange={onTimeChange}
                  is24Hour={false}
                />
              )}

              {/* Location/City */}
              <Text style={styles.label}>Location *</Text>
              {loadingCities ? (
                <View style={styles.loadingPicker}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loadingText}>Loading cities...</Text>
                </View>
              ) : (
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.location}
                    onValueChange={(value) => handleInputChange("location", value)}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select a city" value="" />
                    {cities.map((city) => (
                      <Picker.Item
                        key={city._id}
                        label={`${city.name}, ${city.state}`}
                        value={city.name}
                      />
                    ))}
                  </Picker>
                </View>
              )}

              {/* Description */}
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Event details..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                value={formData.description}
                onChangeText={(value) => handleInputChange("description", value)}
              />

              {/* Public Event Toggle */}
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => handleInputChange("isPublic", !formData.isPublic)}
              >
                <View
                  style={[
                    styles.checkbox,
                    formData.isPublic && styles.checkboxChecked,
                  ]}
                >
                  {formData.isPublic && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <View style={styles.checkboxTextContainer}>
                  <Text style={styles.checkboxLabel}>Make this event public</Text>
                  <Text style={styles.checkboxHint}>
                    Public events can be discovered by others. You can also charge for tickets!
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Paid Event Toggle (only if public) */}
              {formData.isPublic && (
                <>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() =>
                      handleInputChange("isPaid", !formData.isPaid)
                    }
                  >
                    <View
                      style={[
                        styles.checkbox,
                        formData.isPaid && styles.checkboxChecked,
                      ]}
                    >
                      {formData.isPaid && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      Charge for tickets
                    </Text>
                  </TouchableOpacity>

                  {/* Ticket Price and Max Guests (only if paid) */}
                  {formData.isPaid && (
                    <>
                      <Text style={styles.label}>Ticket Price ($) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 25.00"
                        placeholderTextColor="#999"
                        keyboardType="decimal-pad"
                        value={formData.ticketPrice}
                        onChangeText={(value) =>
                          handleInputChange("ticketPrice", value)
                        }
                      />

                      <Text style={styles.label}>Maximum Guests *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 100"
                        placeholderTextColor="#999"
                        keyboardType="number-pad"
                        value={formData.maxGuests}
                        onChangeText={(value) =>
                          handleInputChange("maxGuests", value)
                        }
                      />
                    </>
                  )}
                </>
              )}

              {/* Create Button */}
              <TouchableOpacity
                style={[styles.createButton, loading && styles.createButtonDisabled]}
                onPress={handleCreateEvent}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createButtonText}>Create Event</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxHeight: "90%",
    backgroundColor: Colors.darkBackground,
    borderRadius: 16,
    padding: getResponsivePadding(),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: scaleFontSize(24),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(18),
    fontFamily: Fonts.bold,
  },
  label: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
    backgroundColor: "#1f1f2e",
    marginBottom: 8,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#1f1f2e",
    marginBottom: 8,
  },
  datePickerText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  multilineInput: {
    height: 100,
    textAlignVertical: "top",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    marginBottom: 8,
    overflow: "hidden",
  },
  picker: {
    color: "#fff",
    backgroundColor: "#1f1f2e",
  },
  loadingPicker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    marginBottom: 8,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#374151",
    backgroundColor: "#1f1f2e",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
  checkboxLabel: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.medium,
    color: "#e5e7eb",
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxHint: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 4,
  },
  createButton: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: "#fff",
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
  },
});
