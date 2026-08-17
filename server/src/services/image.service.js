/**
 * Image Service
 * Handles image upload operations to Cloudinary
 */

import {
  uploadToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
  isVideoUrl,
} from "../config/cloudinary.js";
import { isVideoMimeType } from "../middleware/upload.middleware.js";

/**
 * Upload an image or video file to Cloudinary. Resource type is left to
 * Cloudinary ("auto") so a single endpoint handles mixed media — the returned
 * URL carries the kind (`/video/upload/` vs `/image/upload/`), which is how
 * every client tells them apart.
 * @param {Object} file - Multer file object
 * @param {string} folder - Folder to store the media in
 * @returns {Promise<Object>} - Upload result with URL and public_id
 */
export async function uploadImage(file, folder = "nightvibe") {
  if (!file) {
    throw new Error("No file provided");
  }

  // Pass the kind explicitly rather than letting Cloudinary sniff it. The
  // mimetype was already validated by the upload middleware, and an explicit
  // resource_type is what keeps the image-only upload transform off videos —
  // "auto" silently took the image path and forced a synchronous transcode.
  const resourceType = isVideoMimeType(file.mimetype) ? "video" : "image";
  const result = await uploadToCloudinary(file.buffer, folder, null, resourceType);

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    resourceType: result.resource_type,
    // Videos only: seconds, so callers can enforce a duration cap.
    duration: result.duration,
  };
}

/**
 * Upload multiple media files (images and/or videos) to Cloudinary
 * @param {Array} files - Array of multer file objects
 * @param {string} folder - Folder to store the media in
 * @returns {Promise<Array>} - Array of upload results
 */
export async function uploadMultipleImages(files, folder = "nightvibe") {
  if (!files || files.length === 0) {
    return [];
  }

  const uploadPromises = files.map((file) => uploadImage(file, folder));
  return Promise.all(uploadPromises);
}

/**
 * Upload a base64 encoded image to Cloudinary
 * @param {string} base64String - Base64 encoded image
 * @param {string} folder - Folder to store the image in
 * @returns {Promise<Object>} - Upload result with URL and public_id
 */
export async function uploadBase64Image(base64String, folder = "nightvibe") {
  if (!base64String) {
    throw new Error("No base64 string provided");
  }

  const result = await uploadBase64ToCloudinary(base64String, folder);

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    resourceType: result.resource_type,
    duration: result.duration,
  };
}

/**
 * Delete a media asset from Cloudinary
 * @param {string} urlOrPublicId - Cloudinary URL or public ID
 * @returns {Promise<void>}
 */
export async function deleteImage(urlOrPublicId) {
  if (!urlOrPublicId) {
    return;
  }

  // Videos live in a separate Cloudinary namespace, so the destroy call has to
  // name the right resource type or it silently no-ops. Read it off the URL
  // before extracting the id (which strips the delivery path).
  const resourceType = isVideoUrl(urlOrPublicId) ? "video" : "image";

  // Try to extract public ID if a URL was provided
  let publicId = urlOrPublicId;
  if (urlOrPublicId.includes("cloudinary.com")) {
    publicId = extractPublicId(urlOrPublicId);
  }

  if (!publicId) {
    console.error("Could not extract public ID from:", urlOrPublicId);
    return;
  }

  try {
    await deleteFromCloudinary(publicId, resourceType);
  } catch (error) {
    console.error("Error deleting image:", error);
    // Don't throw error, just log it
  }
}

/**
 * Replace an existing image with a new one
 * @param {string} oldImageUrl - URL or public ID of the old image to delete
 * @param {Object} newFile - New multer file object
 * @param {string} folder - Folder to store the new image in
 * @returns {Promise<Object>} - Upload result of new image
 */
export async function replaceImage(oldImageUrl, newFile, folder = "nightvibe") {
  // Upload new image first
  const newImage = await uploadImage(newFile, folder);

  // Delete old image (if it exists and is a Cloudinary URL)
  if (oldImageUrl) {
    try {
      await deleteImage(oldImageUrl);
    } catch (error) {
      console.error("Error deleting old image:", error);
      // Don't fail the operation if deletion fails
    }
  }

  return newImage;
}

export default {
  uploadImage,
  uploadMultipleImages,
  uploadBase64Image,
  deleteImage,
  replaceImage,
};
