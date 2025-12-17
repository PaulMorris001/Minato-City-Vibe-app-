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
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
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
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    allowsEditing: true,
    aspect: [4, 3],
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

  // Extract filename from URI
  const filename = imageUri.split('/').pop() || 'image.jpg';

  // Determine file type
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  // Append image to form data
  formData.append('image', {
    uri: imageUri,
    name: filename,
    type,
  } as any);

  formData.append('folder', folder);

  const response = await fetch(`${BASE_URL}/upload/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload image');
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
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

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
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload images');
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
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64: base64String,
      folder,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload image');
  }

  const data = await response.json();
  return {
    url: data.url,
    publicId: data.publicId,
  };
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
  transformations.push('f_auto');

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
