import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { fetchCities, fetchAllVendorTypes } from "@/libs/api";
import { BASE_URL } from "@/constants/constants";
import { City, VendorType } from "@/libs/interfaces";
import { ImagePickerButton } from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";

interface AccountTabProps {
  onRefresh: () => void;
}

export default function AccountTab({ onRefresh }: AccountTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([]);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [businessPicture, setBusinessPicture] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profile, setProfile] = useState({
    username: "",
    email: "",
    businessName: "",
    businessDescription: "",
    vendorType: "",
    vendorTypeName: "",
    city: "",
    cityName: "",
    address: "",
    phone: "",
    website: "",
    verified: false,
  });

  useEffect(() => {
    fetchProfile();
    loadCitiesAndTypes();
  }, []);

  const loadCitiesAndTypes = async () => {
    try {
      const citiesData = await fetchCities();
      setCities(citiesData);
      const typesData = await fetchAllVendorTypes();
      setVendorTypes(typesData);
    } catch (error) {
      console.error("Error loading cities/types:", error);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = res.data.user;
      setProfile({
        username: user.username || "",
        email: user.email || "",
        businessName: user.businessName || "",
        businessDescription: user.businessDescription || "",
        vendorType: user.vendorType || "",
        vendorTypeName: user.vendorTypeName || user.vendorType || "",
        city: user.location?.city || "",
        cityName: user.location?.cityName || user.location?.city || "",
        address: user.location?.address || "",
        phone: user.contactInfo?.phone || "",
        website: user.contactInfo?.website || "",
        verified: user.verified || false,
      });
      setBusinessPicture(user.businessPicture || "");
      setProfilePicture(user.profilePicture || "");
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      let businessPictureUrl = businessPicture;
      let profilePictureUrl = profilePicture;

      // Upload business picture to Cloudinary if it's a local file
      if (businessPicture && businessPicture.startsWith('file://')) {
        try {
          const result = await uploadImage(businessPicture, 'businesses', token!);
          businessPictureUrl = result.url;
          setBusinessPicture(businessPictureUrl);
        } catch (uploadError) {
          console.error("Business picture upload error:", uploadError);
          Alert.alert("Upload Error", "Failed to upload business picture");
          setSaving(false);
          return;
        }
      }

      // Upload profile picture to Cloudinary if it's a local file
      if (profilePicture && profilePicture.startsWith('file://')) {
        try {
          const result = await uploadImage(profilePicture, 'profiles', token!);
          profilePictureUrl = result.url;
          setProfilePicture(profilePictureUrl);
        } catch (uploadError) {
          console.error("Profile picture upload error:", uploadError);
          Alert.alert("Upload Error", "Failed to upload profile picture");
          setSaving(false);
          return;
        }
      }

      // Now update profile with Cloudinary URLs
      await axios.put(
        `${BASE_URL}/vendor/profile`,
        {
          businessName: profile.businessName,
          businessDescription: profile.businessDescription,
          businessPicture: businessPictureUrl,
          profilePicture: profilePictureUrl,
          vendorType: profile.vendorTypeName,
          location: {
            city: profile.cityName,
            address: profile.address,
          },
          contactInfo: {
            phone: profile.phone,
            website: profile.website,
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      Alert.alert("Success", "Profile updated successfully");
      setIsEditing(false);
      onRefresh();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Failed to update profile";
      Alert.alert("Error", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const selectCity = (city: City) => {
    setProfile({
      ...profile,
      city: city._id,
      cityName: city.name,
    });
    setShowCityPicker(false);
  };

  const selectVendorType = (type: VendorType) => {
    setProfile({
      ...profile,
      vendorType: type._id,
      vendorTypeName: type.name,
    });
    setShowTypePicker(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons
            name={isEditing ? "close" : "create-outline"}
            size={24}
            color={Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Verification Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <Ionicons
              name={profile.verified ? "checkmark-circle" : "alert-circle"}
              size={24}
              color={profile.verified ? "#22c55e" : "#f59e0b"}
            />
            <Text style={styles.statusLabel}>Verification Status</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              profile.verified ? styles.verified : styles.unverified,
            ]}
          >
            <Text style={styles.statusText}>
              {profile.verified ? "Verified" : "Pending"}
            </Text>
          </View>
        </View>
      </View>

      {/* Account Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.disabledField}>
            <Text style={styles.disabledText}>{profile.username}</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.disabledField}>
            <Text style={styles.disabledText}>{profile.email}</Text>
          </View>
        </View>
      </View>

      {/* Profile and Business Images */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile & Business Images</Text>

        <View style={styles.imageRow}>
          <View style={styles.imageColumn}>
            <ImagePickerButton
              imageUri={profilePicture}
              onImageSelected={setProfilePicture}
              label="Profile Picture"
              size={120}
              shape="circle"
              showLabel={true}
              disabled={!isEditing}
            />
          </View>
          <View style={styles.imageColumn}>
            <ImagePickerButton
              imageUri={businessPicture}
              onImageSelected={setBusinessPicture}
              label="Business Cover"
              size={120}
              shape="square"
              showLabel={true}
              disabled={!isEditing}
            />
          </View>
        </View>
      </View>

      {/* Business Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business Information</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Business Name</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={profile.businessName}
              onChangeText={(text) =>
                setProfile({ ...profile, businessName: text })
              }
              placeholder="Enter business name"
              placeholderTextColor="#666"
            />
          ) : (
            <Text style={styles.value}>
              {profile.businessName || "Not set"}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Vendor Type</Text>
          {isEditing ? (
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowTypePicker(true)}
            >
              <Text
                style={[
                  styles.pickerText,
                  !profile.vendorTypeName && styles.pickerPlaceholder,
                ]}
              >
                {profile.vendorTypeName || "Select vendor type"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#9ca3af" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.value}>
              {profile.vendorTypeName || "Not set"}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          {isEditing ? (
            <TextInput
              style={[styles.input, styles.textArea]}
              value={profile.businessDescription}
              onChangeText={(text) =>
                setProfile({ ...profile, businessDescription: text })
              }
              placeholder="Describe your business"
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
            />
          ) : (
            <Text style={styles.value}>
              {profile.businessDescription || "Not set"}
            </Text>
          )}
        </View>
      </View>

      {/* Location */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>

        <View style={styles.field}>
          <Text style={styles.label}>City</Text>
          {isEditing ? (
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowCityPicker(true)}
            >
              <Text
                style={[
                  styles.pickerText,
                  !profile.cityName && styles.pickerPlaceholder,
                ]}
              >
                {profile.cityName || "Select city"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#9ca3af" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.value}>{profile.cityName || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Address</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={profile.address}
              onChangeText={(text) => setProfile({ ...profile, address: text })}
              placeholder="Enter full address"
              placeholderTextColor="#666"
            />
          ) : (
            <Text style={styles.value}>{profile.address || "Not set"}</Text>
          )}
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={profile.phone}
              onChangeText={(text) => setProfile({ ...profile, phone: text })}
              placeholder="Enter phone number"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
            />
          ) : (
            <Text style={styles.value}>{profile.phone || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Website</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={profile.website}
              onChangeText={(text) => setProfile({ ...profile, website: text })}
              placeholder="Enter website URL"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="url"
            />
          ) : (
            <Text style={styles.value}>{profile.website || "Not set"}</Text>
          )}
        </View>
      </View>

      {isEditing && (
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      )}

      {/* City Picker Modal */}
      <Modal
        visible={showCityPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCityPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cities}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    profile.city === item._id && styles.modalItemSelected,
                  ]}
                  onPress={() => selectCity(item)}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      profile.city === item._id && styles.modalItemTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.modalItemSubtext}>{item.state}</Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* Vendor Type Picker Modal */}
      <Modal
        visible={showTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Vendor Type</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={vendorTypes}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    profile.vendorType === item._id && styles.modalItemSelected,
                  ]}
                  onPress={() => selectVendorType(item)}
                >
                  <View style={styles.typeItemRow}>
                    <Ionicons
                      name={item.icon as any}
                      size={24}
                      color={
                        profile.vendorType === item._id
                          ? Colors.primary
                          : "#9ca3af"
                      }
                      style={styles.typeIcon}
                    />
                    <Text
                      style={[
                        styles.modalItemText,
                        profile.vendorType === item._id &&
                          styles.modalItemTextSelected,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  editButton: {
    padding: 8,
  },
  statusCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: "#e5e7eb",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  verified: {
    backgroundColor: "#22c55e",
  },
  unverified: {
    backgroundColor: "#f59e0b",
  },
  statusText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  section: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.primary,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    color: "#e5e7eb",
  },
  disabledField: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    opacity: 0.7,
  },
  disabledText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  picker: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#4b5563",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    fontSize: 16,
    color: "#fff",
  },
  pickerPlaceholder: {
    color: "#666",
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 30,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalItemSelected: {
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  modalItemText: {
    fontSize: 16,
    color: "#e5e7eb",
  },
  modalItemTextSelected: {
    color: Colors.primary,
    fontWeight: "600",
  },
  modalItemSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  typeItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  imageRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 16,
  },
  imageColumn: {
    flex: 1,
    alignItems: "center",
  },
  bottomPadding: {
    height: 40,
  },
});
