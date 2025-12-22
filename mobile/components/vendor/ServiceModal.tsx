import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { Service } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";

interface ServiceModalProps {
  visible: boolean;
  service: Service | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DURATION_UNITS = ["hours", "days", "weeks", "months"];
const AVAILABILITY_OPTIONS = ["available", "unavailable", "coming_soon"];

export default function ServiceModal({
  visible,
  service,
  onClose,
  onSuccess,
}: ServiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    currency: "USD",
    durationValue: "",
    durationUnit: "hours",
    availability: "available",
    features: "",
  });

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        description: service.description,
        category: service.category,
        price: service.price.toString(),
        currency: service.currency,
        durationValue: service.duration?.value.toString() || "",
        durationUnit: service.duration?.unit || "hours",
        availability: service.availability,
        features: service.features.join("\n"),
      });
      setImages(service.images || []);
    } else {
      resetForm();
    }
  }, [service, visible]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      price: "",
      currency: "USD",
      durationValue: "",
      durationUnit: "hours",
      availability: "available",
      features: "",
    });
    setImages([]);
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Please allow access to your photo library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map(asset =>
        `data:image/jpeg;base64,${asset.base64}`
      );
      setImages([...images, ...newImages].slice(0, 5)); // Max 5 images
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a service name");
      return;
    }
    if (!formData.description.trim()) {
      Alert.alert("Error", "Please enter a description");
      return;
    }
    if (!formData.category.trim()) {
      Alert.alert("Error", "Please enter a category");
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      Alert.alert("Error", "Please enter a valid price");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      // Parse features
      const featuresArray = formData.features
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      // Build request data
      const requestData: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category.trim(),
        price: parseFloat(formData.price),
        currency: formData.currency,
        availability: formData.availability,
        features: featuresArray,
        images: images,
      };

      // Add duration if provided
      if (formData.durationValue) {
        requestData.duration = {
          value: parseInt(formData.durationValue),
          unit: formData.durationUnit,
        };
      }

      if (service) {
        // Update existing service
        await axios.put(
          `${BASE_URL}/vendor/services/${service._id}`,
          requestData,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        Alert.alert("Success", "Service updated successfully");
      } else {
        // Create new service
        await axios.post(`${BASE_URL}/vendor/services`, requestData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert("Success", "Service created successfully");
      }

      onSuccess();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.details ||
        "Failed to save service";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {service ? "Edit Service" : "Create Service"}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          {/* Service Name */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Service Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) =>
                setFormData({ ...formData, name: text })
              }
              placeholder="e.g., Wedding Photography"
              placeholderTextColor="#6b7280"
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Category <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={formData.category}
              onChangeText={(text) =>
                setFormData({ ...formData, category: text })
              }
              placeholder="e.g., Photography, Catering, Music"
              placeholderTextColor="#6b7280"
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Description <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(text) =>
                setFormData({ ...formData, description: text })
              }
              placeholder="Describe your service in detail..."
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Images */}
          <View style={styles.field}>
            <Text style={styles.label}>Images (Optional)</Text>
            <Text style={styles.hint}>Add up to 5 images</Text>

            <View style={styles.imagesContainer}>
              {images.map((image, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: image }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              {images.length < 5 && (
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={pickImage}
                >
                  <Ionicons name="camera-outline" size={32} color={Colors.primary} />
                  <Text style={styles.addImageText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Price */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Price <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.priceRow}>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={formData.price}
                onChangeText={(text) =>
                  setFormData({ ...formData, price: text })
                }
                placeholder="0.00"
                placeholderTextColor="#6b7280"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.currencyInput]}
                value={formData.currency}
                onChangeText={(text) =>
                  setFormData({ ...formData, currency: text.toUpperCase() })
                }
                placeholder="USD"
                placeholderTextColor="#6b7280"
                maxLength={3}
              />
            </View>
          </View>

          {/* Duration */}
          <View style={styles.field}>
            <Text style={styles.label}>Duration (Optional)</Text>
            <View style={styles.durationRow}>
              <TextInput
                style={[styles.input, styles.durationInput]}
                value={formData.durationValue}
                onChangeText={(text) =>
                  setFormData({ ...formData, durationValue: text })
                }
                placeholder="1"
                placeholderTextColor="#6b7280"
                keyboardType="number-pad"
              />
              <View style={styles.unitSelector}>
                {DURATION_UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitButton,
                      formData.durationUnit === unit &&
                        styles.unitButtonActive,
                    ]}
                    onPress={() =>
                      setFormData({ ...formData, durationUnit: unit })
                    }
                  >
                    <Text
                      style={[
                        styles.unitText,
                        formData.durationUnit === unit &&
                          styles.unitTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Availability */}
          <View style={styles.field}>
            <Text style={styles.label}>Availability</Text>
            <View style={styles.availabilityRow}>
              {AVAILABILITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.availabilityButton,
                    formData.availability === option &&
                      styles.availabilityButtonActive,
                  ]}
                  onPress={() =>
                    setFormData({ ...formData, availability: option })
                  }
                >
                  <Text
                    style={[
                      styles.availabilityText,
                      formData.availability === option &&
                        styles.availabilityTextActive,
                    ]}
                  >
                    {option.replace("_", " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Features */}
          <View style={styles.field}>
            <Text style={styles.label}>Features (Optional)</Text>
            <Text style={styles.hint}>One feature per line</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.features}
              onChangeText={(text) =>
                setFormData({ ...formData, features: text })
              }
              placeholder="Full day coverage&#10;Edited photos&#10;Online gallery"
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={5}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {service ? "Update Service" : "Create Service"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBackground,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#1f1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  placeholder: {
    width: 40,
  },
  form: {
    flex: 1,
    padding: 16,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#374151",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  priceRow: {
    flexDirection: "row",
    gap: 12,
  },
  priceInput: {
    flex: 1,
  },
  currencyInput: {
    width: 80,
    textAlign: "center",
  },
  durationRow: {
    gap: 12,
  },
  durationInput: {
    marginBottom: 12,
  },
  unitSelector: {
    flexDirection: "row",
    gap: 8,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  unitButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unitText: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "500",
  },
  unitTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  availabilityRow: {
    gap: 8,
  },
  availabilityButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  availabilityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  availabilityText: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "500",
    textTransform: "capitalize",
  },
  availabilityTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  bottomPadding: {
    height: 40,
  },
  imagesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imageWrapper: {
    position: "relative",
    width: 100,
    height: 100,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#374151",
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#1f1f2e",
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  addImageText: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 4,
    fontWeight: "600",
  },
});
