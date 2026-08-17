/**
 * Image Upload Utilities
 * Handles image picking and uploading to Cloudinary
 */

import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { BASE_URL } from '../constants/constants';
import { isVideoUrl } from './media';

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
    // Video. These must be labelled correctly or the server's file filter reads
    // the part as an image and Cloudinary rejects the upload.
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "m4v":
      return "video/x-m4v";
    case "mkv":
      return "video/x-matroska";
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
export function parseUploadError(status: number, text: string, fallback: string): string {
  if (!text) return statusHint(status) ?? fallback;
  if (text.trim().startsWith("{")) {
    try {
      const data = JSON.parse(text);
      return data.message || statusHint(status) || fallback;
    } catch {
      return statusHint(status) ?? fallback;
    }
  }
  // HTML or plain text — don't surface the markup, just hint at the cause.
  return statusHint(status) ?? fallback;
}

function statusHint(status: number): string | null {
  if (status === 413)
    return `That file is too large. Photos must be under ${mb(MAX_IMAGE_BYTES)} MB and videos under ${mb(MAX_VIDEO_BYTES)} MB.`;
  if (status === 415)
    return "Unsupported format. Try JPEG, PNG or HEIC photos, or MP4/MOV video.";
  return null;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    return parseUploadError(response.status, await response.text(), fallback);
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

/** Longest video we accept, in seconds. */
export const MAX_VIDEO_SECONDS = 60;
/** Largest video we accept. Mirrors MAX_VIDEO_BYTES in the server's upload middleware. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** Largest photo we accept. Mirrors MAX_IMAGE_BYTES on the server. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/**
 * Transcode quality for picked video (iOS only — Android's picker has no
 * equivalent and hands back the original).
 *
 * `Medium` is roughly 720p and cuts a 60s clip from hundreds of MB to tens,
 * which is the difference between an upload that finishes on mobile data and
 * one that doesn't. `quality` in the picker options only affects stills, so
 * without this videos were uploading at full capture resolution.
 */
export const VIDEO_PICKER_QUALITY = ImagePicker.UIImagePickerControllerQualityType.Medium;

/**
 * Why a picked asset can't be uploaded, or null when it's fine.
 *
 * Checked on the client because the alternative is silent: `videoMaxDuration`
 * only caps in-app *recording*, so a 5-minute clip picked from the library
 * sails through the picker, uploads for however long the connection takes, and
 * then 413s. Rejecting up front turns that into an immediate, specific message.
 *
 * `fileSize` and `duration` are both optional in the picker result — when the
 * OS doesn't report them we let the asset through and rely on the server's
 * limit, since guessing would block legitimate uploads.
 */
export function mediaRejectionReason(asset: ImagePicker.ImagePickerAsset): string | null {
  const isVideo = asset.type === "video" || isVideoUrl(asset.uri);

  if (isVideo) {
    // duration is milliseconds (see ImagePickerAsset.duration).
    if (typeof asset.duration === "number" && asset.duration > 0) {
      const seconds = Math.round(asset.duration / 1000);
      if (seconds > MAX_VIDEO_SECONDS) {
        return `That video is ${formatDuration(seconds)} long. Videos need to be ${MAX_VIDEO_SECONDS} seconds or shorter — trim it and try again.`;
      }
    }
    if (typeof asset.fileSize === "number" && asset.fileSize > MAX_VIDEO_BYTES) {
      return `That video is ${mb(asset.fileSize)} MB. Videos need to be under ${mb(MAX_VIDEO_BYTES)} MB.`;
    }
    return null;
  }

  if (typeof asset.fileSize === "number" && asset.fileSize > MAX_IMAGE_BYTES) {
    return `That photo is ${mb(asset.fileSize)} MB. Photos need to be under ${mb(MAX_IMAGE_BYTES)} MB.`;
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m} minute${m > 1 ? "s" : ""}`;
}

export interface PickMediaOptions {
  /** Also offer videos in the picker. Off by default — avatars and cover photos must stay stills. */
  allowVideos?: boolean;
  /** Cap the number of items the picker will hand back (iOS enforces it natively). */
  limit?: number;
}

/**
 * Pick multiple photos — and, with `allowVideos`, videos — from the device
 * library.
 *
 * `limit` is passed to the OS picker so the user is stopped at the cap while
 * selecting, rather than picking twelve and silently losing two. Callers should
 * still clamp the result: Android's picker doesn't always honour it.
 */
export async function pickMultipleImages(
  options: PickMediaOptions = {}
): Promise<string[]> {
  const { allowVideos = false, limit } = options;

  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera roll permissions to upload media.');
    return [];
  }

  // Pick media
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: allowVideos ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: true,
    ...(limit ? { selectionLimit: limit } : {}),
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoQuality: VIDEO_PICKER_QUALITY,
    quality: 0.8,
  });

  if (result.canceled || !result.assets) return [];

  // Reject oversized/overlong picks here rather than letting them fail at
  // upload. Valid items in the same selection are kept — losing four good
  // photos because the fifth was a long video would be worse than the error.
  const accepted: string[] = [];
  const rejections: string[] = [];
  for (const asset of result.assets) {
    const reason = mediaRejectionReason(asset);
    if (reason) rejections.push(reason);
    else accepted.push(asset.uri);
  }

  if (rejections.length) {
    Alert.alert(
      rejections.length === 1 ? "Can't add that file" : `Skipped ${rejections.length} files`,
      rejections.join("\n\n")
    );
  }

  return accepted;
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
  token: string,
  onProgress?: (fraction: number) => void
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

  // XMLHttpRequest rather than fetch: RN's fetch gives no upload progress
  // events, and a 100 MB video with no feedback looks identical to a hang.
  return new Promise<ImageUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/upload/image`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      // Deliberately not gated on `lengthComputable`: React Native's XHR does
      // not reliably set it for multipart bodies, and requiring it meant the
      // callback never fired and the bar sat at 0% for the whole upload.
      xhr.upload.onprogress = (e) => {
        if (e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          // Upload finished; anything after this is server-side processing.
          onProgress?.(1);
          resolve({ url: data.url, publicId: data.publicId });
        } catch {
          reject(new Error('The upload finished but the server response was unreadable.'));
        }
        return;
      }
      reject(new Error(parseUploadError(xhr.status, xhr.responseText, 'Failed to upload media')));
    };

    xhr.onerror = () =>
      reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Try again on a stronger connection.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    xhr.send(formData);
  });
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
 * Resolve a mixed list of media URIs to remote URLs: anything already hosted
 * (http...) is kept as-is, local file:// / data: URIs are uploaded. Handles
 * photos and videos alike — the server sniffs the resource type, and the
 * returned Cloudinary URL carries the kind. Preserves order. Used by forms that
 * mix already-saved media with newly-picked items.
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
