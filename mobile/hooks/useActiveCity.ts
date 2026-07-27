import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

// The one shared active browsing location every location-aware screen reads
// (home, vendors, best of, discover). Screens used to each poll
// SecureStore("selectedCity") independently on focus, which meant a change
// made while another screen was already mounted and focused (e.g. GPS
// resolving on the home feed after the user granted location permission,
// while they'd already switched to another tab) was invisible there until
// that screen's next focus — so it kept showing unfiltered results. This
// external store notifies every subscriber the instant the city changes, no
// matter which screen changed it, so mounted screens update immediately
// instead of only on their next focus.
type Listener = () => void;

let city: string | null = null;
const listeners = new Set<Listener>();

SecureStore.getItemAsync("selectedCity").then((saved) => {
  city = saved || null;
  listeners.forEach((listener) => listener());
});

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return city;
}

export function useActiveCity(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function setActiveCity(next: string | null): Promise<void> {
  city = next;
  listeners.forEach((listener) => listener());
  try {
    if (next) {
      await SecureStore.setItemAsync("selectedCity", next);
    } else {
      await SecureStore.deleteItemAsync("selectedCity");
    }
  } catch {}
}
