import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { GUIDE_TOPICS, GuideSection, LocationSelection } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { Colors } from "@/constants/colors";
import { LocationPicker, ImagePickerButton } from "@/components/shared";
import { resolveImageUrls } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function CreateGuidePage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [topic, setTopic] = useState("");
  const [sections, setSections] = useState<GuideSection[]>([
    { title: "", rank: 1, description: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);

  const addSection = () => {
    if (sections.length >= 10) {
      Alert.alert("Limit Reached", "You can add up to 10 sections maximum");
      return;
    }
    setSections([
      ...sections,
      { title: "", rank: sections.length + 1, description: "" },
    ]);
  };

  const removeSection = (index: number) => {
    if (sections.length === 1) {
      Alert.alert("Minimum Sections", "A guide must have at least 1 section");
      return;
    }
    const newSections = sections.filter((_, i) => i !== index);
    // Update ranks
    newSections.forEach((section, idx) => {
      section.rank = idx + 1;
    });
    setSections(newSections);
  };

  const updateSection = (
    index: number,
    field: keyof GuideSection,
    value: string | number
  ) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };
    setSections(newSections);
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert("Validation Error", "Please enter a title");
      return false;
    }
    if (!description.trim()) {
      Alert.alert("Validation Error", "Please enter a description");
      return false;
    }
    if (!price || isNaN(parseFloat(price))) {
      Alert.alert("Validation Error", "Please enter a valid price");
      return false;
    }
    if (!location?.city || !location?.state) {
      Alert.alert("Validation Error", "Please select your country, state, and city");
      return false;
    }
    if (!topic) {
      Alert.alert("Validation Error", "Please select a topic");
      return false;
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section.title.trim()) {
        Alert.alert("Validation Error", `Section ${i + 1}: Please enter a title`);
        return false;
      }
      if (!section.description.trim()) {
        Alert.alert(
          "Validation Error",
          `Section ${i + 1}: Please enter a description`
        );
        return false;
      }
      if (section.description.length > 3000) {
        Alert.alert(
          "Validation Error",
          `Section ${i + 1}: Description cannot exceed 3000 characters`
        );
        return false;
      }
    }

    return true;
  };

  const handleSave = async (isDraft: boolean) => {
    if (!validateForm() || !location) return;

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }

      // Upload any newly-picked images (cover + per-section)
      let coverUrl = "";
      let sectionsPayload = sections;
      try {
        if (coverImage) {
          [coverUrl] = await resolveImageUrls([coverImage], "guides", token);
        }
        sectionsPayload = await Promise.all(
          sections.map(async (s) => {
            if (!s.image) return s;
            const [url] = await resolveImageUrls([s.image], "guides", token);
            return { ...s, image: url };
          })
        );
      } catch {
        Alert.alert("Upload Error", "Failed to upload one or more images");
        setLoading(false);
        return;
      }

      const response = await fetch(`${BASE_URL}/guides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          price: parseFloat(price),
          city: location.city,
          cityState: location.state,
          country: location.country,
          coverImage: coverUrl,
          topic,
          sections: sectionsPayload,
          isDraft,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "Success",
          isDraft ? "Guide draft saved successfully" : "Guide published successfully",
          [
            {
              text: "OK",
              onPress: () => goBack(),
            },
          ]
        );
      } else {
        Alert.alert("Error", data.message || "Failed to save guide");
      }
    } catch (error) {
      console.error("Save guide error:", error);
      Alert.alert("Error", "Failed to save guide");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Create Guide</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder='e.g., "Top 10 Pizza spots in New York City"'
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your guide..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Price (USD) <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Enter 0 for a free guide</Text>
        </View>

        <View style={styles.inputGroup}>
          <LocationPicker
            value={location ?? undefined}
            onChange={setLocation}
            label="City"
            required
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Topic <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => { setShowTopicDropdown(!showTopicDropdown); }}
          >
            <Text style={[styles.dropdownText, !topic && styles.dropdownPlaceholder]}>
              {topic || "Select a topic..."}
            </Text>
            <Ionicons name={showTopicDropdown ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {showTopicDropdown && (
            <View style={styles.dropdown}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {GUIDE_TOPICS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.dropdownItem, topic === t && styles.dropdownItemSelected]}
                    onPress={() => { setTopic(t); setShowTopicDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, topic === t && styles.dropdownItemTextSelected]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Cover photo (optional)</Text>
          <ImagePickerButton
            imageUri={coverImage}
            onImageSelected={setCoverImage}
            label=""
            showLabel={false}
            size={140}
            shape="square"
          />
        </View>

        <View style={styles.sectionsContainer}>
          <View style={styles.sectionsHeader}>
            <Text style={styles.sectionsTitle}>
              Sections ({sections.length}/10)
            </Text>
            <TouchableOpacity
              style={styles.addSectionButton}
              onPress={addSection}
              disabled={sections.length >= 10}
            >
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
              <Text style={styles.addSectionText}>Add Section</Text>
            </TouchableOpacity>
          </View>

          {sections.map((section, index) => (
            <View key={index} style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionNumber}>Section {index + 1}</Text>
                {sections.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeSection(index)}
                    style={styles.removeSectionButton}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.sectionInputGroup}>
                <Text style={styles.label}>Title & Rank</Text>
                <View style={styles.rankRow}>
                  <TextInput
                    style={[styles.input, styles.rankInput]}
                    placeholder="Rank"
                    placeholderTextColor={colors.textMuted}
                    value={section.rank.toString()}
                    onChangeText={(text) =>
                      updateSection(index, "rank", parseInt(text) || 1)
                    }
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.titleInput]}
                    placeholder="e.g., Hilton Double Tree Hotel"
                    placeholderTextColor={colors.textMuted}
                    value={section.title}
                    onChangeText={(text) => updateSection(index, "title", text)}
                  />
                </View>
              </View>

              <View style={styles.sectionInputGroup}>
                <Text style={styles.label}>
                  Description ({section.description.length}/3000)
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe this item..."
                  placeholderTextColor={colors.textMuted}
                  value={section.description}
                  onChangeText={(text) =>
                    updateSection(index, "description", text)
                  }
                  multiline
                  numberOfLines={6}
                  maxLength={3000}
                />
              </View>

              <View style={styles.sectionInputGroup}>
                <Text style={styles.label}>Photo (optional)</Text>
                <ImagePickerButton
                  imageUri={section.image}
                  onImageSelected={(uri) => updateSection(index, "image", uri)}
                  label=""
                  showLabel={false}
                  size={120}
                  shape="square"
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.draftButton]}
          onPress={() => handleSave(true)}
          disabled={loading}
        >
          <Ionicons name="save-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.publishButton]}
          onPress={() => handleSave(false)}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.buttonText}>Publish</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
    marginBottom: 8,
  },
  required: {
    color: c.error,
  },
  input: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  dropdownButton: {
    backgroundColor: c.card,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.text,
  },
  dropdownPlaceholder: {
    color: c.textMuted,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: c.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dropdownItemSelected: {
    backgroundColor: c.primaryFaded,
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textBody,
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
    fontFamily: Fonts.semiBold,
  },
  sectionsContainer: {
    marginTop: 20,
  },
  sectionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionsTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  addSectionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addSectionText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.primary,
  },
  sectionCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionNumber: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  removeSectionButton: {
    padding: 4,
  },
  sectionInputGroup: {
    marginBottom: 12,
  },
  rankRow: {
    flexDirection: "row",
    gap: 12,
  },
  rankInput: {
    width: 80,
  },
  titleInput: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  draftButton: {
    backgroundColor: c.border,
  },
  publishButton: {
    backgroundColor: Colors.primary,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.white,
  },
});
