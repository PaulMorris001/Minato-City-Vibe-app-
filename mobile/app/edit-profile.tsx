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
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showSuccess } from "@/utils/toast";
import {
  dobError,
  formatDob,
  maxDobDate,
  parseDobString,
  toDobString,
} from "@/utils/dateOfBirth";
import { ImagePickerButton } from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { goBack } from "@/utils/navigation";
import { fullName as composeFullName } from "@/utils/displayName";
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
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  // "YYYY-MM-DD", or "" when this account predates the field.
  const [dob, setDob] = useState("");
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  // Snapshot of the last-saved values. "Save Profile" stays disabled until an
  // editable field differs from this, and it's refreshed on save so the button
  // goes quiet again without leaving the screen.
  const [saved, setSaved] = useState({
    profilePicture: "",
    name: "",
    bio: "",
    gender: "",
    dob: "",
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
          name: composeFullName(u),
          bio: u.bio || "",
          gender: u.gender || "",
          dob: u.dateOfBirth ? toDobString(new Date(u.dateOfBirth)) : "",
          username: u.username || "",
        };
        setProfilePicture(initial.profilePicture);
        setName(initial.name);
        setBio(initial.bio);
        setGender(initial.gender);
        setDob(initial.dob);
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

  // Keeps the cached "user" blob (home greeting, own profile header, etc.)
  // in step with a save here, so those don't show the stale value until the
  // next full profile refetch.
  const syncCachedFields = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const cached = await SecureStore.getItemAsync("user");
      if (cached) {
        const parsed = JSON.parse(cached);
        await SecureStore.setItemAsync("user", JSON.stringify({ ...parsed, ...patch }));
      }
    } catch {}
  }, []);

  const usernameChanged =
    cleanUsername(username).toLowerCase() !== saved.username.toLowerCase();
  const nameChanged = name.trim() !== saved.name.trim();
  const dirty =
    profilePicture !== saved.profilePicture ||
    nameChanged ||
    bio !== saved.bio ||
    gender !== saved.gender ||
    dob !== saved.dob ||
    usernameChanged;
  // A changed username must be well-formed and not known-taken (an inconclusive
  // check falls through to the server, same as the old inline editor did), and
  // we wait for an in-flight check to land before enabling the button.
  const usernameOk =
    !usernameChanged ||
    (USERNAME_RE.test(cleanUsername(username)) &&
      usernameStatus !== "taken" &&
      usernameStatus !== "checking");
  // A changed name can't be cleared to blank — everyone completes this once
  // (see complete-name.tsx) and Edit Profile shouldn't be a way back out of it.
  const nameOk = !nameChanged || name.trim().length >= 2;
  // An untouched empty DOB is fine (older accounts); a set one must be valid.
  const dobOk = !dob || !dobError(dob);
  const canSave = dirty && !saving && usernameOk && nameOk && dobOk;

  const handleSave = async () => {
    const nextUsername = cleanUsername(username);
    if (usernameChanged && !USERNAME_RE.test(nextUsername)) {
      showError("3–20 characters — letters, numbers and underscores only.");
      return;
    }
    const nextName = name.trim().replace(/\s+/g, " ");
    if (nameChanged && nextName.length < 2) {
      showError("Enter your full name.");
      return;
    }
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const payload: {
        profilePicture?: string;
        bio: string;
        gender: string;
        dateOfBirth?: string;
        username?: string;
        fullName?: string;
      } = { bio, gender };
      if (dob !== saved.dob) payload.dateOfBirth = dob;
      if (usernameChanged) payload.username = nextUsername;
      if (nameChanged) payload.fullName = nextName;

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

      const res = await axios.put(`${BASE_URL}/profile/picture`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const cachePatch: Record<string, unknown> = {};
      if (usernameChanged) {
        setUsername(nextUsername);
        cachePatch.username = nextUsername;
      }
      if (nameChanged) {
        cachePatch.firstName = res.data.user?.firstName ?? "";
        cachePatch.lastName = res.data.user?.lastName ?? "";
      }
      if (Object.keys(cachePatch).length > 0) await syncCachedFields(cachePatch);

      setSaved({
        profilePicture: nextPicture,
        name: nextName,
        bio,
        gender,
        dob,
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
              fallbackName={name || username}
            />
          </View>

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
            editable={!saving}
            placeholder="Your full name"
            placeholderTextColor={colors.textMuted}
          />

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

          <Text style={styles.fieldLabel}>Date of birth</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setDobPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={dob ? `Date of birth, ${formatDob(dob)}` : "Set your date of birth"}
          >
            <Text style={dob ? styles.dobValue : styles.dobPlaceholder}>
              {dob ? formatDob(dob) : "Select your date of birth"}
            </Text>
          </TouchableOpacity>
          {dobPickerOpen && (
            <DateTimePicker
              value={parseDobString(dob) ?? maxDobDate()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={maxDobDate()}
              onChange={(e: DateTimePickerEvent, picked?: Date) => {
                if (Platform.OS !== "ios") setDobPickerOpen(false);
                if (e.type === "dismissed" || !picked) return;
                setDob(toDobString(picked));
              }}
            />
          )}

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
    dobValue: { fontSize: 15, fontFamily: Fonts.regular, color: c.text },
    dobPlaceholder: { fontSize: 15, fontFamily: Fonts.regular, color: c.textMuted },
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
