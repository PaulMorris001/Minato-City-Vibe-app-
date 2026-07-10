import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { BASE_URL } from "@/constants/constants";
import socketService from "@/services/socket.service";

interface UnreadContextType {
  /** Unread client-mode chat messages — drives the chat tab badge. */
  totalUnread: number;
  /** Unread vendor-mode chat messages — drives the vendor dashboard badge. */
  vendorUnread: number;
  /** Unread in-app notifications — drives the notifications surfaces. */
  notifUnread: number;
  /** Force a re-fetch of both counts (call after marking things read). */
  refreshUnread: () => void;
}

const UnreadContext = createContext<UnreadContextType>({
  totalUnread: 0,
  vendorUnread: 0,
  notifUnread: 0,
  refreshUnread: () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [chatUnread, setChatUnread] = useState(0);
  const [vendorUnread, setVendorUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);
  const chatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getAuth = useCallback(async () => {
    const token = await SecureStore.getItemAsync("token");
    const userJson = await SecureStore.getItemAsync("user");
    if (!token || !userJson) return null;
    const user = JSON.parse(userJson);
    currentUserIdRef.current = user.id;
    return { token, userId: user.id as string };
  }, []);

  // The counts are always read from the server (the source of truth) rather
  // than guessed optimistically — that's what kept drifting out of sync.
  const refreshChats = useCallback(async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const res = await fetch(`${BASE_URL}/chats`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const chats: any[] = data.chats || [];
      // One no-mode fetch returns everything; split client vs vendor locally.
      // A chat counts as "vendor" for this user only when they are the business
      // side of it — their own inquiries to vendors stay in the client bucket.
      let clientTotal = 0;
      let vendorTotal = 0;
      for (const chat of chats) {
        const unreadObj = (chat.unreadCount as Record<string, number>) || {};
        const count = unreadObj[auth.userId] || 0;
        const vendorUserId = chat.vendorUser?._id || chat.vendorUser;
        if (chat.contextType === "vendor" && vendorUserId === auth.userId) {
          vendorTotal += count;
        } else {
          clientTotal += count;
        }
      }
      setChatUnread(clientTotal);
      setVendorUnread(vendorTotal);
    } catch {}
  }, [getAuth]);

  const refreshNotifs = useCallback(async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const notifs: any[] = data.notifications || [];
      setNotifUnread(notifs.filter((n) => !n.read).length);
    } catch {}
  }, [getAuth]);

  const refreshUnread = useCallback(() => {
    refreshChats();
    refreshNotifs();
  }, [refreshChats, refreshNotifs]);

  // Coalesce bursts of incoming messages into a single server read.
  const scheduleChatRefresh = useCallback(() => {
    if (chatTimer.current) clearTimeout(chatTimer.current);
    chatTimer.current = setTimeout(refreshChats, 600);
  }, [refreshChats]);

  // App icon badge = unread chats (both modes) + unread notifications. This
  // context is the single writer so the badge can't be left stale by an
  // individual screen.
  useEffect(() => {
    Notifications.setBadgeCountAsync(chatUnread + vendorUnread + notifUnread).catch(() => {});
  }, [chatUnread, vendorUnread, notifUnread]);

  useEffect(() => {
    refreshUnread();

    // NOTE: socketService.on takes (id, eventsObject). The previous version
    // passed a bare function, so the listeners never fired and the chat badge
    // froze at its launch value.
    socketService.on("unread-context", {
      onNewMessage: (message: any) => {
        if (message?.sender?._id !== currentUserIdRef.current) scheduleChatRefresh();
      },
      onMessageRead: () => scheduleChatRefresh(),
      onEventInvite: () => refreshNotifs(),
      onFollowNew: () => refreshNotifs(),
    });

    // Reconcile whenever the app returns to the foreground (covers pushes that
    // arrived while backgrounded, since our pushes don't carry a badge count).
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshUnread();
    });

    return () => {
      socketService.off("unread-context");
      sub.remove();
      if (chatTimer.current) clearTimeout(chatTimer.current);
    };
  }, [refreshUnread, refreshNotifs, scheduleChatRefresh]);

  return (
    <UnreadContext.Provider value={{ totalUnread: chatUnread, vendorUnread, notifUnread, refreshUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
