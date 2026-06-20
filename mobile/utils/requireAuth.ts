import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { Alert } from "react-native";

/**
 * Gate an action that requires an account. With full guest browsing, logged-out
 * users can view content but must sign up to act (RSVP, chat, buy, follow, …).
 *
 * Returns true when a token exists (proceed). Otherwise it prompts the guest to
 * sign in and returns false, so callers should `if (!(await ensureAuth(...))) return;`.
 */
export async function ensureAuth(action = "continue"): Promise<boolean> {
  const token = await SecureStore.getItemAsync("token");
  if (token) return true;
  Alert.alert("Create an account", `Sign up or log in to ${action}.`, [
    { text: "Not now", style: "cancel" },
    { text: "Log in / Sign up", onPress: () => router.push("/login") },
  ]);
  return false;
}

/** Synchronous variant when the token was already read. */
export function ensureAuthToken(token: string | null, action = "continue"): boolean {
  if (token) return true;
  Alert.alert("Create an account", `Sign up or log in to ${action}.`, [
    { text: "Not now", style: "cancel" },
    { text: "Log in / Sign up", onPress: () => router.push("/login") },
  ]);
  return false;
}
