/**
 * Cloudinary Configuration
 * Handles image uploads to Cloudinary
 */

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Create Cloudinary storage for multer
 * @param {string} folder - Folder name in Cloudinary (e.g., 'events', 'profiles')
 * @returns {CloudinaryStorage} - Configured Cloudinary storage
 */
export function createCloudinaryStorage(folder = "nightvibe") {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm", "m4v"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    },
  });
}

/**
 * The `q_auto,f_auto` eager transform is image-oriented — applying it to a
 * video upload makes Cloudinary transcode synchronously and the request can
 * time out. Delivery-time transforms (which is how the clients size media) work
 * for both, so uploads stay untransformed for video.
 */
const uploadTransformation = (resourceType) =>
  resourceType === "video" ? undefined : [{ quality: "auto", fetch_format: "auto" }];

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder to store the media in
 * @param {string} publicId - Optional custom public ID
 * @param {string} resourceType - "image", "video", or "auto" to let Cloudinary
 *   sniff the buffer (the default — callers pass mixed image/video media).
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export async function uploadToCloudinary(
  buffer,
  folder = "nightvibe",
  publicId = null,
  resourceType = "auto"
) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        public_id: publicId,
        transformation: uploadTransformation(resourceType),
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Upload a base64 data URI to Cloudinary
 * @param {string} base64String - Base64 encoded image/video string
 * @param {string} folder - Folder to store the media in
 * @param {string} publicId - Optional custom public ID
 * @param {string} resourceType - "image", "video", or "auto" (default)
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export async function uploadBase64ToCloudinary(
  base64String,
  folder = "nightvibe",
  publicId = null,
  resourceType = "auto"
) {
  const result = await cloudinary.uploader.upload(base64String, {
    folder: folder,
    resource_type: resourceType,
    public_id: publicId,
    transformation: uploadTransformation(resourceType),
  });

  return result;
}

/**
 * True for a Cloudinary (or plain file) URL that points at a video. Cloudinary
 * puts the kind in the delivery path — `/video/upload/` vs `/image/upload/` —
 * so the URL alone identifies the asset. That's what lets every media array in
 * the app stay a plain list of URL strings with no per-item type field.
 * The extension check covers non-Cloudinary URLs (seeded/imported media).
 */
export function isVideoUrl(url) {
  if (!url) return false;
  return /\/video\/upload\//.test(url) || /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i.test(url);
}

/**
 * Delete a media asset from Cloudinary
 * @param {string} publicId - The public ID of the asset to delete
 * @param {string} resourceType - "image" (default) or "video". Cloudinary keeps
 *   separate namespaces per resource type, so destroying a video with the
 *   default "image" type silently no-ops and leaks the asset.
 * @returns {Promise<Object>} - Cloudinary delete result
 */
export async function deleteFromCloudinary(publicId, resourceType = "image") {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
}

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} - Public ID or null
 */
export function extractPublicId(url) {
  if (!url || !url.includes("cloudinary.com")) {
    return null;
  }

  try {
    // Extract public ID from URL
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/folder/image.jpg
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex === -1) {
      return null;
    }

    // Get everything after 'upload/v123456789/'
    const pathParts = parts.slice(uploadIndex + 2); // Skip 'upload' and version
    const publicIdWithExt = pathParts.join("/");

    // Remove file extension
    const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf("."));

    return publicId;
  } catch (error) {
    console.error("Error extracting public ID:", error);
    return null;
  }
}

export { cloudinary };
export default cloudinary;
