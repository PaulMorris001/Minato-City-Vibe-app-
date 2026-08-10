import React from "react";
import ChatListScreen from "@/components/chat/ChatListScreen";

/**
 * The /messages stack route. The conversation list now lives on the Chats tab,
 * but this route is kept as an alias so existing deep links — and the
 * `router.replace("/messages")` fallbacks in chat/[id] and order-confirm — keep
 * resolving. The only difference is the back button.
 */
export default function MessagesScreen() {
  return <ChatListScreen variant="stack" />;
}
