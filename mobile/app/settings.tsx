import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { ImagePickerButton } from "@/components/shared";
import { Fonts } from "@/constants/fonts";
import { useAccount } from "@/contexts/AccountContext";
import { uploadImage } from "@/utils/imageUpload";

export default function SettingsScreen() {
  const router = useRouter();
  const { activeAccount, switchAccount } = useAccount();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profilePicture, setProfilePicture] = useState("");
  const [user, setUser] = useState({
    username: "",
    email: "",
    isVendor: false,
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = res.data.user;
      setUser({
        username: userData.username || "",
        email: userData.email || "",
        isVendor: userData.isVendor || false,
      });
      setProfilePicture(userData.profilePicture || "");
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    if (!user.isVendor) {
      Alert.alert("Info", "You don't have a vendor account yet. Register as a vendor to access vendor features.");
      return;
    }

    // Determine target account before switching
    const targetAccount = activeAccount === "client" ? "vendor" : "client";

    // Switch the account context
    switchAccount();

    // Navigate to the appropriate view based on target account
    if (targetAccount === "vendor") {
      router.replace("/(vendor)/dashboard");
    } else {
      router.replace("/(tabs)/dashboard");
    }
  };

  const handleSaveProfilePicture = async () => {
    if (!profilePicture) {
      Alert.alert("Error", "Please select a profile picture");
      return;
    }

    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      let cloudinaryUrl = profilePicture;

      // If it's a local URI (starts with file://), upload to Cloudinary first
      if (profilePicture.startsWith('file://')) {
        try {
          const result = await uploadImage(profilePicture, 'profiles', token!);
          cloudinaryUrl = result.url;
          // Update local state with Cloudinary URL
          setProfilePicture(cloudinaryUrl);
        } catch (uploadError: any) {
          console.error("Upload error:", uploadError);
          Alert.alert("Upload Error", "Failed to upload image to Cloudinary");
          setSaving(false);
          return;
        }
      }

      // Now update profile with Cloudinary URL
      await axios.put(
        `${BASE_URL}/profile/picture`,
        { profilePicture: cloudinaryUrl },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      Alert.alert("Success", "Profile picture updated successfully");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Failed to update profile picture";
      Alert.alert("Error", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
      </View>

      {/* Profile Picture Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Picture</Text>
        <Text style={styles.sectionDescription}>
          Upload a photo to personalize your account
        </Text>

        <ImagePickerButton
          imageUri={profilePicture}
          onImageSelected={setProfilePicture}
          label="Profile Photo"
          size={140}
          shape="circle"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveProfilePicture}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Profile Picture</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Account Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="person-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>{user.username}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="mail-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons
              name={activeAccount === "vendor" ? "briefcase-outline" : "person-outline"}
              size={20}
              color={Colors.primary}
            />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Active Account</Text>
            <Text style={styles.infoValue}>
              {activeAccount.charAt(0).toUpperCase() + activeAccount.slice(1)}
              {user.isVendor && <Text style={styles.infoSubvalue}> • Dual Account</Text>}
            </Text>
          </View>
        </View>
      </View>

      

      {/* Additional Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <TouchableOpacity style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="lock-closed-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Privacy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBackground,
    paddingTop: 60, 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.darkBackground,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  header: {
    padding: 24,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  section: {
    backgroundColor: "#1f1f2e",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: Fonts.semiBold,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
  },
  infoSubvalue: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  preferenceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  preferenceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  preferenceText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: "#e5e7eb",
  },
  preferenceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preferenceValue: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  switchAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(168, 85, 247, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.2)",
  },
  switchAccountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  switchIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  switchAccountTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  switchAccountSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  bottomPadding: {
    height: 100,
  },
});
