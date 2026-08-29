import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Runs `onForeground` every time the app returns to the foreground —
 * mirrors the AppState "active" pattern already used by home.tsx,
 * ChatListScreen and UnreadContext. Register this in any screen that fetches
 * location- or time-sensitive data but has no other foreground refresh path
 * (no open socket listener, no useFocusEffect that would otherwise cover it,
 * since navigation focus doesn't change on an app-level background cycle).
 */
export function useRefreshOnForeground(onForeground: () => void) {
  // Ref so the effect below can stay a stable, one-time subscription while
  // still calling the latest closure (current city, current loader, etc.).
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") callbackRef.current();
    });
    return () => subscription.remove();
  }, []);
}
