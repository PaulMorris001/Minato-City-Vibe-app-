import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';

// Required for web browser authentication
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

// Google OAuth discovery endpoint
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// Configure Google Sign-In - no-op for Expo AuthSession
export const configureGoogleSignIn = () => {
  // Configuration is handled automatically by Expo AuthSession
};

// Helper function to generate a random string for code verifier
const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Sign in with Google using authorization code flow with PKCE
export const signInWithGoogle = async () => {
  try {
    // MUST use Expo's auth proxy for Expo Go
    // Google only accepts http:// or https:// redirect URIs
    const redirectUri = 'https://auth.expo.io/@setemiloye1/nightvibe';

    console.log('Starting Google Sign-In...');
    console.log('Redirect URI:', redirectUri);

    // Generate PKCE code verifier (random string)
    const codeVerifier = generateRandomString(128);

    // Generate code challenge (SHA256 hash of verifier, base64url encoded)
    const codeChallenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier
    );

    // Convert to base64url format (replace +/= with -_)
    const codeChallengeBase64 = codeChallenge
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Build the authorization URL with code flow and PKCE
    const state = Math.random().toString(36).substring(7);
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('openid profile email')}&` +
      `code_challenge=${codeChallengeBase64}&` +
      `code_challenge_method=S256&` +
      `state=${state}`;

    console.log('Opening auth URL...');

    // Open the browser for authentication
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    console.log('Browser result type:', result.type);
    console.log('Full browser result:', JSON.stringify(result, null, 2));

    if (result.type === 'success') {
      console.log('Success! URL:', result.url);

      // Parse the URL to extract the authorization code
      const url = result.url;
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');

      console.log('Has authorization code:', !!code);

      if (!code) {
        throw new Error('No authorization code received from Google');
      }

      // Exchange the authorization code for tokens
      console.log('Exchanging code for tokens...');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange failed with status:', tokenResponse.status);
        console.error('Token exchange error response:', errorData);
        throw new Error(`Failed to exchange code for tokens: ${errorData}`);
      }

      const tokens = await tokenResponse.json();
      console.log('Token exchange successful!');
      console.log('Has idToken:', !!tokens.id_token);
      console.log('Has accessToken:', !!tokens.access_token);
      console.log('Token types received:', Object.keys(tokens));

      if (tokens.id_token) {
        return {
          type: 'success',
          data: {
            idToken: tokens.id_token,
          },
        };
      } else if (tokens.access_token) {
        return {
          type: 'success',
          data: {
            accessToken: tokens.access_token,
          },
        };
      } else {
        throw new Error('No token received from Google');
      }
    } else if (result.type === 'cancel') {
      throw new Error('User cancelled Google sign-in');
    } else {
      throw new Error('Google sign-in failed');
    }
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

// Get current user - not applicable for web-based auth
export const getCurrentGoogleUser = async () => {
  return null;
};

// Sign out from Google - handled by app logout
export const signOutFromGoogle = async () => {
  // No-op for web-based auth
};
