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
import { CatalogueCategory, CatalogueKind } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";
import { uploadMultipleImages } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface CategoryModalProps {
  visible: boolean;
  category: CatalogueCategory | null;
  onClose: () => void;
  onSuccess: () => void;
}

const KIND_OPTIONS: { id: CatalogueKind; label: string; hint: string; icon: any }[] = [
  {
    id: "product",
    label: "Products",
    hint: "Discrete goods you sell by a unit — e.g. rice, chicken, drinks.",
    icon: "cube-outline",
  },
  {
    id: "service",
    label: "Service rendered",
    hint: "Work you perform over time — e.g. photography, decoration, DJ set.",
    icon: "construct-outline",
  },
];

export default function CategoryModal({
  visible,
  category,
  onClose,
  onSuccess,
}: CategoryModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CatalogueKind>("product");

  const isEditing = !!category;

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || "");
      setKind(category.kind);
      setImages(category.images || []);
    } else {
      setName("");
      setDescription("");
      setKind("product");
      setImages([]);
    }
  }, [category, visible]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setImages([result.assets[0].uri]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a category name");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      const alreadyUploaded = images.filter((img) => img.startsWith("http"));
      const localUris = images.filter((img) => !img.startsWith("http"));
      let uploadedUrls: string[] = [];
      if (localUris.length > 0) {
        const results = await uploadMultipleImages(
          localUris,
          "nightvibe/categories",
          token!
        );
        uploadedUrls = results.map((r) => r.url);
      }
      const finalImages = [...alreadyUploaded, ...uploadedUrls];

      if (isEditing) {
        // kind is immutable on the server — omit it from the update payload.
        await axios.put(
          `${BASE_URL}/vendor/categories/${category!._id}`,
          {
            name: name.trim(),
            description: description.trim(),
            images: finalImages,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${BASE_URL}/vendor/categories`,
          {
            name: name.trim(),
            description: description.trim(),
            kind,
            images: finalImages,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      onSuccess();
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message ||
          error.response?.data?.details ||
          "Failed to save category"
      );
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
            {isEditing ? "Edit Category" : "New Category"}
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
            {/* Kind picker — only on create; locked afterwards because it decides
                which fields each item in the category exposes. */}
            <View style={styles.field}>
              <Text style={styles.label}>
                What does this category hold?{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.kindRow}>
                {KIND_OPTIONS.map((opt) => {
                  const on = kind === opt.id;
                  const disabled = isEditing && kind !== opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={disabled ? 1 : 0.85}
                      onPress={() => !isEditing && setKind(opt.id)}
                      style={[
                        styles.kindCard,
                        on && styles.kindCardActive,
                        disabled && { opacity: 0.35 },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={22}
                        color={on ? Colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[styles.kindLabel, on && { color: colors.text }]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.kindHint}>{opt.hint}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isEditing && (
                <Text style={styles.hint}>
                  The type can't be changed after a category is created.
                </Text>
              )}
            </View>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Category Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Catering, Photography"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Tell clients what this category is about..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Cover image */}
            <View style={styles.field}>
              <Text style={styles.label}>Cover image (Optional)</Text>
              <View style={styles.imagesContainer}>
                {images.map((image, index) => (
                  <View key={index} style={styles.imageWrapper}>
                    <Image source={{ uri: image }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setImages([])}
                    >
                      <Ionicons name="close-circle" size={24} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {images.length === 0 && (
                  <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                    <Ionicons name="camera-outline" size={32} color={Colors.primary} />
                    <Text style={styles.addImageText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
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
                  {isEditing ? "Update Category" : "Create Category"}
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
    container: { flex: 1, backgroundColor: c.background },
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
    closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 20, fontWeight: "bold", color: c.text },
    placeholder: { width: 40 },
    form: { flex: 1, padding: 16 },
    field: { marginBottom: 24 },
    label: { fontSize: 16, fontWeight: "600", color: c.textBody, marginBottom: 8 },
    required: { color: c.error },
    hint: { fontSize: 12, color: c.textSecondary, marginTop: 8 },
    input: {
      backgroundColor: c.card,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    textArea: { minHeight: 90, textAlignVertical: "top" },
    kindRow: { flexDirection: "row", gap: 12 },
    kindCard: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.border,
      gap: 6,
    },
    kindCardActive: { borderColor: Colors.primary, backgroundColor: c.primaryFadedStrong },
    kindLabel: { fontSize: 15, fontWeight: "700", color: c.textBody },
    kindHint: { fontSize: 11, color: c.textSecondary, lineHeight: 15 },
    imagesContainer: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    imageWrapper: { position: "relative", width: 100, height: 100 },
    imagePreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: c.border },
    removeImageButton: { position: "absolute", top: -8, right: -8, backgroundColor: c.card, borderRadius: 12 },
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
    addImageText: { fontSize: 12, color: Colors.primary, marginTop: 4, fontWeight: "600" },
    submitButton: {
      backgroundColor: Colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 8,
    },
    submitButtonDisabled: { opacity: 0.7 },
    submitButtonText: { color: c.white, fontSize: 18, fontWeight: "700" },
    bottomPadding: { height: 40 },
  });
