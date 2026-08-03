import React from "react";
import ChatListScreen from "@/components/chat/ChatListScreen";

/**
 * The Chats tab. Mirrors app/(vendor)/chats.tsx, which wraps the vendor's own
 * conversation list the same way.
 */
export default function ChatsTab() {
  return <ChatListScreen variant="tab" />;
}
