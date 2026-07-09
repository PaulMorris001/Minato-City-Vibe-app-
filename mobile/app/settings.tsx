import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { goBack, resetToAccountRoot } from "@/utils/navigation";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { payoutOnboardingRoute } from "@/constants/payments";
import { showError, showSuccess, showInfo } from "@/utils/toast";
import { ImagePickerButton } from "@/components/shared";
import { Fonts } from "@/constants/fonts";
import { useAccount } from "@/contexts/AccountContext";
import { uploadImage } from "@/utils/imageUpload";

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { activeAccount, switchAccount } = useAccount();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profilePicture, setProfilePicture] = useState("");
  const [bio, setBio] = useState("");
  const [user, setUser] = useState({
    username: "",
    email: "",
    isVendor: false,
    emailVerifiedAt: null as string | null,
    country: "",
  });
  const [verificationStatus, setVerificationStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [licenseImage, setLicenseImage] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  // Re-fetch when the screen regains focus so returning from /verify-email
  // (or any other settings sub-flow) reflects the new state immediately.
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const [profileRes, verifRes] = await Promise.all([
        axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${BASE_URL}/verification/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: { status: "none" } })),
      ]);

      const userData = profileRes.data.user;
      setUser({
        username: userData.username || "",
        email: userData.email || "",
        isVendor: userData.isVendor || false,
        emailVerifiedAt: userData.emailVerifiedAt || null,
        country: userData.location?.country || "",
      });
      setProfilePicture(userData.profilePicture || "");
      setBio(userData.bio || "");

      const verifData = verifRes.data;
      setVerificationStatus(verifData.status || "none");
      setVerificationNotes(verifData.reviewNotes || "");
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      showError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitVerification = async () => {
    if (!licenseImage) {
      showInfo("Please select an image of your driver's license.", "Required");
      return;
    }
    setSubmittingVerification(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      let imageUrl = licenseImage;
      if (licenseImage.startsWith("file://")) {
        const { uploadImage } = await import("@/utils/imageUpload");
        const result = await uploadImage(licenseImage, "verifications", token!);
        imageUrl = result.url;
      }

      await axios.post(
        `${BASE_URL}/verification/submit`,
        { documentImage: imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setVerificationStatus("pending");
      setLicenseImage("");
      showSuccess("Your verification request has been submitted. We'll review it shortly.", "Submitted");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to submit verification");
    } finally {
      setSubmittingVerification(false);
    }
  };

  // Reset the navigation tree so the target account's root is the ONLY thing in
  // history. This both fixes the vendor→client "dead tabs" bug (a lingering
  // (vendor) layout was re-firing its redirect and clobbering the tab
  // navigator) and satisfies the requirement that the hardware back button
  // can't return to the previous account type.
  const resetToAccount = (type: "client" | "vendor") => {
    const targetGroup = type === "vendor" ? "(vendor)" : "(tabs)";
    try {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: targetGroup }],
        })
      );
    } catch (err) {
      // If the route name doesn't resolve for any reason, fall back to a
      // dismiss-all + replace, which still clears pushed screens like Settings.
      console.warn("Account reset failed, falling back to replace:", err);
      resetToAccountRoot(type);
    }
  };

  const handleSwitchAccount = () => {
    if (!user.isVendor) {
      Alert.alert(
        "No Vendor Account",
        "You don't have a vendor account yet. Register as a vendor to access vendor features."
      );
      return;
    }

    const target: "client" | "vendor" =
      activeAccount === "vendor" ? "client" : "vendor";

    Alert.alert(
      target === "vendor" ? "Switch to Vendor account?" : "Switch to Client account?",
      target === "vendor"
        ? "You'll be taken to your vendor dashboard."
        : "You'll be taken to the client app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            await switchAccount(target);
            resetToAccount(target);
          },
        },
      ]
    );
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      const payload: { profilePicture?: string; bio: string } = { bio };

      // Upload a newly-picked photo, otherwise keep the existing URL
      if (profilePicture) {
        if (profilePicture.startsWith("file://")) {
          try {
            const result = await uploadImage(profilePicture, "profiles", token!);
            payload.profilePicture = result.url;
            setProfilePicture(result.url);
          } catch (uploadError: any) {
            console.error("Upload error:", uploadError);
            showError("Failed to upload image. Please try again.");
            setSaving(false);
            return;
          }
        } else {
          payload.profilePicture = profilePicture;
        }
      }

      await axios.put(`${BASE_URL}/profile/picture`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showSuccess("Profile updated successfully");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Failed to update profile";
      showError(errorMessage);
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
        <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
        </View>
      </View>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Text style={styles.sectionDescription}>
          Add a photo and a short bio to personalize your account
        </Text>

        <ImagePickerButton
          imageUri={profilePicture}
          onImageSelected={setProfilePicture}
          label="Profile Photo"
          size={140}
          shape="circle"
          fallbackName={user.username}
        />

        <Text style={styles.fieldLabel}>Bio</Text>
        <TextInput
          style={styles.bioInput}
          placeholder="Tell people a bit about yourself..."
          placeholderTextColor="#6b7280"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
        />
        <Text style={styles.bioCount}>{bio.length}/500</Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Profile</Text>
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

        <View style={[styles.infoRow, { borderBottomWidth: 0, marginBottom: 4 }]}>
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

        <TouchableOpacity
          style={[
            styles.switchAccountButton,
            !user.isVendor && { opacity: 0.45 },
          ]}
          onPress={handleSwitchAccount}
          activeOpacity={0.8}
        >
          <View style={styles.switchAccountLeft}>
            <View style={styles.switchIconContainer}>
              <Ionicons
                name={activeAccount === "client" ? "briefcase" : "person"}
                size={22}
                color={Colors.primary}
              />
            </View>
            <View>
              <Text style={styles.switchAccountTitle}>
                {activeAccount === "client"
                  ? "Switch to Vendor"
                  : "Switch to Client"}
              </Text>
              <Text style={styles.switchAccountSubtitle}>
                {activeAccount === "client"
                  ? "Manage your business dashboard"
                  : "Browse events, guides & services"}
              </Text>
            </View>
          </View>
          <Ionicons name="swap-horizontal" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      

      {/* Payouts — for guide sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings</Text>
        <Text style={styles.sectionDescription}>
          Set up payouts to receive money from guide sales
        </Text>

        <TouchableOpacity
          style={styles.preferenceItem}
          onPress={() => router.push(payoutOnboardingRoute(user.country) as any)}
        >
          <View style={styles.preferenceLeft}>
            <Ionicons name="cash-outline" size={22} color={Colors.primary} />
            <Text style={styles.preferenceText}>Payout Setup</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Email Verification status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email Verification</Text>
        <Text style={styles.sectionDescription}>
          Verifying your email is required to sell tickets on OurCityvibe.
        </Text>
        {user.emailVerifiedAt ? (
          <View style={styles.verifStatusRow}>
            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
            <Text style={[styles.verifStatusText, { color: "#22c55e" }]}>
              Verified ({user.email})
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.verifStatusRow}>
              <Ionicons name="alert-circle" size={22} color="#f59e0b" />
              <Text style={[styles.verifStatusText, { color: "#f59e0b" }]}>
                Not verified
              </Text>
            </View>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => router.push("/verify-email" as any)}
            >
              <Ionicons name="mail-outline" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Verify Email Now</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Identity Verification — open to all users */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity Verification</Text>
        <Text style={styles.sectionDescription}>
          {user.isVendor
            ? "Submit a government-issued ID to get a verification badge on your profile. Verified vendors and hosts get priority approval for paid events."
            : "Submit a government-issued ID to get a verification badge and become a trusted host. Verified hosts get faster approval for paid events."}
        </Text>

          {verificationStatus === "approved" && (
            <View style={styles.verifStatusRow}>
              <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              <Text style={[styles.verifStatusText, { color: "#22c55e" }]}>Verified</Text>
            </View>
          )}

          {verificationStatus === "pending" && (
            <View style={styles.verifStatusRow}>
              <Ionicons name="time-outline" size={22} color="#f59e0b" />
              <Text style={[styles.verifStatusText, { color: "#f59e0b" }]}>Under Review</Text>
            </View>
          )}

          {verificationStatus === "rejected" && (
            <>
              <View style={styles.verifStatusRow}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
                <Text style={[styles.verifStatusText, { color: "#ef4444" }]}>Not Approved</Text>
              </View>
              {verificationNotes ? (
                <Text style={styles.verifNotes}>Reason: {verificationNotes}</Text>
              ) : null}
            </>
          )}

          {(verificationStatus === "none" || verificationStatus === "rejected") && (
            <>
              <ImagePickerButton
                imageUri={licenseImage}
                onImageSelected={setLicenseImage}
                label="Government-issued ID"
                size={120}
                shape="square"
              />
              <TouchableOpacity
                style={[styles.saveButton, submittingVerification && styles.saveButtonDisabled]}
                onPress={handleSubmitVerification}
                disabled={submittingVerification}
              >
                {submittingVerification ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Submit for Verification</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

      {/* Additional Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/notifications" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/privacy" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="lock-closed-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/terms" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="document-text-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/blocked-users" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="ban-outline" size={22} color="#e5e7eb" />
            <Text style={styles.preferenceText}>Blocked Users</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.preferenceItem, { borderBottomWidth: 0 }]}
          onPress={() => WebBrowser.openBrowserAsync("https://api.ourcityvibe.com/delete-account")}
        >
          <View style={styles.preferenceLeft}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
            <Text style={[styles.preferenceText, { color: "#ef4444" }]}>Delete Account</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    padding: 4,
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
  fieldLabel: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginTop: 16,
    marginBottom: 8,
  },
  bioInput: {
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#fff",
    minHeight: 90,
    textAlignVertical: "top",
  },
  bioCount: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#6b7280",
    alignSelf: "flex-end",
    marginTop: 4,
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
  verifStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  verifStatusText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
  },
  verifNotes: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginBottom: 16,
    lineHeight: 18,
  },
});
