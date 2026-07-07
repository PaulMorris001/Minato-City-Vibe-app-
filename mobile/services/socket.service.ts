/**
 * Socket Service - Real-time Communication
 */

import * as SecureStore from "expo-secure-store";
import io, { Socket } from "socket.io-client";
import { config } from "@/constants/constants";

interface SocketEvents {
  /** Fired on every (re)connect — do a silent catch-up refetch, anything
   * emitted while the socket was down was never delivered. */
  onConnected?: () => void;
  onNewMessage?: (message: any) => void;
  onMessageRead?: (data: any) => void;
  onMessageReaction?: (data: { chatId: string; messageId: string; reactions: any[] }) => void;
  onMessageDeleted?: (data: { chatId: string; messageId: string }) => void;
  onMessageEdited?: (data: { chatId: string; message: any }) => void;
  onChatPinned?: (data: { chatId: string; pinned: boolean }) => void;
  onChatPinnedMessage?: (data: { chatId: string; pinnedMessage: any | null }) => void;
  onChatMuted?: (data: { chatId: string; muted: boolean }) => void;
  onTypingStart?: (data: any) => void;
  onTypingStop?: (data: any) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  onGroupUpdated?: (data: { chatId: string; name?: string; groupImage?: string }) => void;
  onGroupInvite?: (data: { chatId: string; groupName: string; inviterUsername: string }) => void;
  onGroupRemoved?: (data: { chatId: string }) => void;
  onEventInvite?: (data: { eventId: string; eventTitle: string; inviterUsername: string }) => void;
  onFollowNew?: (data: { followerId: string; followerUsername: string; followerProfilePicture: string; isMutual: boolean }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private connected = false;

  // Token the current socket was authenticated with — lets connect() detect
  // an account switch and rebuild instead of reusing a stale-auth socket.
  private currentToken: string | null = null;

  // Guards the async body of connect() so two rapid calls (e.g. layout mount
  // + AppState "active") can't race past the SecureStore await and stack
  // a second socket.
  private connecting = false;

  // Multiple named listeners so screens don't overwrite each other
  private listeners: Map<string, SocketEvents> = new Map();

  // Track rooms so we can re-join after reconnection
  private activeRooms: Set<string> = new Set();

  private notify(event: keyof SocketEvents, data: any) {
    this.listeners.forEach((handlers) => {
      const fn = handlers?.[event] as ((d: any) => void) | undefined;
      fn?.(data);
    });
  }

  /**
   * Initialize and connect to the socket server.
   *
   * Idempotent — safe to call from every post-auth layout mount and on app
   * foreground: an existing same-token socket is just nudged back to life,
   * a token change (account switch) tears down and rebuilds.
   */
  async connect() {
    if (this.connecting) return;
    this.connecting = true;
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;

      if (this.socket && this.currentToken === token) {
        // Same session — reconnect immediately if the OS suspended us rather
        // than waiting out socket.io's reconnection backoff.
        if (!this.socket.connected) this.socket.connect();
        return;
      }

      if (this.socket) {
        this.disconnect();
      }

      this.currentToken = token;
      console.log("🔌 Connecting to socket server:", config.socketUrl);

      this.socket = io(config.socketUrl, {
        auth: { token },
        // Allow the HTTP long-polling fallback (Socket.IO default: connect via
        // polling, then upgrade to WebSocket). WebSocket-only meant that on any
        // network that blocks/drops the WS upgrade — common on mobile carriers —
        // the socket never connected at all, so users got push notifications but
        // no in-app real-time messages until they reloaded the chat.
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: Infinity,
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

        // Let screens catch up on anything emitted while we were offline.
        this.notify("onConnected", undefined);
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

      this.socket.on("group:invite", (data) => {
        this.notify("onGroupInvite", data);
      });

      this.socket.on("group:removed", (data) => {
        this.notify("onGroupRemoved", data);
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

      this.socket.on("chat:pinnedMessage", (data) => {
        this.notify("onChatPinnedMessage", data);
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
    } finally {
      this.connecting = false;
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
      this.currentToken = null;
      // Keep `listeners` — mounted screens reuse their registrations when a
      // new socket connects (e.g. after switching accounts).
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
