/**
 * Media helpers — telling images and videos apart, and getting a still frame
 * for a video.
 *
 * Every media collection in the app (event galleries, guide sections, vendor
 * products, catalogue categories) is a plain list of URL strings with no
 * per-item type field. That works because Cloudinary puts the kind in the
 * delivery path — `/video/upload/` vs `/image/upload/` — so the URL itself
 * says what it is. Keeping the arrays as `string[]` is why adding video needed
 * no schema migration and why the thousands of existing image-only rows keep
 * working untouched.
 *
 * Local URIs (file://, content://, ph://) are handled too: those come straight
 * from the picker before upload, and are matched on extension.
 */

const VIDEO_EXTENSION = /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i;

/** True when this URL/URI points at a video rather than an image. */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes("/video/upload/") || VIDEO_EXTENSION.test(url);
}

/**
 * A still frame for a video, usable anywhere an <Image> is expected (list
 * thumbnails, card covers). Cloudinary generates the poster on demand when the
 * video's extension is swapped for an image one.
 *
 * Returns null for a video we can't derive a poster from — notably a local URI
 * that hasn't been uploaded yet. Callers must fall back to a placeholder tile
 * rather than passing null to <Image>.
 */
export function videoPosterUrl(url?: string | null): string | null {
  if (!url || !isVideoUrl(url)) return null;
  if (!url.includes("/video/upload/")) return null;
  // Strip any query/fragment before swapping the extension so we don't produce
  // "clip.jpg?v=2.mp4".
  const [base] = url.split(/[?#]/);
  return base.replace(VIDEO_EXTENSION, ".jpg");
}

/**
 * The media list for a guide section.
 *
 * Sections used to hold exactly one `image`; they now hold a `media` array.
 * Guides written before that change still have only `image` in the database, so
 * anything rendering or editing a section reads through here.
 */
export function sectionMedia(section?: {
  media?: string[] | null;
  image?: string | null;
}): string[] {
  if (!section) return [];
  if (section.media?.length) return section.media.filter(Boolean);
  return section.image ? [section.image] : [];
}

/** Shared cap for every media collection — mirrors MAX_MEDIA_ITEMS on the server. */
export const MAX_MEDIA_ITEMS = 10;
