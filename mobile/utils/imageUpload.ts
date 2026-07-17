/**
 * Image Upload Utilities
 * Handles image picking and uploading to Cloudinary
 */

import * as ImagePicker from 'expo-image-picker';
import { BASE_URL } from '../constants/constants';

export interface ImageUploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
}

/**
 * Map a file extension to a real MIME type. `image/jpg` (which some clients
 * emit) is not a registered type — the canonical form is `image/jpeg`. iOS
 * defaults to HEIC, so we map that explicitly too.
 */
function mimeFromExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = (match?.[1] ?? "").toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

/**
 * Pull a JSON `message` out of a Response, or fall back to a synthesized one
 * when the server returned HTML (Express default error page) or empty body.
 * Without this, `response.json()` throws `Unexpected character: <` and the
 * caller sees an opaque parse error instead of the actual upload failure.
 */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    if (text.trim().startsWith("{")) {
      try {
        const data = JSON.parse(text);
        return data.message || fallback;
      } catch {
        return fallback;
      }
    }
    // HTML or plain text — don't surface the markup, just hint at the cause.
    if (response.status === 413) return "That image is too large. Pick something under 10 MB.";
    if (response.status === 415) return "Unsupported image format. Try JPEG, PNG, or HEIC.";
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Pick an image from the device library
 */
export async function pickImage(): Promise<string | null> {
  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera roll permissions to upload images.');
    return null;
  }

  // Pick image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.8, // Compress to reduce file size
  });

  if (!result.canceled && result.assets && result.assets[0]) {
    return result.assets[0].uri;
  }

  return null;
}

/**
 * Pick multiple images from the device library
 */
export async function pickMultipleImages(): Promise<string[]> {
  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera roll permissions to upload images.');
    return [];
  }

  // Pick images
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
  });

  if (!result.canceled && result.assets) {
    return result.assets.map(asset => asset.uri);
  }

  return [];
}

/**
 * Take a photo with the camera
 */
export async function takePhoto(): Promise<string | null> {
  // Request permissions
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera permissions to take photos.');
    return null;
  }

  // Take photo
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 0.8,
  });

  if (!result.canceled && result.assets && result.assets[0]) {
    return result.assets[0].uri;
  }

  return null;
}

/**
 * Upload image to Cloudinary (returns Cloudinary URL and metadata)
 */
export async function uploadImage(
  imageUri: string,
  folder: string = 'nightvibe',
  token: string
): Promise<ImageUploadResult> {
  const formData = new FormData();

  const filename = imageUri.split('/').pop() || 'image.jpg';
  const type = mimeFromExtension(filename);

  formData.append('image', {
    uri: imageUri,
    name: filename,
    type,
  } as any);
  formData.append('folder', folder);

  const response = await fetch(`${BASE_URL}/upload/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const msg = await readErrorMessage(response, 'Failed to upload image');
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    url: data.url,
    publicId: data.publicId,
  };
}

/**
 * Upload multiple images to Cloudinary
 */
export async function uploadMultipleImages(
  imageUris: string[],
  folder: string = 'nightvibe',
  token: string
): Promise<ImageUploadResult[]> {
  const formData = new FormData();

  imageUris.forEach((uri, index) => {
    const filename = uri.split('/').pop() || `image-${index}.jpg`;
    const type = mimeFromExtension(filename);

    formData.append('images', {
      uri,
      name: filename,
      type,
    } as any);
  });

  formData.append('folder', folder);

  const response = await fetch(`${BASE_URL}/upload/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const msg = await readErrorMessage(response, 'Failed to upload images');
    throw new Error(msg);
  }

  const data = await response.json();
  return data.images.map((img: any) => ({
    url: img.url,
    publicId: img.publicId,
    width: img.width,
    height: img.height,
    format: img.format,
  }));
}

/**
 * Upload base64 image to Cloudinary
 */
export async function uploadBase64Image(
  base64String: string,
  folder: string = 'nightvibe',
  token: string
): Promise<ImageUploadResult> {
  const response = await fetch(`${BASE_URL}/upload/base64`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64: base64String,
      folder,
    }),
  });

  if (!response.ok) {
    const msg = await readErrorMessage(response, 'Failed to upload image');
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    url: data.url,
    publicId: data.publicId,
  };
}

/**
 * Resolve a mixed list of image URIs to remote URLs: anything already hosted
 * (http...) is kept as-is, local file:// / data: URIs are uploaded. Preserves
 * order. Used by forms that mix already-saved photos with newly-picked ones.
 */
export async function resolveImageUrls(
  uris: string[],
  folder: string,
  token: string
): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) {
    if (!uri) continue;
    if (uri.startsWith("http")) {
      out.push(uri);
    } else {
      const result = await uploadImage(uri, folder, token);
      out.push(result.url);
    }
  }
  return out;
}

/**
 * Transform Cloudinary URL for different sizes and effects
 */
export function transformCloudinaryUrl(
  url: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    crop?: 'fill' | 'fit' | 'crop' | 'scale' | 'thumb';
    circle?: boolean;
    gravity?: 'auto' | 'face' | 'center';
    /**
     * Force an output format instead of f_auto. Use 'png' when the consumer
     * needs a real alpha channel (e.g. circular tab-bar icons) — f_auto can
     * negotiate down to JPEG, which fills transparent corners.
     */
    format?: 'png' | 'jpg' | 'webp';
  }
): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const transformations: string[] = [];

  if (options?.width) transformations.push(`w_${options.width}`);
  if (options?.height) transformations.push(`h_${options.height}`);
  if (options?.crop) transformations.push(`c_${options.crop}`);
  if (options?.gravity) transformations.push(`g_${options.gravity}`);
  if (options?.quality) transformations.push(`q_${options.quality}`);
  if (options?.circle) transformations.push('r_max');

  // Always add auto format and quality if not specified
  if (!options?.quality) {
    transformations.push('q_auto');
  }
  transformations.push(options?.format ? `f_${options.format}` : 'f_auto');

  if (transformations.length === 0) {
    return url;
  }

  return url.replace('/upload/', `/upload/${transformations.join(',')}/`);
}

/**
 * Get thumbnail URL (300x300, circular)
 */
export function getThumbnailUrl(url: string): string {
  return transformCloudinaryUrl(url, {
    width: 300,
    height: 300,
    crop: 'fill',
    gravity: 'face',
    circle: true,
  });
}

/**
 * Circular-bitmap avatar URL for consumers that can't mask the image
 * themselves (e.g. native tab-bar icons — UIKit renders the bitmap as-is).
 * The circle has to be baked into the file, so this only works for hosts
 * with a circular-crop transform:
 *   - Cloudinary: r_max + f_png (f_auto could negotiate down to JPEG, which
 *     has no alpha and fills the corners)
 *   - Google avatars (lh3.googleusercontent.com): the `-cc` sizing param
 * Returns null for any other host — callers must fall back to a non-photo
 * icon rather than render a square.
 */
export function getCircularAvatarUrl(url: string, sizePx: number): string | null {
  if (!url) return null;
  if (url.includes('cloudinary.com')) {
    return transformCloudinaryUrl(url, {
      width: sizePx,
      height: sizePx,
      crop: 'fill',
      gravity: 'face',
      circle: true,
      format: 'png',
    });
  }
  if (/^https:\/\/lh\d+\.googleusercontent\.com\//.test(url)) {
    // Replace any existing sizing suffix (e.g. "=s96-c") with a circular crop.
    const base = url.replace(/=[^=/]*$/, '');
    return `${base}=s${sizePx}-cc`;
  }
  return null;
}

/**
 * Get profile picture URL (circular, auto-cropped to face)
 */
export function getProfilePictureUrl(url: string, size: number = 200): string {
  return transformCloudinaryUrl(url, {
    width: size,
    height: size,
    crop: 'fill',
    gravity: 'face',
    circle: true,
  });
}

/**
 * Get card image URL (optimized for cards/lists)
 */
export function getCardImageUrl(url: string, width: number = 400): string {
  return transformCloudinaryUrl(url, {
    width,
    crop: 'fill',
    quality: 80,
  });
}

/**
 * Get full image URL (optimized quality)
 */
export function getFullImageUrl(url: string): string {
  return transformCloudinaryUrl(url, {
    quality: 85,
  });
}

/**
 * Helper function to handle image upload with loading state
 */
export async function pickAndUploadImage(
  folder: string,
  token: string,
  onProgress?: (progress: string) => void
): Promise<string | null> {
  try {
    onProgress?.('Selecting image...');
    const uri = await pickImage();

    if (!uri) {
      return null;
    }

    onProgress?.('Uploading...');
    const result = await uploadImage(uri, folder, token);

    onProgress?.('Upload complete!');
    return result.url;
  } catch (error: any) {
    console.error('Upload error:', error);
    onProgress?.('Upload failed');
    throw error;
  }
}

/**
 * Helper function to take photo and upload
 */
export async function takePhotoAndUpload(
  folder: string,
  token: string,
  onProgress?: (progress: string) => void
): Promise<string | null> {
  try {
    onProgress?.('Opening camera...');
    const uri = await takePhoto();

    if (!uri) {
      return null;
    }

    onProgress?.('Uploading...');
    const result = await uploadImage(uri, folder, token);

    onProgress?.('Upload complete!');
    return result.url;
  } catch (error: any) {
    console.error('Upload error:', error);
    onProgress?.('Upload failed');
    throw error;
  }
}

export default {
  pickImage,
  pickMultipleImages,
  takePhoto,
  uploadImage,
  uploadMultipleImages,
  uploadBase64Image,
  transformCloudinaryUrl,
  getThumbnailUrl,
  getProfilePictureUrl,
  getCardImageUrl,
  getFullImageUrl,
  pickAndUploadImage,
  takePhotoAndUpload,
};
