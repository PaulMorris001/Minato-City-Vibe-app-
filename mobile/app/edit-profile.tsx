import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
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
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

// Matches the signup wizard's client-side rule; the server (like /register)
// only enforces 2–30 chars.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [savingUsername, setSavingUsername] = useState(false);

  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const u = res.data.user;
        setProfilePicture(u.profilePicture || "");
        setBio(u.bio || "");
        setGender(u.gender || "");
        setEmail(u.email || "");
        setUsername(u.username || "");
      } catch {
        showError("Failed to load your profile");
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    })();
  }, []);

  // Debounced live availability check while the username editor is open.
  useEffect(() => {
    if (!editingUsername) return;
    const raw = usernameDraft.trim().replace(/^@+/, "");
    if (!raw || raw.toLowerCase() === username.toLowerCase()) {
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
  }, [usernameDraft, editingUsername, username]);

  const openUsernameEditor = () => {
    setUsernameDraft(username);
    setUsernameStatus("idle");
    setEditingUsername(true);
  };

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

  const handleSaveUsername = async () => {
    const next = usernameDraft.trim().replace(/^@+/, "");
    if (next === username) {
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
      setUsername(next);
      await syncCachedUsername(next);
      setEditingUsername(false);
      showSuccess("Username updated");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to update username");
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const payload: { profilePicture?: string; bio: string; gender: string } = {
        bio,
        gender,
      };

      if (profilePicture) {
        if (profilePicture.startsWith("file://")) {
          try {
            const result = await uploadImage(profilePicture, "profiles", token!);
            payload.profilePicture = result.url;
            setProfilePicture(result.url);
          } catch {
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
      showSuccess("Profile updated");
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
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        {editingUsername ? (
          <View>
            <TextInput
              style={styles.input}
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
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setEditingUsername(false)}
                disabled={savingUsername}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.smallSaveBtn,
                  (savingUsername ||
                    usernameStatus === "taken" ||
                    usernameStatus === "invalid") &&
                    styles.disabled,
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
                  <Text style={styles.smallSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.readonlyRow}
            onPress={openUsernameEditor}
            activeOpacity={0.7}
          >
            <Text style={styles.readonlyValue}>@{username}</Text>
            <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
          </TouchableOpacity>
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
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
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
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
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
    content: { paddingHorizontal: 16, paddingBottom: 48 },
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
    rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
    secondaryBtn: { paddingHorizontal: 16, paddingVertical: 10 },
    secondaryBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.textSecondary },
    smallSaveBtn: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 72,
    },
    smallSaveText: { color: "#fff", fontSize: 14, fontFamily: Fonts.semiBold },
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
