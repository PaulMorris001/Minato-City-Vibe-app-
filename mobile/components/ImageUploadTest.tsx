/**
 * Image Upload Test Component
 *
 * This is a test component to verify image upload functionality.
 * You can add this to any screen to test the image upload flow.
 *
 * Usage:
 * import ImageUploadTest from '@/components/ImageUploadTest';
 * <ImageUploadTest />
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import {
  pickImage,
  takePhoto,
  uploadImage,
  pickAndUploadImage,
  getProfilePictureUrl,
  getCardImageUrl,
} from '@/utils/imageUpload';

// Replace with your actual auth hook/context
// import { useAuth } from '@/context/AuthContext';

export default function ImageUploadTest() {
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>('');

  // REPLACE THIS with your actual token from auth context
  // const { token } = useAuth();
  const token = 'YOUR_JWT_TOKEN_HERE'; // ⚠️ Replace this!

  const handlePickAndUpload = async () => {
    if (!token || token === 'YOUR_JWT_TOKEN_HERE') {
      Alert.alert('Error', 'Please set your JWT token in the component');
      return;
    }

    setUploading(true);
    setStatus('Picking image...');

    try {
      const uri = await pickImage();

      if (!uri) {
        setStatus('Cancelled');
        setUploading(false);
        return;
      }

      setLocalImageUri(uri);
      setStatus('Uploading to Cloudinary...');

      const result = await uploadImage(uri, 'test', token);

      setCloudinaryUrl(result.url);
      setStatus('✅ Upload successful!');

      Alert.alert(
        'Success!',
        `Image uploaded to Cloudinary!\n\nURL: ${result.url}\nPublic ID: ${result.publicId}`
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      setStatus(`❌ Error: ${error.message}`);
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhotoAndUpload = async () => {
    if (!token || token === 'YOUR_JWT_TOKEN_HERE') {
      Alert.alert('Error', 'Please set your JWT token in the component');
      return;
    }

    setUploading(true);
    setStatus('Opening camera...');

    try {
      const uri = await takePhoto();

      if (!uri) {
        setStatus('Cancelled');
        setUploading(false);
        return;
      }

      setLocalImageUri(uri);
      setStatus('Uploading to Cloudinary...');

      const result = await uploadImage(uri, 'test', token);

      setCloudinaryUrl(result.url);
      setStatus('✅ Upload successful!');

      Alert.alert(
        'Success!',
        `Photo uploaded to Cloudinary!\n\nURL: ${result.url}`
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      setStatus(`❌ Error: ${error.message}`);
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    setLocalImageUri(null);
    setCloudinaryUrl(null);
    setStatus('');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Image Upload Test</Text>
        <Text style={styles.subtitle}>Test Cloudinary integration</Text>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handlePickAndUpload}
            disabled={uploading}
          >
            <Text style={styles.buttonText}>
              📸 Pick from Gallery
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleTakePhotoAndUpload}
            disabled={uploading}
          >
            <Text style={styles.buttonText}>
              📷 Take Photo
            </Text>
          </TouchableOpacity>

          {cloudinaryUrl && (
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={handleClear}
              disabled={uploading}
            >
              <Text style={styles.buttonText}>🗑️ Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status */}
        {status && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}

        {/* Loading Indicator */}
        {uploading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Uploading...</Text>
          </View>
        )}

        {/* Local Image Preview */}
        {localImageUri && !uploading && (
          <View style={styles.imageSection}>
            <Text style={styles.sectionTitle}>Local Image</Text>
            <Image
              source={{ uri: localImageUri }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          </View>
        )}

        {/* Cloudinary Image Preview */}
        {cloudinaryUrl && !uploading && (
          <View style={styles.imageSection}>
            <Text style={styles.sectionTitle}>Cloudinary Image (Original)</Text>
            <Image
              source={{ uri: cloudinaryUrl }}
              style={styles.image}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
            <Text style={styles.urlText} numberOfLines={2}>
              {cloudinaryUrl}
            </Text>

            {/* Transformed Images */}
            <Text style={styles.sectionTitle} style={{ marginTop: 20 }}>
              Transformed Versions
            </Text>

            <View style={styles.transformedContainer}>
              <View style={styles.transformedItem}>
                <Text style={styles.transformedLabel}>Thumbnail (300x300)</Text>
                <Image
                  source={{ uri: getProfilePictureUrl(cloudinaryUrl, 150) }}
                  style={styles.thumbnail}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>

              <View style={styles.transformedItem}>
                <Text style={styles.transformedLabel}>Card (400px)</Text>
                <Image
                  source={{ uri: getCardImageUrl(cloudinaryUrl, 200) }}
                  style={styles.cardImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            </View>
          </View>
        )}

        {/* Instructions */}
        {!localImageUri && !uploading && (
          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>ℹ️ How to Test:</Text>
            <Text style={styles.instructionsText}>
              1. Update the token variable in this component{'\n'}
              2. Make sure your backend is running{'\n'}
              3. Tap "Pick from Gallery" or "Take Photo"{'\n'}
              4. Check the console for the Cloudinary URL
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  buttonContainer: {
    gap: 10,
    marginBottom: 20,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#5856D6',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    color: '#2E7D32',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  imageSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  urlText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  transformedContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  transformedItem: {
    alignItems: 'center',
  },
  transformedLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e0e0e0',
  },
  cardImage: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  instructions: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F57F17',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#F57F17',
    lineHeight: 20,
  },
});
