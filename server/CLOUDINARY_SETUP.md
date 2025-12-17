# Cloudinary Setup Guide

This guide will help you set up Cloudinary for storing images in your NightVibe application.

## Why Cloudinary?

- **Easy Setup**: No complex service accounts or permissions
- **Free Tier**: 25 GB storage, 25 GB bandwidth, 25,000 transformations/month
- **Automatic Optimization**: Images are automatically compressed and optimized
- **Image Transformations**: Resize, crop, and transform images on-the-fly
- **CDN Delivery**: Fast global content delivery
- **Simple Integration**: Just 3 environment variables needed

## Step 1: Create a Cloudinary Account

1. Go to [https://cloudinary.com/users/register/free](https://cloudinary.com/users/register/free)
2. Sign up for a free account (no credit card required)
3. Verify your email address

## Step 2: Get Your Credentials

1. Log in to [Cloudinary Console](https://cloudinary.com/console)
2. On the **Dashboard**, you'll see your **Account Details**:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

3. Copy these three values

## Step 3: Configure Your Application

Add the credentials to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**Example:**
```env
CLOUDINARY_CLOUD_NAME=nightvibe
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz123456
```

That's it! No service accounts, no JSON files, no complex permissions.

## Step 4: Test the Setup

1. Start your server:
   ```bash
   cd server
   npm run dev
   ```

2. Test with curl (replace with your actual JWT token):
   ```bash
   curl -X POST http://localhost:3000/api/upload/image \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -F "image=@/path/to/test-image.jpg" \
     -F "folder=events"
   ```

3. You should get a response like:
   ```json
   {
     "message": "Image uploaded successfully",
     "url": "https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/events/abc123.jpg",
     "publicId": "events/abc123"
   }
   ```

## Step 5: Organize Your Images with Folders

Cloudinary uses folders to organize images. In your API calls, specify the folder:

```javascript
// Upload to specific folders
formData.append('folder', 'events');      // Event images
formData.append('folder', 'profiles');    // User profile pictures
formData.append('folder', 'vendors');     // Vendor images
formData.append('folder', 'nightvibe');   // Default folder
```

## API Endpoints

### 1. Upload Single Image (Multipart/Form-Data)

**Endpoint:** `POST /api/upload/image`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: multipart/form-data
```

**Body (form-data):**
- `image` (file): The image file
- `folder` (string, optional): Folder name (default: "nightvibe")

**Response:**
```json
{
  "message": "Image uploaded successfully",
  "url": "https://res.cloudinary.com/...",
  "publicId": "events/image123"
}
```

### 2. Upload Multiple Images

**Endpoint:** `POST /api/upload/images`

**Body (form-data):**
- `images` (files): Multiple image files (max 10)
- `folder` (string, optional): Folder name

**Response:**
```json
{
  "message": "Images uploaded successfully",
  "images": [
    {
      "url": "https://res.cloudinary.com/...",
      "publicId": "vendors/image1",
      "width": 1920,
      "height": 1080,
      "format": "jpg"
    },
    {
      "url": "https://res.cloudinary.com/...",
      "publicId": "vendors/image2",
      "width": 1920,
      "height": 1080,
      "format": "png"
    }
  ]
}
```

### 3. Upload Base64 Image

**Endpoint:** `POST /api/upload/base64`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "folder": "events"
}
```

**Response:**
```json
{
  "message": "Image uploaded successfully",
  "url": "https://res.cloudinary.com/...",
  "publicId": "events/image123"
}
```

## Frontend Integration (React Native/Expo)

### Install Image Picker

```bash
cd mobile
npx expo install expo-image-picker
```

### Upload Image Example

```javascript
import * as ImagePicker from 'expo-image-picker';

const uploadImage = async () => {
  // Pick image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (result.canceled) return;

  const imageUri = result.assets[0].uri;

  // Upload to Cloudinary
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  });
  formData.append('folder', 'events');

  const response = await fetch('http://your-api/api/upload/image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  console.log('Uploaded:', data.url);

  // Use data.url when creating events, updating profiles, etc.
  return data.url;
};
```

### Create Event with Image

```javascript
const createEventWithImage = async () => {
  // 1. Upload image first
  const imageUrl = await uploadImage();

  // 2. Create event with the Cloudinary URL
  const eventData = {
    title: 'My Event',
    date: new Date(),
    location: 'New York',
    image: imageUrl, // Cloudinary URL
    description: 'Event description',
    isPublic: true,
  };

  const response = await fetch('http://your-api/api/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  const result = await response.json();
  console.log('Event created:', result);
};
```

### Upload Multiple Images (Vendor Images)

```javascript
const uploadVendorImages = async () => {
  // Pick multiple images
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
  });

  if (result.canceled) return;

  const formData = new FormData();

  result.assets.forEach((asset, index) => {
    formData.append('images', {
      uri: asset.uri,
      type: 'image/jpeg',
      name: `photo-${index}.jpg`,
    });
  });

  formData.append('folder', 'vendors');

  const response = await fetch('http://your-api/api/upload/images', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  const imageUrls = data.images.map(img => img.url);

  return imageUrls; // Array of Cloudinary URLs
};
```

## Image Transformations (Bonus!)

Cloudinary allows you to transform images on-the-fly by modifying the URL:

### Resize Image
```javascript
// Original URL
const originalUrl = "https://res.cloudinary.com/nightvibe/image/upload/v1234567890/events/image.jpg";

// Resize to width 300px
const resizedUrl = originalUrl.replace('/upload/', '/upload/w_300/');

// Result
<Image source={{ uri: resizedUrl }} />
```

### Common Transformations

```javascript
// Width 400px, height 300px, crop
const url = originalUrl.replace('/upload/', '/upload/w_400,h_300,c_fill/');

// Width 300px, quality 70%
const url = originalUrl.replace('/upload/', '/upload/w_300,q_70/');

// Circular crop (for profile pictures)
const url = originalUrl.replace('/upload/', '/upload/w_200,h_200,c_fill,r_max/');

// Auto format and quality
const url = originalUrl.replace('/upload/', '/upload/f_auto,q_auto/');
```

### Helper Function

```javascript
export function transformCloudinaryUrl(url, transformations) {
  if (!url || !url.includes('cloudinary.com')) return url;

  const transform = Object.entries(transformations)
    .map(([key, value]) => `${key}_${value}`)
    .join(',');

  return url.replace('/upload/', `/upload/${transform}/`);
}

// Usage
const thumbnailUrl = transformCloudinaryUrl(imageUrl, {
  w: 300,
  h: 300,
  c: 'fill',
  q: 'auto',
});
```

## Folder Structure Recommendations

```
nightvibe/
├── events/          # Event images
├── profiles/        # User profile pictures
├── vendors/         # Vendor business images
│   ├── restaurants/
│   ├── bars/
│   └── clubs/
└── temp/           # Temporary uploads (can be deleted periodically)
```

## Cloudinary Dashboard Features

1. **Media Library**: View all uploaded images
2. **Transformations**: Test image transformations
3. **Usage**: Monitor storage and bandwidth usage
4. **Settings**: Configure upload presets, notifications, etc.

## Free Tier Limits

- **Storage**: 25 GB
- **Bandwidth**: 25 GB/month
- **Transformations**: 25,000/month
- **Images**: Unlimited uploads

For most small to medium apps, the free tier is more than enough!

## Best Practices

### 1. Compress Images Before Upload (Mobile)

```javascript
const result = await ImagePicker.launchImageLibraryAsync({
  quality: 0.7, // 70% quality (0.0 - 1.0)
  allowsEditing: true,
});
```

### 2. Use Appropriate Folders

```javascript
// Good organization
formData.append('folder', 'events');      // For events
formData.append('folder', 'profiles');    // For profiles
formData.append('folder', 'vendors');     // For vendors

// Bad organization
formData.append('folder', 'nightvibe');   // Everything in one folder
```

### 3. Delete Old Images When Replacing

The image service automatically handles this:

```javascript
// When updating profile picture
import { replaceImage } from '../services/image.service.js';

const oldImageUrl = user.profilePicture;
const newImage = await replaceImage(oldImageUrl, req.file, 'profiles');
```

### 4. Handle Errors Gracefully

```javascript
try {
  const imageUrl = await uploadImage();
  // Use imageUrl
} catch (error) {
  if (error.message.includes('Invalid file type')) {
    alert('Please select a valid image file');
  } else if (error.message.includes('File too large')) {
    alert('Image is too large (max 5MB)');
  } else {
    alert('Failed to upload image. Please try again.');
  }
}
```

## Troubleshooting

### Error: "Invalid credentials"
- Check that your `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are correct
- Make sure there are no extra spaces or quotes in your `.env` file

### Error: "Must supply api_key"
- Restart your server after adding credentials to `.env`
- Verify that `dotenv` is loading your environment variables

### Images not uploading
- Check that you're sending the correct headers (Authorization)
- Verify that the file is a valid image format (JPEG, PNG, GIF, WebP)
- Check file size (max 5MB by default)

### Can't see uploaded images in dashboard
- Make sure you're logged into the correct Cloudinary account
- Check the correct folder in Media Library
- Wait a few seconds and refresh the page

## Cost Estimation

Cloudinary pricing is very generous. Here's an estimate:

**Free Tier (0-25 GB storage, 25 GB bandwidth):**
- Perfect for: MVPs, small apps, testing
- Estimated users: ~10,000 users with profile pictures
- Cost: **$0/month**

**Advanced Plan ($99/month):**
- 140 GB storage, 140 GB bandwidth
- Estimated users: ~50,000 active users
- Advanced transformations and features

For most indie apps and startups, the free tier is sufficient for months or even years!

## Migration from MongoDB Storage

If you're currently storing base64 images in MongoDB, here's a migration script:

```javascript
import User from './models/user.model.js';
import Event from './models/event.model.js';
import { uploadBase64Image } from './services/image.service.js';

async function migrateImages() {
  // Migrate user profile pictures
  const users = await User.find({ profilePicture: /^data:image/ });

  for (const user of users) {
    try {
      const result = await uploadBase64Image(user.profilePicture, 'profiles');
      user.profilePicture = result.url;
      await user.save();
      console.log(`✅ Migrated profile picture for user ${user._id}`);
    } catch (error) {
      console.error(`❌ Error migrating user ${user._id}:`, error);
    }
  }

  // Migrate event images
  const events = await Event.find({ image: /^data:image/ });

  for (const event of events) {
    try {
      const result = await uploadBase64Image(event.image, 'events');
      event.image = result.url;
      await event.save();
      console.log(`✅ Migrated image for event ${event._id}`);
    } catch (error) {
      console.error(`❌ Error migrating event ${event._id}:`, error);
    }
  }

  console.log('🎉 Migration complete!');
}

// Run migration
migrateImages();
```

## Additional Resources

- **Cloudinary Documentation**: https://cloudinary.com/documentation
- **Node.js SDK**: https://cloudinary.com/documentation/node_integration
- **Image Transformations**: https://cloudinary.com/documentation/image_transformations
- **Upload API**: https://cloudinary.com/documentation/upload_images

## Support

For issues or questions:
- Cloudinary Support: https://support.cloudinary.com
- Cloudinary Community: https://community.cloudinary.com
