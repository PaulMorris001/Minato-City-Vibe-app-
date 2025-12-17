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
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    },
  });
}

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder to store the image in
 * @param {string} publicId - Optional custom public ID
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export async function uploadToCloudinary(buffer, folder = "nightvibe", publicId = null) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "image",
        public_id: publicId,
        transformation: [{ quality: "auto", fetch_format: "auto" }],
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
 * Upload base64 image to Cloudinary
 * @param {string} base64String - Base64 encoded image string
 * @param {string} folder - Folder to store the image in
 * @param {string} publicId - Optional custom public ID
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export async function uploadBase64ToCloudinary(base64String, folder = "nightvibe", publicId = null) {
  const result = await cloudinary.uploader.upload(base64String, {
    folder: folder,
    resource_type: "image",
    public_id: publicId,
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  });

  return result;
}

/**
 * Delete an image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} - Cloudinary delete result
 */
export async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
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
