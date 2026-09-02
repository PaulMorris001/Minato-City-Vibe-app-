import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess } from "@/utils/toast";
import { ImagePickerButton } from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { goBack } from "@/utils/navigation";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

// Matches the signup wizard's client-side rule; the server (like /register)
// only enforces 2–30 chars.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const cleanUsername = (v: string) => v.trim().replace(/^@+/, "");

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
] as const;

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profilePicture, setProfilePicture] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  // Snapshot of the last-saved values. "Save Profile" stays disabled until an
  // editable field differs from this, and it's refreshed on save so the button
  // goes quiet again without leaving the screen.
  const [saved, setSaved] = useState({
    profilePicture: "",
    bio: "",
    gender: "",
    username: "",
  });

  const loadedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const u = res.data.user;
        const initial = {
          profilePicture: u.profilePicture || "",
          bio: u.bio || "",
          gender: u.gender || "",
          username: u.username || "",
        };
        setProfilePicture(initial.profilePicture);
        setBio(initial.bio);
        setGender(initial.gender);
        setEmail(u.email || "");
        setUsername(initial.username);
        setSaved(initial);
      } catch {
        showError("Failed to load your profile");
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    })();
  }, []);

  // Debounced live availability check whenever the username differs from the
  // saved one — feeds both the inline hint and the Save button's gate.
  useEffect(() => {
    const raw = cleanUsername(username);
    if (!raw || raw.toLowerCase() === saved.username.toLowerCase()) {
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
  }, [username, saved.username]);

  const syncCachedUsername = useCallback(async (next: string) => {
    try {
      const cached = await SecureStore.getItemAsync("user");
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.username = next;
        await SecureStore.setItemAsync("user", JSON.stringify(parsed));
      }
    } catch {}
  }, []);

  const usernameChanged =
    cleanUsername(username).toLowerCase() !== saved.username.toLowerCase();
  const dirty =
    profilePicture !== saved.profilePicture ||
    bio !== saved.bio ||
    gender !== saved.gender ||
    usernameChanged;
  // A changed username must be well-formed and not known-taken (an inconclusive
  // check falls through to the server, same as the old inline editor did), and
  // we wait for an in-flight check to land before enabling the button.
  const usernameOk =
    !usernameChanged ||
    (USERNAME_RE.test(cleanUsername(username)) &&
      usernameStatus !== "taken" &&
      usernameStatus !== "checking");
  const canSave = dirty && !saving && usernameOk;

  const handleSave = async () => {
    const nextUsername = cleanUsername(username);
    if (usernameChanged && !USERNAME_RE.test(nextUsername)) {
      showError("3–20 characters — letters, numbers and underscores only.");
      return;
    }
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const payload: {
        profilePicture?: string;
        bio: string;
        gender: string;
        username?: string;
      } = { bio, gender };
      if (usernameChanged) payload.username = nextUsername;

      let nextPicture = profilePicture;
      if (profilePicture) {
        if (profilePicture.startsWith("file://")) {
          try {
            const result = await uploadImage(profilePicture, "profiles", token!);
            nextPicture = result.url;
            setProfilePicture(result.url);
          } catch {
            showError("Failed to upload image. Please try again.");
            setSaving(false);
            return;
          }
        }
        payload.profilePicture = nextPicture;
      }

      await axios.put(`${BASE_URL}/profile/picture`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (usernameChanged) {
        setUsername(nextUsername);
        await syncCachedUsername(nextUsername);
      }
      setSaved({
        profilePicture: nextPicture,
        bio,
        gender,
        username: usernameChanged ? nextUsername : saved.username,
      });
      setUsernameStatus("idle");
      showSuccess("Profile updated");
      // Back to the profile screen it was opened from (falls back to the
      // profile tab if there's no stack to pop).
      goBack("/(tabs)/profile");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photoWrap}>
            <ImagePickerButton
              imageUri={profilePicture}
              onImageSelected={setProfilePicture}
              label="Profile Photo"
              size={140}
              shape="circle"
              fallbackName={username}
            />
          </View>

          <Text style={styles.fieldLabel}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(t) => setUsername(t.replace(/^@+/, ""))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!saving}
            placeholder="username"
            placeholderTextColor={colors.textMuted}
          />
          {usernameStatus !== "idle" && (
            <Text
              style={[
                styles.hint,
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

          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.readonlyRow}>
            <Text style={styles.readonlyValue}>{email}</Text>
          </View>

          <Text style={styles.fieldLabel}>Bio</Text>
          <TextInput
            style={styles.bioInput}
            placeholder="Tell people a bit about yourself..."
            placeholderTextColor={colors.textMuted}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={500}
            // Bio sits near the bottom; the KeyboardAvoidingView shrinks the
            // scroll area from below, so pull it back into view on focus.
            onFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
            }
          />
          <Text style={styles.bioCount}>{bio.length}/500</Text>

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((opt) => {
              const active = gender === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.genderPill, active && styles.genderPillActive]}
                  onPress={() => setGender(active ? "" : opt.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.genderPillText, active && styles.genderPillTextActive]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.disabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: { width: 40 },
    headerTitle: {
      fontSize: 20,
      fontFamily: Fonts.bold,
      color: c.text,
    },
    loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 80 },
    photoWrap: { alignItems: "center", marginTop: 8, marginBottom: 8 },
    fieldLabel: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: c.textBody,
      marginTop: 20,
      marginBottom: 8,
    },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
    },
    hint: { fontSize: 12, fontFamily: Fonts.regular, marginTop: 6 },
    readonlyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    readonlyValue: { fontSize: 15, fontFamily: Fonts.medium, color: c.text },
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
    genderRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    genderPill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    genderPillActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primary + "1A",
    },
    genderPillText: { fontSize: 14, fontFamily: Fonts.medium, color: c.textSecondary },
    genderPillTextActive: { color: Colors.primary, fontFamily: Fonts.semiBold },
    saveButton: {
      backgroundColor: Colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 28,
    },
    saveButtonText: { color: "#fff", fontSize: 16, fontFamily: Fonts.semiBold },
    disabled: { opacity: 0.6 },
  });
