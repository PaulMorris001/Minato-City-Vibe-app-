import React, { useState, useEffect } from "react";
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
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { GUIDE_TOPICS, GuideSection, City, Guide } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { Picker } from "@react-native-picker/picker";
import { CITIES } from "@/constants/constants";

export default function CreateGuidePage() {
  const [guide, setGuide] = useState<Guide>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [topic, setTopic] = useState("");
  const [sections, setSections] = useState<GuideSection[]>([
    { title: "", rank: 1, description: "" },
  ]);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    fetchGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchGuide = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");

      const response = await fetch(`${BASE_URL}/guides/${id}`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      const data = await response.json();

      if (response.ok) {
        setGuide(data.guide);
      } else {
        Alert.alert("Error", data.message || "Failed to load guide");
        router.back();
      }
    } catch (error) {
      console.error("Failed to fetch guide:", error);
      Alert.alert("Error", "Failed to load guide");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (guide) {
      setTitle(guide.title);
      setDescription(guide.description);
      setPrice(guide.price.toString());
      // Find the city ID from the city name
      const matchedCity = CITIES.find((c) => c.name === guide.city);
      setCity(matchedCity?._id || "");
      setTopic(guide.topic);
      setSections(guide.sections);
    }
  }, [guide]);

  const addSection = () => {
    if (sections.length < 10) {
      setSections([
        ...sections,
        { title: "", rank: sections.length + 1, description: "" },
      ]);
    }
  };

  const removeSection = (index: number) => {
    const updatedSections = sections.filter((_, i) => i !== index);
    // Update ranks to maintain sequential order
    const rerankedSections = updatedSections.map((section, i) => ({
      ...section,
      rank: i + 1,
    }));
    setSections(rerankedSections);
  };

  const updateSection = (
    index: number,
    field: keyof GuideSection,
    value: string | number
  ) => {
    const updatedSections = [...sections];
    updatedSections[index] = {
      ...updatedSections[index],
      [field]: value,
    };
    setSections(updatedSections);
  };

  const validateForm = () => {
    if (!title?.trim()) {
      Alert.alert("Validation Error", "Please enter a title");
      return false;
    }
    if (!description?.trim()) {
      Alert.alert("Validation Error", "Please enter a description");
      return false;
    }
    if (!price || isNaN(parseFloat(price))) {
      Alert.alert("Validation Error", "Please enter a valid price");
      return false;
    }
    if (!city) {
      Alert.alert("Validation Error", "Please select a city");
      return false;
    }
    if (!topic) {
      Alert.alert("Validation Error", "Please select a topic");
      return false;
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section.title.trim()) {
        Alert.alert(
          "Validation Error",
          `Section ${i + 1}: Please enter a title`
        );
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
    if (!validateForm()) return;

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        router.replace("/login");
        return;
      }

      // Find the selected city to get name and state
      const selectedCity = CITIES.find((c) => c._id === city);
      if (!selectedCity) {
        Alert.alert("Error", "Please select a valid city");
        setLoading(false);
        return;
      }

      const response = await fetch(`${BASE_URL}/guides/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          price: parseFloat(price),
          city: selectedCity.name,
          cityState: selectedCity.state,
          topic,
          sections,
          isDraft,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "Success",
          isDraft
            ? "Guide draft saved successfully"
            : "Guide published successfully",
          [
            {
              text: "OK",
              onPress: () => router.back(),
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

  if (loading && !guide) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Guide</Text>
        </View>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#a855f7" />
          <Text style={styles.loadingText}>Loading guide...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Guide</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder='e.g., "Top 10 Pizza spots in New York City"'
            placeholderTextColor="#6b7280"
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
            placeholderTextColor="#6b7280"
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
            placeholderTextColor="#6b7280"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Enter 0 for a free guide</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            City <Text style={styles.required}>*</Text>
          </Text>

          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={city}
              onValueChange={setCity}
              style={styles.picker}
              dropdownIconColor="#fff"
            >
              <Picker.Item label="Select a city..." value="" />
              {CITIES.map((c) => (
                <Picker.Item
                  key={c._id}
                  label={`${c.name}, ${c.state}`}
                  value={c._id}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Topic <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={topic}
              onValueChange={setTopic}
              style={styles.picker}
              dropdownIconColor="#fff"
            >
              <Picker.Item label="Select a topic..." value="" />
              {GUIDE_TOPICS.map((t) => (
                <Picker.Item key={t} label={t} value={t} />
              ))}
            </Picker>
          </View>
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
              <Ionicons name="add-circle" size={20} color="#a855f7" />
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
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.sectionInputGroup}>
                <Text style={styles.label}>Title & Rank</Text>
                <View style={styles.rankRow}>
                  <TextInput
                    style={[styles.input, styles.rankInput]}
                    placeholder="Rank"
                    placeholderTextColor="#6b7280"
                    value={section.rank.toString()}
                    onChangeText={(text) =>
                      updateSection(index, "rank", parseInt(text) || 1)
                    }
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.titleInput]}
                    placeholder="e.g., Hilton Double Tree Hotel"
                    placeholderTextColor="#6b7280"
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
                  placeholderTextColor="#6b7280"
                  value={section.description}
                  onChangeText={(text) =>
                    updateSection(index, "description", text)
                  }
                  multiline
                  numberOfLines={6}
                  maxLength={3000}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
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
    color: "#e5e7eb",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#374151",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    marginTop: 4,
  },
  pickerContainer: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    overflow: "hidden",
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
    color: "#9ca3af",
  },
  picker: {
    color: "#fff",
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
    color: "#fff",
  },
  addSectionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addSectionText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#a855f7",
  },
  sectionCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
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
    color: "#a855f7",
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
    borderTopColor: "#374151",
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
    backgroundColor: "#374151",
  },
  publishButton: {
    backgroundColor: "#a855f7",
  },
  buttonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
});
