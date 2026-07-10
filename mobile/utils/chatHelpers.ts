import { router } from "expo-router";
import chatService from "@/services/chat.service";
import { Alert } from "react-native";

/**
 * Start a chat with a user by their ID
 * This function creates or retrieves an existing direct chat and navigates to it
 *
 * @param userId - The ID of the user to chat with
 */
export async function startChatWithUser(userId: string) {
  try {
    // Create or get existing direct chat
    const chat = await chatService.getOrCreateDirectChat(userId);

    // Navigate to the chat screen
    router.push({
      pathname: "/chat/[id]",
      params: { id: chat._id },
    });
  } catch (error) {
    console.error("Error starting chat:", error);
    Alert.alert("Error", "Failed to start chat. Please try again.");
  }
}

/**
 * Navigate to an existing chat by ID
 *
 * @param chatId - The ID of the chat to navigate to
 */
export function navigateToChat(chatId: string) {
  router.push({
    pathname: "/chat/[id]",
    params: { id: chatId },
  });
}
