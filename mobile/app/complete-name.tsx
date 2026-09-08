import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { PosterBackground } from "@/components/auth/PosterBackground";
import { PrimaryCTA, Wordmark } from "@/components/auth/AuthPrimitives";
import { AU } from "@/components/auth/tokens";
import { useAccount } from "@/contexts/AccountContext";

/**
 * A one-time, un-skippable stop between login and the app for any account
 * that predates firstName/lastName (every account created before this
 * shipped) or whose signup provider (Apple, sometimes) didn't hand us a name.
 * Cleared the moment /profile/picture accepts a fullName — see
 * updateProfilePicture on the server, the same endpoint Edit Profile uses.
 */
export default function CompleteNameScreen() {
  const { activeAccount } = useAccount();
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    const trimmed = fullName.trim().replace(/\s+/g, " ");
    if (trimmed.length < 2) {
      Alert.alert("Almost there", "Enter your full name to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.put(
        `${BASE_URL}/profile/picture`,
        { fullName: trimmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // The server should always echo back what it just saved. If it comes
      // back empty, the request was accepted but the name never actually
      // persisted (e.g. a server still running a build from before this
      // field existed) — fail loudly here instead of silently bouncing the
      // user right back to this screen from the tabs/vendor layout gate.
      if (!res.data?.user?.firstName) {
        Alert.alert(
          "Couldn't save your name",
          "Something went wrong on our end — please try again in a moment."
        );
        return;
      }

      // Keep the cached user in step so every screen reading it (home
      // greeting, own profile) sees the name immediately, not after a refetch.
      try {
        const cached = await SecureStore.getItemAsync("user");
        const parsed = cached ? JSON.parse(cached) : {};
        await SecureStore.setItemAsync(
          "user",
          JSON.stringify({ ...parsed, ...res.data.user })
        );
      } catch {}

      router.replace(
        activeAccount === "vendor" ? "/(vendor)/dashboard" : "/(tabs)/home"
      );
    } catch (error: any) {
      Alert.alert(
        "Couldn't save your name",
        error.response?.data?.message || "Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogOut = async () => {
    await SecureStore.deleteItemAsync("token");
    await SecureStore.deleteItemAsync("user");
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <PosterBackground />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.topBar}>
            <Wordmark />
          </View>

          <View style={styles.body}>
            <Text style={styles.headline}>What's your{"\n"}name?</Text>
            <Text style={styles.subhint}>
              One quick thing — we want the app to know you by your real name.
            </Text>

            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="John Doe"
              placeholderTextColor={AU.textMute}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              style={styles.input}
            />

            <PrimaryCTA
              label="Continue"
              onPress={handleContinue}
              variant={fullName.trim().length < 2 ? "disabled" : "primary"}
              loading={submitting}
            />

            <TouchableOpacity onPress={handleLogOut} activeOpacity={0.7} style={styles.logOut}>
              <Text style={styles.logOutText}>Log out instead</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0710" },
  topBar: { paddingHorizontal: 20, paddingTop: 8 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 16 },
  headline: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 34,
    lineHeight: 40,
    color: "#fff",
    letterSpacing: -0.6,
  },
  subhint: {
    fontSize: 15,
    color: AU.textMute,
    lineHeight: 21,
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logOut: { alignSelf: "center", marginTop: 8, padding: 8 },
  logOutText: { fontSize: 13, color: AU.textMute, textDecorationLine: "underline" },
});
