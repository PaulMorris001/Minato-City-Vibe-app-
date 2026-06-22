import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

/**
 * Chat API Service
 * Handles all API calls related to chat functionality
 */

export interface ChatEventRef {
  _id: string;
  title: string;
  date?: string;
  location?: string;
  image?: string;
  createdBy?: string | User;
}

export interface Chat {
  _id: string;
  type: "direct" | "group";
  name?: string;
  groupImage?: string;
  participants: User[];
  admins?: User[];
  pendingInvites?: { user: User; invitedBy?: User; invitedAt?: string }[];
  lastMessage?: Message;
  unreadCount: Map<string, number>;
  isArchived: Map<string, boolean>;
  isMuted: Map<string, boolean>;
  pinnedBy?: string[];
  event?: ChatEventRef;
  createdAt: string;
  updatedAt: string;
}

export interface MessageReaction {
  user: string | { _id: string; username?: string; profilePicture?: string };
  emoji: string;
  createdAt?: string;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  profilePicture?: string;
}

export interface Message {
  _id: string;
  chat: string;
  sender: User;
  type: "text" | "image" | "event" | "guide" | "system";
  content?: string;
  imageUrl?: string;
  event?: any;
  guide?: {
    _id: string;
    title: string;
    authorName: string;
    city?: string;
    cityState?: string;
    topic?: string;
    price?: number;
  };
  status: "sent" | "delivered" | "read" | "sending" | "failed";
  readBy?: Array<{ user: string; readAt: string }>;
  replyTo?: Message;
  isDeleted: boolean;
  isEdited: boolean;
  editedAt?: string;
  reactions?: MessageReaction[];
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageData {
  type?: "text" | "image" | "event" | "guide";
  content?: string;
  imageUrl?: string;
  eventId?: string;
  guideId?: string;
  replyTo?: string;
}

class ChatService {
  private async getAuthHeader() {
    const token = await SecureStore.getItemAsync("token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Get all chats for the user
   */
  async getUserChats(): Promise<Chat[]> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats`, { headers });

      if (!response.ok) {
        throw new Error("Failed to fetch chats");
      }

      const data = await response.json();
      return data.chats;
    } catch (error) {
      console.error("Get user chats error:", error);
      throw error;
    }
  }

  /**
   * Get or create a direct chat with another user
   */
  async getOrCreateDirectChat(otherUserId: string): Promise<Chat> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/direct`, {
        method: "POST",
        headers,
        body: JSON.stringify({ otherUserId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create/get chat");
      }

      const data = await response.json();
      return data.chat;
    } catch (error) {
      console.error("Get/Create direct chat error:", error);
      throw error;
    }
  }

  /**
   * Create a group chat
   */
  async createGroupChat(
    name: string,
    participantIds: string[],
    groupImage?: string
  ): Promise<Chat> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/group`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, participantIds, groupImage }),
      });

      if (!response.ok) {
        throw new Error("Failed to create group chat");
      }

      const data = await response.json();
      return data.chat;
    } catch (error) {
      console.error("Create group chat error:", error);
      throw error;
    }
  }

  /**
   * Get a specific chat by ID
   */
  async getChatById(chatId: string): Promise<Chat> {
    try {
      if (!chatId || typeof chatId !== "string") {
        throw new Error(`Invalid chat id: ${JSON.stringify(chatId)}`);
      }
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/${chatId}`, { headers });

      if (!response.ok) {
        // Try to surface the server's error message so we can debug auth /
        // permission / not-found cases from a real device.
        let serverMessage: string | undefined;
        try {
          const body = await response.json();
          serverMessage = body?.message;
        } catch {}
        throw new Error(
          `Chat fetch failed (${response.status}${serverMessage ? `: ${serverMessage}` : ""})`
        );
      }

      const data = await response.json();
      return data.chat;
    } catch (error) {
      console.error("[chatService.getChatById] error:", error, "chatId=", chatId);
      throw error;
    }
  }

  /**
   * Send a message in a chat
   */
  async sendMessage(
    chatId: string,
    messageData: SendMessageData
  ): Promise<Message> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/${chatId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("Send message error:", error);
      throw error;
    }
  }

  /**
   * Get messages for a chat
   */
  async getChatMessages(
    chatId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ messages: Message[]; pagination: any }> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(
        `${BASE_URL}/chats/${chatId}/messages?page=${page}&limit=${limit}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Get messages error:", error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/${chatId}/read`, {
        method: "PUT",
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to mark messages as read");
      }
    } catch (error) {
      console.error("Mark as read error:", error);
      throw error;
    }
  }

  /**
   * Delete a message for everyone (sender only)
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/messages/${messageId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to delete message");
      }
    } catch (error) {
      console.error("Delete message error:", error);
      throw error;
    }
  }

  /**
   * Edit a text message (sender only, within 10 minutes)
   */
  async editMessage(messageId: string, content: string): Promise<Message> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/messages/${messageId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to edit message");
    }
    const data = await response.json();
    return data.data as Message;
  }

  /**
   * Delete (hide) a conversation for the current user
   */
  async deleteChat(chatId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/chats/${chatId}`, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to delete conversation");
    }
  }

  /**
   * Update group chat name and/or image (admin only)
   */
  async updateGroupChat(
    chatId: string,
    updates: { name?: string; groupImage?: string }
  ): Promise<Chat> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(`${BASE_URL}/chats/${chatId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update group chat");
      }

      const data = await response.json();
      return data.chat;
    } catch (error) {
      console.error("Update group chat error:", error);
      throw error;
    }
  }

  /**
   * Remove a member from a group chat (admins only)
   */
  async removeParticipant(chatId: string, participantId: string): Promise<Chat> {
    const headers = await this.getAuthHeader();
    const response = await fetch(
      `${BASE_URL}/chats/${chatId}/participants/${participantId}`,
      { method: "DELETE", headers }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to remove member");
    }
    const data = await response.json();
    return data.chat as Chat;
  }

  /**
   * Invite users to a group chat (admins only). Invitees must accept before
   * they join. Returns the updated chat with the new pending invites.
   */
  async inviteToGroup(
    chatId: string,
    userIds: string[]
  ): Promise<{ chat: Chat; message: string }> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/chats/${chatId}/invite`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userIds }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to invite members");
    }
    const data = await response.json();
    return { chat: data.chat as Chat, message: data.message as string };
  }

  /**
   * Accept or decline a pending group invite.
   */
  async respondToGroupInvite(chatId: string, accept: boolean): Promise<Chat> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/chats/${chatId}/invite/respond`, {
      method: "POST",
      headers,
      body: JSON.stringify({ accept }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to respond to invite");
    }
    const data = await response.json();
    return data.chat as Chat;
  }

  /**
   * Toggle a reaction on a message
   */
  async toggleReaction(messageId: string, emoji: string): Promise<Message> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/messages/${messageId}/reactions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ emoji }),
    });
    if (!response.ok) {
      throw new Error("Failed to toggle reaction");
    }
    const data = await response.json();
    return data.data as Message;
  }

  /**
   * Pin / unpin a chat
   */
  async setChatPinned(chatId: string, pinned: boolean): Promise<Chat> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/chats/${chatId}/pin`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ pinned }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to update pin");
    }
    const data = await response.json();
    return data.chat as Chat;
  }

  /**
   * Mute / unmute a chat
   */
  async setChatMuted(chatId: string, muted: boolean): Promise<Chat> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/chats/${chatId}/mute`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ muted }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to update mute");
    }
    const data = await response.json();
    return data.chat as Chat;
  }

  /**
   * Search chats and messages
   */
  async search(query: string): Promise<{
    chats: Chat[];
    messages: Message[];
  }> {
    try {
      const headers = await this.getAuthHeader();
      const response = await fetch(
        `${BASE_URL}/chats/search?query=${encodeURIComponent(query)}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error("Failed to search");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
  }
}

export default new ChatService();
