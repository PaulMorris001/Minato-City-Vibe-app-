import { Alert } from "react-native";
import { router } from "expo-router";
import { isSupportUser } from "@/constants/support";
import chatService from "@/services/chat.service";

/**
 * Open (or resume) the conversation with the official support account.
 *
 * Support has no profile to visit — it's a help desk, so the useful
 * destination is always the chat. The server waives the mutual-follow rule
 * for this pair, so this succeeds for any signed-in user.
 *
 * The support account is resolved server-side rather than from a bundled id:
 * a build carrying the wrong literal previously broke every support entry point
 * in the app with no way to recover without shipping again.
 */
export async function openSupportChat({ replace = false }: { replace?: boolean } = {}) {
  try {
    const chat = await chatService.getOrCreateSupportChat();
    const target = { pathname: "/chat/[id]" as const, params: { id: chat._id } };
    // `replace` when we're bouncing off a screen the user should never land
    // back on (e.g. a support profile route reached via a deep link).
    if (replace) router.replace(target);
    else router.push(target);
  } catch (error) {
    Alert.alert(
      "Couldn't reach support",
      "Something went wrong opening the support chat. Please try again."
    );
  }
}

/**
 * Navigate to a user's public profile. Centralized so every avatar/name in the
 * app links the same way. No-ops on a missing id.
 *
 * Tapping the support account anywhere — a chat header, a message avatar, an
 * @mention — opens its conversation instead of a profile page.
 */
export function openUserProfile(userId?: string | null) {
  if (!userId) return;
  if (isSupportUser(userId)) {
    openSupportChat();
    return;
  }
  router.push({ pathname: "/user-profile", params: { userId } } as any);
}
