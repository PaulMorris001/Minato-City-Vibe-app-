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
import { ImagePickerButton, LocationPicker } from "@/components/shared";
import type { LocationSelection } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { useAccount } from "@/contexts/AccountContext";
import { uploadImage } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
const THEME_OPTIONS = [
  { value: "system", label: "System", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
] as const;

// Same format rule as the signup wizard — new usernames stay clean even though
// the server (matching /register) only enforces 2–30 chars.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const { activeAccount, switchAccount } = useAccount();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profilePicture, setProfilePicture] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState<Partial<LocationSelection> | null>(null);
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

  // Inline username editing (client account only).
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [savingUsername, setSavingUsername] = useState(false);

  // Debounced live availability check while the username editor is open —
  // same flow as the signup wizard. A network hiccup stays non-blocking; the
  // final PUT is authoritative and surfaces a clear 409.
  useEffect(() => {
    if (!editingUsername) return;
    const raw = usernameDraft.trim().replace(/^@+/, "");
    // Unchanged (ignoring case) means "no rename" — nothing to check.
    if (!raw || raw.toLowerCase() === user.username.toLowerCase()) {
      setUsernameStatus("idle");
      return;
    }
    if (!USERNAME_RE.test(raw)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${BASE_URL}/auth/check-availability`, {
          params: { username: raw },
        });
        const info = res.data?.username;
        if (!cancelled) {
          setUsernameStatus(info ? (info.available ? "available" : "taken") : "idle");
        }
      } catch {
        if (!cancelled) setUsernameStatus("idle");
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [usernameDraft, editingUsername, user.username]);

  const openUsernameEditor = () => {
    setUsernameDraft(user.username);
    setUsernameStatus("idle");
    setEditingUsername(true);
  };

  const handleSaveUsername = async () => {
    const next = usernameDraft.trim().replace(/^@+/, "");
    if (next === user.username) {
      setEditingUsername(false);
      return;
    }
    if (!USERNAME_RE.test(next)) {
      showError("3–20 characters — letters, numbers and underscores only.");
      return;
    }
    setSavingUsername(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      await axios.put(
        `${BASE_URL}/profile/picture`,
        { username: next },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser((prev) => ({ ...prev, username: next }));
      // Keep the cached user JSON (home greeting etc.) in sync.
      try {
        const cached = await SecureStore.getItemAsync("user");
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.username = next;
          await SecureStore.setItemAsync("user", JSON.stringify(parsed));
        }
      } catch {}
      setEditingUsername(false);
      showSuccess("Username updated");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to update username");
    } finally {
      setSavingUsername(false);
    }
  };

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
      if (userData.location?.country) {
        setLocation({
          country: userData.location.country,
          state: userData.location.state || "",
          city: userData.location.city || "",
        });
      }

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

      const payload: {
        profilePicture?: string;
        bio: string;
        location?: Partial<LocationSelection>;
      } = { bio };

      // Only send location once a country is chosen — never wipe a saved one.
      if (location?.country) {
        payload.location = {
          country: location.country,
          state: location.state || "",
          city: location.city || "",
        };
      }

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
      // Keep the Payouts row's provider routing in sync with the new country.
      if (payload.location?.country) {
        setUser((prev) => ({ ...prev, country: payload.location!.country! }));
      }
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
        <GlassBackButton style={styles.backButton} />
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
          placeholderTextColor={colors.textMuted}
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
        />
        <Text style={styles.bioCount}>{bio.length}/500</Text>

        {/* Account location — drives which events are surfaced and, for
            sellers, the selling currency and payout provider. */}
        <LocationPicker
          value={location ?? undefined}
          onChange={setLocation}
          label="Location"
        />
        <Text style={styles.locationHint}>
          Used to show what's happening near you. If you sell tickets or
          services, it also sets your selling currency and payout method.
        </Text>

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
            {editingUsername ? (
              <View style={styles.usernameEditWrap}>
                <TextInput
                  style={styles.usernameInput}
                  value={usernameDraft}
                  onChangeText={(t) => setUsernameDraft(t.replace(/^@+/, ""))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  maxLength={20}
                  editable={!savingUsername}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                />
                {usernameStatus !== "idle" && (
                  <Text
                    style={[
                      styles.usernameHint,
                      usernameStatus === "invalid" && { color: colors.warning },
                      usernameStatus === "checking" && { color: colors.textMuted },
                      usernameStatus === "available" && { color: "#22c55e" },
                      usernameStatus === "taken" && { color: colors.error },
                    ]}
                  >
                    {usernameStatus === "invalid" &&
                      "3–20 characters — letters, numbers, underscores."}
                    {usernameStatus === "checking" && "Checking availability…"}
                    {usernameStatus === "available" && "Available"}
                    {usernameStatus === "taken" && "That username is taken."}
                  </Text>
                )}
                <View style={styles.usernameActions}>
                  <TouchableOpacity
                    style={styles.usernameCancelBtn}
                    onPress={() => setEditingUsername(false)}
                    disabled={savingUsername}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.usernameCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.usernameSaveBtn,
                      (savingUsername ||
                        usernameStatus === "taken" ||
                        usernameStatus === "invalid") &&
                        styles.saveButtonDisabled,
                    ]}
                    onPress={handleSaveUsername}
                    disabled={
                      savingUsername ||
                      usernameStatus === "taken" ||
                      usernameStatus === "invalid"
                    }
                    activeOpacity={0.8}
                  >
                    {savingUsername ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.usernameSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={styles.infoValue}>{user.username}</Text>
            )}
          </View>
          {activeAccount === "client" && !editingUsername && (
            <TouchableOpacity
              style={styles.usernameEditBtn}
              onPress={openUsernameEditor}
              activeOpacity={0.7}
              accessibilityLabel="Change username"
            >
              <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}
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
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
              <Ionicons name="alert-circle" size={22} color={colors.warning} />
              <Text style={[styles.verifStatusText, { color: colors.warning }]}>
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
              <Ionicons name="time-outline" size={22} color={colors.warning} />
              <Text style={[styles.verifStatusText, { color: colors.warning }]}>Under Review</Text>
            </View>
          )}

          {verificationStatus === "rejected" && (
            <>
              <View style={styles.verifStatusRow}>
                <Ionicons name="close-circle" size={22} color={colors.error} />
                <Text style={[styles.verifStatusText, { color: colors.error }]}>Not Approved</Text>
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

        <View style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="color-palette-outline" size={22} color={colors.textBody} />
            <Text style={styles.preferenceText}>Appearance</Text>
          </View>
          <View style={styles.themeToggle}>
            {THEME_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.themeOption,
                  preference === option.value && styles.themeOptionActive,
                ]}
                onPress={() => setPreference(option.value)}
              >
                <Ionicons
                  name={option.icon}
                  size={14}
                  color={preference === option.value ? "#fff" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.themeOptionText,
                    preference === option.value && styles.themeOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/notifications" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="notifications-outline" size={22} color={colors.textBody} />
            <Text style={styles.preferenceText}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/privacy" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.textBody} />
            <Text style={styles.preferenceText}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/terms" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="document-text-outline" size={22} color={colors.textBody} />
            <Text style={styles.preferenceText}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.preferenceItem} onPress={() => router.push("/blocked-users" as any)}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="ban-outline" size={22} color={colors.textBody} />
            <Text style={styles.preferenceText}>Blocked Users</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.preferenceItem, { borderBottomWidth: 0 }]}
          onPress={() => WebBrowser.openBrowserAsync("https://api.ourcityvibe.com/delete-account")}
        >
          <View style={styles.preferenceLeft}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
            <Text style={[styles.preferenceText, { color: colors.error }]}>Delete Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    paddingTop: 60, 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
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
    color: c.text,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  section: {
    backgroundColor: c.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
    marginTop: 16,
    marginBottom: 8,
  },
  bioInput: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.text,
    minHeight: 90,
    textAlignVertical: "top",
  },
  bioCount: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  locationHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textMuted,
    lineHeight: 17,
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
    color: c.white,
    fontSize: 16,
    fontFamily: Fonts.semiBold,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.primaryFaded,
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
    color: c.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
  },
  infoSubvalue: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
  },
  usernameEditWrap: {
    marginTop: 2,
  },
  usernameInput: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: c.text,
  },
  usernameHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    marginTop: 6,
  },
  usernameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  usernameCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  usernameCancelText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.textSecondary,
  },
  usernameSaveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center",
  },
  usernameSaveText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.white,
  },
  usernameEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  preferenceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  preferenceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  preferenceText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: c.textBody,
  },
  themeToggle: {
    flexDirection: "row",
    backgroundColor: c.glassFillSubtle,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  themeOptionActive: {
    backgroundColor: c.primary,
  },
  themeOptionText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: c.textSecondary,
  },
  themeOptionTextActive: {
    color: c.white,
  },
  preferenceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preferenceValue: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
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
    backgroundColor: c.primaryFadedStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  switchAccountTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.text,
  },
  switchAccountSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
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
    color: c.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
});
