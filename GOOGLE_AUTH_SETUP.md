# Google Authentication Setup Guide

This guide will help you configure Google OAuth authentication for the NightVibe app.

> **Note**: This implementation uses Expo's web-based authentication (expo-web-browser + expo-auth-session) which works with Expo Go and doesn't require native builds. The mobile app opens Google's OAuth page in a secure browser and receives the authentication token via redirect URI.

## Prerequisites

- A Google Cloud Platform account
- Admin access to the Google Cloud Console

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API for your project

## Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
2. Choose **External** user type (unless you have a Google Workspace)
3. Fill in the required information:
   - App name: `NightVibe`
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes (required):
   - `userinfo.email`
   - `userinfo.profile`
5. Save and continue

## Step 3: Create OAuth 2.0 Credentials

### Web Client (Required - Used by Both Backend and Mobile App)

1. Click **+ CREATE CREDENTIALS > OAuth client ID** again
2. Select **Web application** as application type
3. Add authorized JavaScript origins:
   - `http://localhost:3000`
   - Your production backend URL
4. Add authorized redirect URIs (for Expo mobile app):
   - `https://auth.expo.io/@setemiloye1/nightvibe` (for Expo Go with proxy)
   - Your production mobile app redirect URI (when you deploy)
5. Click **Create**
6. Copy the **Client ID** - this is what you'll use in both your backend and mobile app

**Note**: The redirect URI format for Expo is `https://auth.expo.io/@YOUR_EXPO_USERNAME/YOUR_APP_SLUG`. Replace:
- `YOUR_EXPO_USERNAME` with your Expo username (found in app.json under "owner")
- `YOUR_APP_SLUG` with your app slug (found in app.json under "slug")

## Step 4: Configure Backend Environment Variables

1. Open `server/.env` file
2. Add your Google Web Client ID:
   ```env
   GOOGLE_CLIENT_ID=your-web-client-id-here.apps.googleusercontent.com
   ```

## Step 5: Configure Mobile App

1. Create or update `mobile/.env` file:

   ```env
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id-here.apps.googleusercontent.com
   ```

2. The `mobile/app.json` is already configured with the necessary scheme (`mobile://`)

## Step 6: Test the Integration

1. Start your backend server:

   ```bash
   cd server
   npm run dev
   ```

2. Start the mobile app:

   ```bash
   cd mobile
   npx expo start
   ```

3. On the login/signup screen, click "Continue with Google"
4. Complete the Google sign-in flow
5. You should be redirected to the home screen

## Troubleshooting

### "Sign in failed" or "Invalid redirect URI" error

- Verify you've added the correct redirect URI in Google Cloud Console:
  - `https://auth.expo.io/@YOUR_EXPO_USERNAME/YOUR_APP_SLUG`
  - For this project: `https://auth.expo.io/@setemiloye1/nightvibe`
- Check that you're using the **Web Client ID** (not Android or iOS client ID)
- Ensure the EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in mobile/.env matches your Web Client ID
- Make sure your Expo username and app slug in app.json match the redirect URI

### "Google authentication failed" error

- Verify your backend has the correct GOOGLE_CLIENT_ID in server/.env
- Check backend logs for detailed error messages
- Ensure the Google+ API is enabled in your project
- Make sure both mobile and backend are using the same Web Client ID

### Browser doesn't open or closes immediately

- Try clearing Expo cache: `npx expo start -c`
- Make sure expo-web-browser is installed
- Check that WebBrowser.maybeCompleteAuthSession() is called

## Security Notes

- Never commit `.env` files to version control
- Use different OAuth credentials for development and production
- Regularly rotate your OAuth secrets
- Monitor your Google Cloud Console for unusual activity

## Additional Resources

- [Google Sign-In Documentation](https://developers.google.com/identity/sign-in/android/start-integrating)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [Expo Authentication](https://docs.expo.dev/guides/authentication/)
