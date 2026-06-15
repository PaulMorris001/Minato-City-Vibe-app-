/**
 * Socket Service - Real-time Communication
 */

import * as SecureStore from "expo-secure-store";
import io, { Socket } from "socket.io-client";
import { config } from "@/constants/constants";

interface SocketEvents {
  onNewMessage?: (message: any) => void;
  onMessageRead?: (data: any) => void;
  onMessageReaction?: (data: { chatId: string; messageId: string; reactions: any[] }) => void;
  onMessageDeleted?: (data: { chatId: string; messageId: string }) => void;
  onMessageEdited?: (data: { chatId: string; message: any }) => void;
  onChatPinned?: (data: { chatId: string; pinned: boolean }) => void;
  onChatMuted?: (data: { chatId: string; muted: boolean }) => void;
  onTypingStart?: (data: any) => void;
  onTypingStop?: (data: any) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  onGroupUpdated?: (data: { chatId: string; name?: string; groupImage?: string }) => void;
  onEventInvite?: (data: { eventId: string; eventTitle: string; inviterUsername: string }) => void;
  onFollowNew?: (data: { followerId: string; followerUsername: string; followerProfilePicture: string; isMutual: boolean }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private connected = false;

  // Multiple named listeners so screens don't overwrite each other
  private listeners: Map<string, SocketEvents> = new Map();

  // Track rooms so we can re-join after reconnection
  private activeRooms: Set<string> = new Set();

  private notify(event: keyof SocketEvents, data: any) {
    this.listeners.forEach((handlers) => {
      const fn = handlers[event] as ((d: any) => void) | undefined;
      fn?.(data);
    });
  }

  /**
   * Initialize and connect to the socket server
   */
  async connect() {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      console.log("🔌 Connecting to socket server:", config.socketUrl);

      this.socket = io(config.socketUrl, {
        auth: { token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket.on("connect", () => {
        console.log("✅ Socket connected:", this.socket?.id);
        this.connected = true;

        // Re-join every room we were in before the reconnect
        this.activeRooms.forEach((chatId) => {
          this.socket?.emit("chat:join", chatId);
          console.log(`🔄 Re-joined chat room: ${chatId}`);
        });
      });

      this.socket.on("disconnect", () => {
        console.log("❌ Socket disconnected");
        this.connected = false;
      });

      this.socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error.message);
      });

      this.socket.on("error", (error) => {
        console.error("Socket error:", error);
      });

      this.socket.on("message:new", (message) => {
        console.log("📨 New message received:", message._id);
        this.notify("onNewMessage", message);
      });

      this.socket.on("message:read", (data) => {
        this.notify("onMessageRead", data);
      });

      this.socket.on("typing:start", (data) => {
        this.notify("onTypingStart", data);
      });

      this.socket.on("typing:stop", (data) => {
        this.notify("onTypingStop", data);
      });

      this.socket.on("user:online", (userId) => {
        this.notify("onUserOnline", userId);
      });

      this.socket.on("user:offline", (userId) => {
        this.notify("onUserOffline", userId);
      });

      this.socket.on("group:updated", (data) => {
        this.notify("onGroupUpdated", data);
      });

      this.socket.on("message:reaction", (data) => {
        this.notify("onMessageReaction", data);
      });

      this.socket.on("message:deleted", (data) => {
        this.notify("onMessageDeleted", data);
      });

      this.socket.on("message:edited", (data) => {
        this.notify("onMessageEdited", data);
      });

      this.socket.on("chat:pinned", (data) => {
        this.notify("onChatPinned", data);
      });

      this.socket.on("chat:muted", (data) => {
        this.notify("onChatMuted", data);
      });

      this.socket.on("event:invite", (data) => {
        this.notify("onEventInvite", data);
      });

      this.socket.on("follow:new", (data) => {
        this.notify("onFollowNew", data);
      });
    } catch (error) {
      console.error("Socket connection error:", error);
    }
  }

  /**
   * Disconnect from the socket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.activeRooms.clear();
      console.log("🔌 Socket disconnected");
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Join a chat room (tracked for reconnection)
   */
  joinChat(chatId: string) {
    this.activeRooms.add(chatId);
    if (this.socket && this.connected) {
      this.socket.emit("chat:join", chatId);
      console.log(`✅ Joined chat: ${chatId}`);
    }
  }

  /**
   * Leave a chat room
   */
  leaveChat(chatId: string) {
    this.activeRooms.delete(chatId);
    if (this.socket && this.connected) {
      this.socket.emit("chat:leave", chatId);
      console.log(`🚪 Left chat: ${chatId}`);
    }
  }

  sendTyping(chatId: string, isTyping: boolean) {
    if (this.socket && this.connected) {
      this.socket.emit(isTyping ? "typing:start" : "typing:stop", { chatId });
    }
  }

  markDelivered(messageId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("message:delivered", { messageId });
    }
  }

  markMessagesAsRead(chatId: string, userId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("message:read", { chatId, userId });
    }
  }

  /**
   * Register event listeners under a unique ID.
   * Multiple screens can listen simultaneously without overwriting each other.
   */
  on(id: string, events: SocketEvents) {
    this.listeners.set(id, events);
  }

  /**
   * Remove the listener registered under the given ID.
   */
  off(id: string) {
    this.listeners.delete(id);
  }
}

export default new SocketService();
