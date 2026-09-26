import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";

// Same listings as the website's web/src/lib/app.ts.
const STORE_URL = Platform.select({
  android: "https://play.google.com/store/apps/details?id=com.ourcityvibe.app",
  default: "https://apps.apple.com/us/app/ourcityvibe/id6787367889",
});

/**
 * expo-store-review, loaded on first use rather than at import. Its native
 * module is resolved when the package is evaluated, so a top-level import
 * crashed every build made before it was added ("Cannot find native module
 * 'ExpoStoreReview'") at app start — this file is imported from screens.
 */
function loadStoreReview(): typeof import("expo-store-review") | null {
  try {
    return require("expo-store-review");
  } catch {
    return null;
  }
}

/**
 * When to ask someone to rate the app, and how to take them there.
 *
 * Both stores throttle the native review sheet on their own (iOS shows it at
 * most three times a year and silently no-ops after that), so the only thing
 * that actually controls whether a user is nagged is this gate. It is
 * device-wide rather than per-user on purpose: the review belongs to the store
 * account on the phone, so asking again after an account switch would be the
 * same person being asked twice.
 */

const PREFIX = "rate_app_";
const MOMENTS_KEY = `${PREFIX}moments`;
const ASKED_AT_KEY = `${PREFIX}asked_at`;
const SETTLED_KEY = `${PREFIX}settled`;

/** Good moments to earn before the prompt is allowed to appear. */
const MOMENTS_REQUIRED = 3;
/** Days of quiet owed to someone who said "Not now". */
const SNOOZE_DAYS = 60;

/**
 * Record a moment worth being asked about — a ticket bought, an event joined,
 * an event created. Called from the success path, never from a screen mount,
 * so the count measures things that went right rather than time spent.
 */
export async function markRatingMoment(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(MOMENTS_KEY);
    await AsyncStorage.setItem(MOMENTS_KEY, String((Number(raw) || 0) + 1));
  } catch {
    // Losing a count only delays the ask.
  }
}

/** Whether the prompt has earned its place right now. */
export async function shouldPromptForRating(): Promise<boolean> {
  try {
    const [settled, raw, askedAt] = await AsyncStorage.multiGet([
      SETTLED_KEY,
      MOMENTS_KEY,
      ASKED_AT_KEY,
    ]);
    if (settled[1]) return false;
    if ((Number(raw[1]) || 0) < MOMENTS_REQUIRED) return false;

    const last = Number(askedAt[1]) || 0;
    return Date.now() - last >= SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * "Not now" — stamp the ask and zero the counter, so coming back needs fresh
 * activity as well as the snooze expiring.
 */
export async function snoozeRatingPrompt(): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [ASKED_AT_KEY, String(Date.now())],
      [MOMENTS_KEY, "0"],
    ]);
  } catch {
    // Best-effort; the worst case is one repeat ask.
  }
}

/** Never ask again — they rated, or they asked not to be asked. */
export async function settleRatingPrompt(): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTLED_KEY, "1");
  } catch {
    // Best-effort.
  }
}

/**
 * Open the native in-app review sheet, falling back to the store listing.
 *
 * The fallback is not just for TestFlight: a build made before expo-store-review
 * was added has no native module, so `loadStoreReview()` returns null and the
 * hardcoded listing is the only way to the store.
 */
export async function openStoreReview(): Promise<void> {
  const StoreReview = loadStoreReview();
  try {
    if (StoreReview && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // The sheet refused — fall through to the link.
  }

  const url = StoreReview?.storeUrl() || STORE_URL;
  if (url) await Linking.openURL(url).catch(() => {});
}
