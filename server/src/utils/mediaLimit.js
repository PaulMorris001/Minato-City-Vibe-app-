/**
 * One media cap for the whole app.
 *
 * Every gallery — event photos, guide section media, vendor product shots,
 * catalogue category art — holds at most this many items, and each item is a
 * Cloudinary URL that may point at an image or a video (the delivery path says
 * which; see isVideoUrl in config/cloudinary.js).
 *
 * Clients enforce it too so the picker can grey out "Add" at the limit, but the
 * schemas are the backstop — nothing stopped an oversized array before this.
 */
export const MAX_MEDIA_ITEMS = 10;

/**
 * Mongoose validator for a `[String]` media array.
 *
 * @param {string} label - What to call the collection in the error message.
 * @param {number} max - Override the shared cap for a collection with its own.
 */
export function mediaArrayLimit(label = "Media", max = MAX_MEDIA_ITEMS) {
  return {
    validator: (items) => !Array.isArray(items) || items.length <= max,
    message: `${label} is limited to ${max} items`,
  };
}
