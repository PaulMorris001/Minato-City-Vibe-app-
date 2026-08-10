/**
 * Media helpers — telling images and videos apart, and getting a still frame
 * for a video. Mirrors mobile/utils/media.ts; keep the two in step.
 *
 * Media arrays are plain lists of URL strings with no per-item type field.
 * That works because Cloudinary puts the kind in the delivery path —
 * `/video/upload/` vs `/image/upload/` — so the URL itself says what it is.
 */

const VIDEO_EXTENSION = /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i;

/** True when this URL points at a video rather than an image. */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes("/video/upload/") || VIDEO_EXTENSION.test(url);
}

/**
 * A still frame for a video, usable anywhere an <img> is expected (card
 * thumbnails). Cloudinary generates the poster on demand when the video's
 * extension is swapped for an image one. Returns null when no poster can be
 * derived — callers fall back to their normal no-image placeholder.
 */
export function videoPosterUrl(url?: string | null): string | null {
  if (!url || !isVideoUrl(url)) return null;
  if (!url.includes("/video/upload/")) return null;
  const [base] = url.split(/[?#]/);
  return base.replace(VIDEO_EXTENSION, ".jpg");
}
