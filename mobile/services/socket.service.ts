/**
 * Socket Service - Real-time Communication
 */

import * as SecureStore from "expo-secure-store";
import io, { Socket } from "socket.io-client";
import { config } from "@/constants/constants";

interface SocketEvents {
  onNewMessage?: (message: any) => void;
  onMessageRead?: (data: any) => void;
  onTypingStart?: (data: any) => void;
  onTypingStop?: (data: any) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private events: SocketEvents = {};
  private connected = false;

  /**
   * Initialize and connect to the socket server
   */
  async connect() {
    try {
      // Get authentication token
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        // Silently skip connection if not authenticated
        // User will need to log in first
        return;
      }

      console.log("🔌 Connecting to socket server:", config.socketUrl);

      this.socket = io(config.socketUrl, {
        auth: {
          token,
        },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on("connect", () => {
        console.log("✅ Socket connected:", this.socket?.id);
        this.connected = true;
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

      // Listen for new messages
      this.socket.on("message:new", (message) => {
        console.log("📨 New message received:", message._id);
        if (this.events.onNewMessage) {
          this.events.onNewMessage(message);
        }
      });

      // Listen for message read receipts
      this.socket.on("message:read", (data) => {
        if (this.events.onMessageRead) {
          this.events.onMessageRead(data);
        }
      });

      // Listen for typing indicators
      this.socket.on("typing:start", (data) => {
        if (this.events.onTypingStart) {
          this.events.onTypingStart(data);
        }
      });

      this.socket.on("typing:stop", (data) => {
        if (this.events.onTypingStop) {
          this.events.onTypingStop(data);
        }
      });

      // Listen for online/offline status
      this.socket.on("user:online", (userId) => {
        if (this.events.onUserOnline) {
          this.events.onUserOnline(userId);
        }
      });

      this.socket.on("user:offline", (userId) => {
        if (this.events.onUserOffline) {
          this.events.onUserOffline(userId);
        }
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
      console.log("🔌 Socket disconnected");
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Join a chat room
   */
  joinChat(chatId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("chat:join", chatId);
      console.log(`✅ Joined chat: ${chatId}`);
    }
  }

  /**
   * Leave a chat room
   */
  leaveChat(chatId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("chat:leave", chatId);
      console.log(`🚪 Left chat: ${chatId}`);
    }
  }

  /**
   * Send typing indicator
   */
  sendTyping(chatId: string, isTyping: boolean) {
    if (this.socket && this.connected) {
      this.socket.emit(isTyping ? "typing:start" : "typing:stop", { chatId });
    }
  }

  /**
   * Mark message as delivered
   */
  markDelivered(messageId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("message:delivered", { messageId });
    }
  }

  /**
   * Mark messages as read in a chat
   */
  markMessagesAsRead(chatId: string, userId: string) {
    if (this.socket && this.connected) {
      this.socket.emit("message:read", { chatId, userId });
      console.log(`✅ Marked messages as read in chat: ${chatId}`);
    }
  }

  /**
   * Register event listeners
   */
  on(events: SocketEvents) {
    this.events = { ...this.events, ...events };
  }

  /**
   * Remove event listeners
   */
  off() {
    this.events = {};
  }
}

// Export singleton instance
export default new SocketService();
