import { Linking } from "react-native";
import { router } from "expo-router";

/**
 * Where an admin announcement's button (or tap) sends someone. Mirrors
 * APP_PATHS in the server's announcement.controller.js — the server only
 * accepts these, and this refuses anything else, so a stale or hand-typed
 * link can never push the router somewhere that doesn't exist.
 */
const APP_PATHS = [
  /^\/event\/[A-Za-z0-9_-]+$/,
  /^\/guide\/[A-Za-z0-9_-]+$/,
  /^\/public-events$/,
  /^\/birthday-raffle$/,
  /^\/\(tabs\)\/(home|bests|vendors)$/,
];

export type AnnouncementTarget = { kind: "path"; path: string } | { kind: "url"; url: string };

export function parseAnnouncementLink(link: unknown): AnnouncementTarget | null {
  if (typeof link !== "string") return null;
  const value = link.trim();
  if (/^https:\/\/\S+$/i.test(value)) return { kind: "url", url: value };
  // Someone who has entered belongs on their status page, the way the home
  // banner and the raffle popup route them; the landing page reads this flag
  // and forwards entrants on (see birthday-raffle/index.tsx).
  if (value === "/birthday-raffle") return { kind: "path", path: "/birthday-raffle?forwardEntrants=1" };
  if (APP_PATHS.some((re) => re.test(value))) return { kind: "path", path: value };
  return null;
}

/** Open a parsed target: in-app screens via the router, web links in the browser. */
export function openAnnouncementTarget(target: AnnouncementTarget) {
  if (target.kind === "url") {
    Linking.openURL(target.url).catch(() => {});
    return;
  }
  router.push(target.path as any);
}
