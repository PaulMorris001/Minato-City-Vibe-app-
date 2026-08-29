import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Shared "no thanks, for now" logic for the "Complete your setup" checklist
 * cards (vendor dashboard, client profile). Dismissing isn't permanent —
 * someone who waves it off today may still mean to verify or set up payouts
 * next week, so the dismissal expires and the card reappears as a reminder
 * rather than staying gone forever.
 */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

/**
 * Whether the checklist stored under `key` is still within its snooze
 * window. `key` should be namespaced per screen and per user — see call
 * sites — so one account's dismissal never leaks into another's, and
 * dismissing one checklist doesn't hide an unrelated one.
 */
export async function isChecklistSnoozed(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Snooze the checklist stored under `key` starting now. Best-effort. */
export function snoozeChecklist(key: string): void {
  AsyncStorage.setItem(key, String(Date.now())).catch(() => {});
}
