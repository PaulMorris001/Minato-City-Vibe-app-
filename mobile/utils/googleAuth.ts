import { GoogleSignin } from "@react-native-google-signin/google-signin";

// Web client ID — used as the idToken audience so the SERVER can verify it
// (server's GOOGLE_CLIENT_ID must equal this value).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
// iOS client ID — required for the native Sign in sheet on iOS.
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";

export interface GoogleSignInResult {
  data: { idToken: string; accessToken?: string };
}

/**
 * Configure native Google Sign-In. Safe to call multiple times. Must run
 * before `signInWithGoogle`.
 */
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID || undefined,
    offlineAccess: false,
    scopes: ["profile", "email"],
  });
};

/**
 * Trigger the native Google account sheet and return the idToken for the
 * backend to verify. Throws on cancellation (caller treats a "cancel" message
 * as a silent dismissal).
 */
export const signInWithGoogle = async (): Promise<GoogleSignInResult> => {
  // No-op on iOS; on Android ensures Play Services are available.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();

  if (response.type === "cancelled") {
    throw new Error("User cancelled Google sign-in");
  }
  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error("No ID token returned from Google");
  }

  return { data: { idToken } };
};

export const getCurrentGoogleUser = async () => {
  try {
    return GoogleSignin.getCurrentUser();
  } catch {
    return null;
  }
};

export const signOutFromGoogle = async () => {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore — best-effort sign out
  }
};
