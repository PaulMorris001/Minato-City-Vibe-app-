/**
 * Helpers for the editorial Event Details screen.
 */

const BRAND_PALETTE = [
  "#A855F7",
  "#EC4899",
  "#22D3EE",
  "#F59E0B",
  "#7C3AED",
  "#C084FC",
];

/**
 * Deterministic per-vendor brand color, derived from `vendor._id` (or name as
 * a fallback). Stable across sessions; designers can replace with a real
 * `vendor.color` schema field later without touching the call sites.
 */
export function vendorAccentColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % BRAND_PALETTE.length;
  return BRAND_PALETTE[idx];
}

/**
 * Returns a short initials string from a display name / username.
 *   "Maya Liu"   -> "ML"
 *   "maya"       -> "M"
 *   "Alex Liu Park" -> "AP" (first + last word's first letter)
 *   ""           -> "?"
 * Used as the default avatar text for any user who hasn't uploaded a picture.
 */
export function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * "Williamsburg, Brooklyn, NY" -> "Brooklyn"
 * "Bushwick" -> "Bushwick"
 * Falls back to the trimmed full string when there's nothing better.
 */
export function neighborhoodFromLocation(location?: string | null): string {
  if (!location) return "";
  const segments = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 3) return segments[1];
  if (segments.length === 2) return segments[0];
  return segments[0] ?? "";
}

/**
 * Compact uppercase countdown label used in the hero chip.
 * Examples: "TONIGHT · 4H", "TOMORROW · 23H", "FRI · 3D", "STARTED", "ENDED",
 * "LIVE NOW" for events whose start has just passed.
 */
export function countdownLabel(dateIso: string | Date, now: Date = new Date()): string {
  const date = typeof dateIso === "string" ? new Date(dateIso) : dateIso;
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const mins = Math.floor(absMs / 60000);
  const hours = Math.floor(absMs / 3600000);
  const days = Math.floor(absMs / 86400000);

  if (diffMs < 0) {
    // event has started or passed
    if (hours < 4) return "LIVE NOW";
    if (days < 1) return "ENDED";
    return `ENDED · ${days}D AGO`;
  }
  if (mins < 60) return `STARTING · ${Math.max(mins, 1)}M`;
  // Same calendar day?
  const isSameDay =
    date.toDateString() === now.toDateString();
  if (isSameDay) return `TONIGHT · ${hours}H`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `TOMORROW · ${hours}H`;
  if (days < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
    return `${weekday} · ${days}D`;
  }
  const short = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return short.toUpperCase();
}

/**
 * "Sat, Aug 12 · 9:00 PM" style line for the hero meta row.
 */
export function heroDateLine(dateIso: string | Date): string {
  const date = typeof dateIso === "string" ? new Date(dateIso) : dateIso;
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * Picks a single representative emoji for the hero watermark based on the
 * event's title. Pure heuristic — designers can switch this to a per-event
 * field later if they want explicit control.
 */
const EMOJI_BUCKETS: Array<[RegExp, string]> = [
  [/(rooftop|sunset|sundown)/i, "🌇"],
  [/(rave|techno|club|bass|warehouse|dj)/i, "🎛️"],
  [/(jazz|listen|vinyl|record)/i, "🎧"],
  [/(theatre|theater|cabaret|drag|show)/i, "🎭"],
  [/(cocktail|bar|martini|drinks|happy hour)/i, "🍸"],
  [/(food|tasting|brunch|dinner|supper)/i, "🍽️"],
  [/(beach|pool|island|tropical)/i, "🌴"],
  [/(art|gallery|exhibit)/i, "🎨"],
  [/(music|concert|live)/i, "🎤"],
];

export function heroEmojiFor(title?: string | null): string {
  if (!title) return "✨";
  for (const [pat, emoji] of EMOJI_BUCKETS) {
    if (pat.test(title)) return emoji;
  }
  return "✨";
}
