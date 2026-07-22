import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
import { CatalogueCategory, CatalogueKind, Service } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";
import { sellingCurrencyForCountry } from "@/constants/payments";
import { uploadMultipleImages } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ServiceModalProps {
  visible: boolean;
  /** The parent catalogue category the item belongs to (required to create). */
  category: CatalogueCategory | null;
  /** The item being edited, or null when creating a new one. */
  service: Service | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DURATION_UNITS = ["hours", "days", "weeks", "months"];
const AVAILABILITY_OPTIONS = ["available", "unavailable", "coming_soon"];

const emptyForm = {
  name: "",
  description: "",
  price: "",
  currency: "USD",
  // product fields
  unit: "",
  minOrderQty: "1",
  stock: "",
  // service fields
  durationValue: "",
  durationUnit: "hours",
  leadTimeValue: "",
  leadTimeUnit: "days",
  availability: "available",
  features: "",
};

export default function ServiceModal({
  visible,
  category,
  service,
  onClose,
  onSuccess,
}: ServiceModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [formData, setFormData] = useState({ ...emptyForm });

  // The item's kind comes from the parent category (create) or the item itself
  // (edit). It decides which fields we show — product vs service.
  const kind: CatalogueKind = service?.kind || category?.kind || "service";
  const isProduct = kind === "product";
  const noun = isProduct ? "Product" : "Service";

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        description: service.description,
        price: service.price.toString(),
        currency: service.currency,
        unit: service.unit || "",
        minOrderQty: (service.minOrderQty ?? 1).toString(),
        stock: service.stock != null ? service.stock.toString() : "",
        durationValue: service.duration?.value?.toString() || "",
        durationUnit: service.duration?.unit || "hours",
        leadTimeValue: service.leadTime?.value?.toString() || "",
        leadTimeUnit: service.leadTime?.unit || "days",
        availability: service.availability,
        features: service.features.join("\n"),
      });
      setImages(service.images || []);
    } else {
      setFormData({ ...emptyForm });
      setImages([]);
      loadSellingCurrency();
    }
  }, [service, visible]);

  // The currency is server-assigned from the vendor's country (NGN for
  // Nigerian vendors, USD otherwise) — shown here read-only so the vendor
  // knows what their price means.
  const loadSellingCurrency = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await fetch(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const cur = sellingCurrencyForCountry(data.user?.location?.country);
        setFormData((prev) => ({ ...prev, currency: cur }));
      }
    } catch {}
  };

  const pickImage = async () => {
    // PHPickerViewController (iOS 14+) handles permissions itself — no pre-request needed.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newUris = result.assets.map((asset) => asset.uri);
      setImages((prev) => [...prev, ...newUris].slice(0, 5)); // Max 5 images
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!service && !category) {
      Alert.alert("Error", "Missing category for this item");
      return;
    }
    if (!formData.name.trim()) {
      Alert.alert("Error", `Please enter a ${noun.toLowerCase()} name`);
      return;
    }
    if (!formData.description.trim()) {
      Alert.alert("Error", "Please enter a description");
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      Alert.alert("Error", "Please enter a valid price");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      const featuresArray = formData.features
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      const alreadyUploaded = images.filter((img) => img.startsWith("http"));
      const localUris = images.filter((img) => !img.startsWith("http"));

      let uploadedUrls: string[] = [];
      if (localUris.length > 0) {
        const results = await uploadMultipleImages(localUris, "nightvibe/services", token!);
        uploadedUrls = results.map((r) => r.url);
      }

      const finalImages = [...alreadyUploaded, ...uploadedUrls];

      // `category` (the legacy required string) is set to the parent category's
      // name so it stays meaningful; the real link is `catalogueCategory`.
      const parentName = category?.name || service?.category || "General";

      const requestData: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: parentName,
        price: parseFloat(formData.price),
        currency: formData.currency,
        availability: formData.availability,
        features: featuresArray,
        images: finalImages,
      };

      if (isProduct) {
        requestData.unit = formData.unit.trim();
        requestData.minOrderQty = Math.max(1, parseInt(formData.minOrderQty) || 1);
        requestData.stock = formData.stock.trim() ? parseInt(formData.stock) : null;
      } else {
        if (formData.durationValue) {
          requestData.duration = {
            value: parseInt(formData.durationValue),
            unit: formData.durationUnit,
          };
        }
        if (formData.leadTimeValue) {
          requestData.leadTime = {
            value: parseInt(formData.leadTimeValue),
            unit: formData.leadTimeUnit,
          };
        }
      }

      if (service) {
        // Editing: kind & catalogueCategory are immutable server-side.
        await axios.put(`${BASE_URL}/vendor/services/${service._id}`, requestData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Creating: bind the item to its parent category. The server derives
        // `kind` and `currency`, ignoring any client-sent values.
        requestData.catalogueCategory = category!._id;
        await axios.post(`${BASE_URL}/vendor/services`, requestData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      onSuccess();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.details ||
        `Failed to save ${noun.toLowerCase()}`;
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderUnitSelector = (
    value: string,
    field: "durationUnit" | "leadTimeUnit"
  ) => (
    <View style={styles.unitSelector}>
      {DURATION_UNITS.map((unit) => (
        <TouchableOpacity
          key={unit}
          style={[styles.unitButton, value === unit && styles.unitButtonActive]}
          onPress={() => setFormData({ ...formData, [field]: unit })}
        >
          <Text style={[styles.unitText, value === unit && styles.unitTextActive]}>
            {unit}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

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
            {service ? `Edit ${noun}` : `New ${noun}`}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.form}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Parent category context */}
            {(category || service) && (
              <View style={styles.contextChip}>
                <Ionicons
                  name={isProduct ? "cube-outline" : "construct-outline"}
                  size={14}
                  color={colors.primaryLight}
                />
                <Text style={styles.contextChipText}>
                  {category?.name || service?.category} · {isProduct ? "Product" : "Service"}
                </Text>
              </View>
            )}

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>
                {noun} Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder={isProduct ? "e.g., Jollof Rice" : "e.g., Full-day coverage"}
                placeholderTextColor={colors.textMuted}
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
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder={`Describe this ${noun.toLowerCase()}...`}
                placeholderTextColor={colors.textMuted}
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
                      <Ionicons name="close-circle" size={24} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {images.length < 5 && (
                  <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                    <Ionicons name="camera-outline" size={32} color={Colors.primary} />
                    <Text style={styles.addImageText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Price (+ product unit) */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Price <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.priceRow}>
                <TextInput
                  style={[styles.input, styles.priceInput]}
                  value={formData.price}
                  onChangeText={(text) => setFormData({ ...formData, price: text })}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
                {/* Read-only: selling currency follows the vendor's country. */}
                <TextInput
                  style={[styles.input, styles.currencyInput, { opacity: 0.6 }]}
                  value={formData.currency}
                  editable={false}
                  placeholder="USD"
                  placeholderTextColor={colors.textMuted}
                  maxLength={3}
                />
              </View>
            </View>

            {isProduct ? (
              <>
                {/* Selling unit */}
                <View style={styles.field}>
                  <Text style={styles.label}>Selling unit (Optional)</Text>
                  <Text style={styles.hint}>
                    How this product is priced, e.g. "per plate", "per kg", "per bottle"
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={formData.unit}
                    onChangeText={(text) => setFormData({ ...formData, unit: text })}
                    placeholder="e.g., per plate"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                {/* Min order + stock */}
                <View style={styles.field}>
                  <Text style={styles.label}>Order limits (Optional)</Text>
                  <View style={styles.priceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hint}>Minimum quantity</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.minOrderQty}
                        onChangeText={(text) =>
                          setFormData({ ...formData, minOrderQty: text })
                        }
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hint}>In stock (blank = unlimited)</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.stock}
                        onChangeText={(text) => setFormData({ ...formData, stock: text })}
                        placeholder="—"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Duration */}
                <View style={styles.field}>
                  <Text style={styles.label}>Duration (Optional)</Text>
                  <Text style={styles.hint}>How long this service runs for</Text>
                  <TextInput
                    style={[styles.input, styles.durationInput]}
                    value={formData.durationValue}
                    onChangeText={(text) =>
                      setFormData({ ...formData, durationValue: text })
                    }
                    placeholder="1"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                  {renderUnitSelector(formData.durationUnit, "durationUnit")}
                </View>

                {/* Lead time */}
                <View style={styles.field}>
                  <Text style={styles.label}>Lead time (Optional)</Text>
                  <Text style={styles.hint}>
                    How long before you can deliver this service
                  </Text>
                  <TextInput
                    style={[styles.input, styles.durationInput]}
                    value={formData.leadTimeValue}
                    onChangeText={(text) =>
                      setFormData({ ...formData, leadTimeValue: text })
                    }
                    placeholder="2"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                  {renderUnitSelector(formData.leadTimeUnit, "leadTimeUnit")}
                </View>
              </>
            )}

            {/* Availability */}
            <View style={styles.field}>
              <Text style={styles.label}>Availability</Text>
              <View style={styles.availabilityRow}>
                {AVAILABILITY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.availabilityButton,
                      formData.availability === option && styles.availabilityButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, availability: option })}
                  >
                    <Text
                      style={[
                        styles.availabilityText,
                        formData.availability === option && styles.availabilityTextActive,
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
              <Text style={styles.label}>
                {isProduct ? "Details" : "Features"} (Optional)
              </Text>
              <Text style={styles.hint}>One per line</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.features}
                onChangeText={(text) => setFormData({ ...formData, features: text })}
                placeholder={
                  isProduct
                    ? "Serves 2-3\nSpicy option available\nComes with plantain"
                    : "Full day coverage\nEdited photos\nOnline gallery"
                }
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {service ? `Update ${noun}` : `Add ${noun}`}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.bottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
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
      color: c.text,
    },
    placeholder: {
      width: 40,
    },
    form: {
      flex: 1,
      padding: 16,
    },
    contextChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.primaryFadedStrong,
      borderWidth: 1,
      borderColor: c.primaryBorder,
      marginBottom: 20,
    },
    contextChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.primaryLight,
    },
    field: {
      marginBottom: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: "600",
      color: c.textBody,
      marginBottom: 8,
    },
    required: {
      color: c.error,
    },
    hint: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: c.card,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
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
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    unitButtonActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    unitText: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: "500",
    },
    unitTextActive: {
      color: c.text,
      fontWeight: "600",
    },
    availabilityRow: {
      gap: 8,
    },
    availabilityButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    availabilityButtonActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    availabilityText: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: "500",
      textTransform: "capitalize",
    },
    availabilityTextActive: {
      color: c.text,
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
      color: c.white,
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
      backgroundColor: c.border,
    },
    removeImageButton: {
      position: "absolute",
      top: -8,
      right: -8,
      backgroundColor: c.card,
      borderRadius: 12,
    },
    addImageButton: {
      width: 100,
      height: 100,
      borderRadius: 8,
      backgroundColor: c.card,
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
