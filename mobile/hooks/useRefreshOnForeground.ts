import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

const DEFAULT_MIN_BACKGROUND_MS = 60000;

/**
 * Re-fetches when the app returns to the foreground after sitting backgrounded
 * for at least `minBackgroundMs` (default 1 minute) — long enough that the
 * screen's data likely went stale, short enough to skip trivial taps out to
 * the notification shade or app switcher and back.
 */
export function useRefreshOnForeground(onForeground: () => void, minBackgroundMs = DEFAULT_MIN_BACKGROUND_MS) {
  const backgroundedAtRef = useRef<number | null>(null);
  // Always call the latest closure without needing to resubscribe every
  // render — callers pass an inline function that closes over current state.
  const onForegroundRef = useRef(onForeground);
  onForegroundRef.current = onForeground;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= minBackgroundMs) {
          onForegroundRef.current();
        }
      } else {
        backgroundedAtRef.current = Date.now();
      }
    });
    return () => subscription.remove();
  }, [minBackgroundMs]);
}
