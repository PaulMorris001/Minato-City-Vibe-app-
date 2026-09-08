import { useEffect, useState } from "react";
import { AppState } from "react-native";

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function computeCountdown(deadlineMs: number): Countdown {
  const totalMs = Math.max(0, deadlineMs - Date.now());
  return {
    days: Math.floor(totalMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor(totalMs / (1000 * 60 * 60)) % 24,
    minutes: Math.floor(totalMs / (1000 * 60)) % 60,
    seconds: Math.floor(totalMs / 1000) % 60,
    expired: totalMs <= 0,
  };
}

/**
 * Ticks down to `deadlineMs` once a second, for the raffle campaign clock.
 * Pass `null` before the real deadline has loaded from the server — returns
 * `null` in that case so callers show a static placeholder instead of
 * counting down from "now" (which would flash a wrong number).
 *
 * Recomputes immediately on foreground: iOS/Android suspend JS timers while
 * the app is backgrounded, so the running `setInterval` doesn't fire while
 * it's away — without this, coming back after a while shows whatever value
 * was on screen when it was backgrounded until the next natural tick.
 */
export function useCountdown(deadlineMs: number | null): Countdown | null {
  const [countdown, setCountdown] = useState<Countdown | null>(() =>
    deadlineMs == null ? null : computeCountdown(deadlineMs)
  );

  useEffect(() => {
    if (deadlineMs == null) {
      setCountdown(null);
      return;
    }

    const tick = () => setCountdown(computeCountdown(deadlineMs));
    tick(); // sync immediately — otherwise the old deadline's value lingers for a second
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [deadlineMs]);

  return countdown;
}
