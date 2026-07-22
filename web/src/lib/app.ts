/**
 * Mobile app store links. Kept here (rather than inline) because the website
 * pushes people to the app from several places: the nav, the events feed, the
 * post-purchase screen and every profile page.
 *
 * The URLs match the ones already used on the marketing landing page
 * (src/pages/Landing.tsx).
 */
export const APP_STORE_URL = "https://apps.apple.com/us/app/ourcityvibe/id6787367889";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.ourcityvibe.app";

/** Best-guess store link for the visitor's device (used by single-button CTAs). */
export function storeUrlForDevice(): string {
  if (typeof navigator === "undefined") return APP_STORE_URL;
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return PLAY_STORE_URL;
  if (/iPad|iPhone|iPod/.test(ua)) return APP_STORE_URL;
  return APP_STORE_URL;
}
