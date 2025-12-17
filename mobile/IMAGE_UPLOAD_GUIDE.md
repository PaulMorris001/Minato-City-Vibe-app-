# Image Upload Guide - Mobile App

Complete guide for uploading images from your React Native/Expo app to Cloudinary.

## Quick Start

### 1. Install Dependencies

```bash
npx expo install expo-image-picker
```

### 2. Create Image Upload Utility

Create `mobile/utils/imageUpload.ts`:

```typescript
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../constants/constants';

/**
 * Pick an image from the device library
 */
export async function pickImage() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera roll permissions!');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (!result.canceled && result.assets[0]) {
    return result.assets[0].uri;
  }

  return null;
}

/**
 * Take a photo with camera
 */
export async function takePhoto() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== 'granted') {
    alert('Sorry, we need camera permissions!');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (!result.canceled && result.assets[0]) {
    return result.assets[0].uri;
  }

  return null;
}

/**
 * Upload image to Cloudinary (returns URL)
 */
export async function uploadImage(
  imageUri: string,
  folder: string = 'nightvibe',
  token: string
): Promise<string> {
  const formData = new FormData();

  const filename = imageUri.split('/').pop() || 'image.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  formData.append('image', {
    uri: imageUri,
    name: filename,
    type,
  } as any);

  formData.append('folder', folder);

  const response = await fetch(`${API_URL}/upload/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }

  const data = await response.json();
  return data.url; // Cloudinary URL
}

/**
 * Upload multiple images
 */
export async function uploadMultipleImages(
  imageUris: string[],
  folder: string = 'nightvibe',
  token: string
): Promise<string[]> {
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

  const response = await fetch(`${API_URL}/upload/images`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }

  const data = await response.json();
  return data.images.map((img: any) => img.url);
}
```

## Usage Examples

### Example 1: Upload Event Image

```typescript
import React, { useState } from 'react';
import { View, Button, Image, ActivityIndicator } from 'react-native';
import { pickImage, uploadImage } from '../utils/imageUpload';
import { useAuth } from '../context/AuthContext';

export default function CreateEventScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { token } = useAuth();

  const handlePickAndUpload = async () => {
    // Pick image
    const uri = await pickImage();
    if (!uri || !token) return;

    setImageUri(uri);
    setUploading(true);

    try {
      // Upload to Cloudinary
      const url = await uploadImage(uri, 'events', token);
      setCloudinaryUrl(url);
      console.log('Uploaded to:', url);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateEvent = async () => {
    const eventData = {
      title: 'My Event',
      date: new Date(),
      location: 'New York',
      image: cloudinaryUrl, // Use Cloudinary URL
      description: 'Event description',
      isPublic: true,
    };

    // Call your API to create event
    // await createEvent(eventData);
  };

  return (
    <View>
      <Button title="Pick & Upload Image" onPress={handlePickAndUpload} />

      {imageUri && (
        <Image source={{ uri: imageUri }} style={{ width: 200, height: 200 }} />
      )}

      {uploading && <ActivityIndicator />}

      {cloudinaryUrl && (
        <>
          <Text>✅ Uploaded to Cloudinary</Text>
          <Button title="Create Event" onPress={handleCreateEvent} />
        </>
      )}
    </View>
  );
}
```

### Example 2: Update Profile Picture

```typescript
import { pickImage, uploadImage } from '../utils/imageUpload';

const updateProfilePicture = async () => {
  const uri = await pickImage();
  if (!uri || !token) return;

  setLoading(true);
  try {
    // Upload to Cloudinary
    const cloudinaryUrl = await uploadImage(uri, 'profiles', token);

    // Update user profile
    const response = await fetch(`${API_URL}/update-profile-picture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profilePicture: cloudinaryUrl }),
    });

    if (response.ok) {
      setProfilePicture(cloudinaryUrl);
      alert('Profile picture updated!');
    }
  } catch (error) {
    alert('Failed to update profile picture');
  } finally {
    setLoading(false);
  }
};
```

### Example 3: Upload Multiple Vendor Images

```typescript
import { uploadMultipleImages } from '../utils/imageUpload';

const uploadVendorImages = async () => {
  // Pick multiple images
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
  });

  if (result.canceled || !result.assets) return;

  const imageUris = result.assets.map(asset => asset.uri);

  setLoading(true);
  try {
    const cloudinaryUrls = await uploadMultipleImages(imageUris, 'vendors', token);
    console.log('Uploaded images:', cloudinaryUrls);

    // Use these URLs when creating/updating vendor
    // await updateVendor({ images: cloudinaryUrls });
  } catch (error) {
    alert('Failed to upload images');
  } finally {
    setLoading(false);
  }
};
```

## Folder Organization

Use appropriate folders for different image types:

```typescript
// Events
await uploadImage(uri, 'events', token);

// User profiles
await uploadImage(uri, 'profiles', token);

// Vendor/business images
await uploadImage(uri, 'vendors', token);

// General/other images
await uploadImage(uri, 'nightvibe', token);
```

## Image Transformations (Bonus!)

Cloudinary allows you to transform images on-the-fly:

```typescript
/**
 * Transform Cloudinary URL for different sizes
 */
export function getImageUrl(url: string, options?: {
  width?: number;
  height?: number;
  quality?: number;
  crop?: 'fill' | 'fit' | 'crop' | 'scale';
  circle?: boolean;
}) {
  if (!url || !url.includes('cloudinary.com')) return url;

  const transformations = [];

  if (options?.width) transformations.push(`w_${options.width}`);
  if (options?.height) transformations.push(`h_${options.height}`);
  if (options?.crop) transformations.push(`c_${options.crop}`);
  if (options?.quality) transformations.push(`q_${options.quality}`);
  if (options?.circle) transformations.push('r_max');

  if (transformations.length === 0) return url;

  return url.replace('/upload/', `/upload/${transformations.join(',')}/`);
}

// Usage examples:

// Thumbnail (300x300, circular)
const thumbnail = getImageUrl(profilePicture, {
  width: 300,
  height: 300,
  crop: 'fill',
  circle: true,
});

// Event card image (800x600)
const cardImage = getImageUrl(eventImage, {
  width: 800,
  height: 600,
  crop: 'fill',
  quality: 80,
});

// Full size but optimized
const optimized = getImageUrl(originalImage, {
  quality: 85,
});
```

### Use Transformations in Components

```typescript
import { Image } from 'react-native';
import { getImageUrl } from '../utils/imageUpload';

// Profile picture (circular thumbnail)
<Image
  source={{ uri: getImageUrl(user.profilePicture, {
    width: 100,
    height: 100,
    crop: 'fill',
    circle: true,
  })}}
  style={{ width: 100, height: 100, borderRadius: 50 }}
/>

// Event card image
<Image
  source={{ uri: getImageUrl(event.image, {
    width: 400,
    height: 300,
    crop: 'fill',
  })}}
  style={{ width: '100%', height: 200 }}
/>
```

## Image Optimization Tips

### 1. Compress Before Upload

```typescript
const result = await ImagePicker.launchImageLibraryAsync({
  quality: 0.7, // 70% quality (reduces file size)
  allowsEditing: true,
});
```

### 2. Use expo-image for Better Caching

```bash
npx expo install expo-image
```

```typescript
import { Image } from 'expo-image';

<Image
  source={{ uri: cloudinaryUrl }}
  style={{ width: 200, height: 200 }}
  contentFit="cover"
  transition={200}
  cachePolicy="memory-disk"
/>
```

### 3. Show Upload Progress

```typescript
const uploadWithProgress = async (uri: string) => {
  const formData = new FormData();
  // ... setup formData

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        setUploadProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      const response = JSON.parse(xhr.responseText);
      resolve(response.url);
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', `${API_URL}/upload/image`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
};
```

## Error Handling

```typescript
const handleImageUpload = async (uri: string) => {
  try {
    const url = await uploadImage(uri, 'events', token);
    return url;
  } catch (error: any) {
    if (error.message.includes('Invalid file type')) {
      alert('Please select a valid image (JPEG, PNG, GIF, WebP)');
    } else if (error.message.includes('File size')) {
      alert('Image too large. Max 5MB allowed.');
    } else if (error.message.includes('401')) {
      alert('Session expired. Please login again.');
      // Navigate to login
    } else {
      alert('Failed to upload. Please try again.');
    }
    return null;
  }
};
```

## Complete Example Component

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { pickImage, takePhoto, uploadImage } from '../utils/imageUpload';
import { useAuth } from '../context/AuthContext';

export default function ImageUploadComponent() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { token } = useAuth();

  const handlePickImage = async () => {
    const uri = await pickImage();
    if (uri) await handleUpload(uri);
  };

  const handleTakePhoto = async () => {
    const uri = await takePhoto();
    if (uri) await handleUpload(uri);
  };

  const handleUpload = async (uri: string) => {
    if (!token) return;

    setImageUri(uri);
    setUploading(true);
    setProgress(0);

    try {
      const url = await uploadImage(uri, 'events', token);
      setCloudinaryUrl(url);
      setProgress(100);
      console.log('Uploaded to Cloudinary:', url);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
      setImageUri(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={handlePickImage}>
        <Text style={styles.buttonText}>Pick from Gallery</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </TouchableOpacity>

      {imageUri && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} />
        </View>
      )}

      {uploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>Uploading... {Math.round(progress)}%</Text>
        </View>
      )}

      {cloudinaryUrl && !uploading && (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>✅ Uploaded to Cloudinary</Text>
          <Text style={styles.urlText}>{cloudinaryUrl}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  image: {
    width: 300,
    height: 300,
    borderRadius: 8,
  },
  uploadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  successContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 5,
  },
  urlText: {
    fontSize: 12,
    color: '#666',
  },
});
```

## Common Issues

### Issue: "Network request failed"
- Check if backend server is running
- Verify API_URL in constants
- Check if using correct token

### Issue: "Permissions denied"
- Request permissions before accessing camera/gallery
- Check app.json for permission configurations:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow NightVibe to access your photos."
        }
      ]
    ]
  }
}
```

### Issue: Images not displaying
- Check if Cloudinary URL is valid
- Verify internet connection
- Use console.log to debug returned URL

## Testing Checklist

- [ ] Pick image from gallery
- [ ] Take photo with camera
- [ ] Upload single image
- [ ] Upload multiple images
- [ ] Handle upload errors
- [ ] Test with slow network
- [ ] Test without network connection
- [ ] Test with large images
- [ ] Test with different image formats (JPEG, PNG, GIF)

## Next Steps

- Implement image cropping
- Add image filters
- Implement image caching
- Add retry logic for failed uploads
- Implement offline queue for uploads
