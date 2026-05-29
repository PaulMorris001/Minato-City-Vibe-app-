import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Sentry from "@sentry/react-native";

// Web client ID — used as the idToken audience so the SERVER can verify it
// (server's GOOGLE_CLIENT_ID must equal this value).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
// iOS client ID — required for the native Sign in sheet on iOS.
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";

export interface GoogleSignInResult {
  data: { idToken: string; accessToken?: string };
}

// Show only enough of the client id to confirm which one is in play without
// leaking the full credential into Sentry/console.
const idPreview = (s: string) =>
  s ? `${s.slice(0, 12)}…${s.slice(-20)}` : "EMPTY";

/**
 * Configure native Google Sign-In. Safe to call multiple times. Must run
 * before `signInWithGoogle`.
 */
export const configureGoogleSignIn = () => {
  const info = {
    platform: Platform.OS,
    webClientIdPresent: !!WEB_CLIENT_ID,
    webClientIdPreview: idPreview(WEB_CLIENT_ID),
    iosClientIdPresent: !!IOS_CLIENT_ID,
    iosClientIdPreview: idPreview(IOS_CLIENT_ID),
  };
  console.log("[googleAuth] configureGoogleSignIn", info);
  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "configureGoogleSignIn",
    level: "info",
    data: info,
  });

  try {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID || undefined,
      offlineAccess: false,
      scopes: ["profile", "email"],
    });
  } catch (err: any) {
    console.warn("[googleAuth] configure threw", err?.message);
    Sentry.captureException(err, {
      tags: { action: "google.configure" },
      contexts: { google: info },
    });
    throw err;
  }
};

/**
 * Trigger the native Google account sheet and return the idToken for the
 * backend to verify. Throws on cancellation (caller treats a "cancel" message
 * as a silent dismissal).
 */
export const signInWithGoogle = async (): Promise<GoogleSignInResult> => {
  const startedAt = Date.now();
  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "signInWithGoogle: start",
    level: "info",
    data: {
      platform: Platform.OS,
      webClientIdPresent: !!WEB_CLIENT_ID,
      iosClientIdPresent: !!IOS_CLIENT_ID,
    },
  });
  console.log("[googleAuth] signInWithGoogle: start", {
    platform: Platform.OS,
  });

  // No-op on iOS; on Android ensures Play Services are available.
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    console.log("[googleAuth] hasPlayServices OK");
    Sentry.addBreadcrumb({
      category: "auth.google",
      message: "hasPlayServices OK",
      level: "info",
    });
  } catch (err: any) {
    console.warn("[googleAuth] hasPlayServices failed", err?.code, err?.message);
    Sentry.captureException(err, {
      tags: { action: "google.hasPlayServices", platform: Platform.OS },
    });
    throw err;
  }

  let response: any;
  try {
    response = await GoogleSignin.signIn();
  } catch (err: any) {
    // The native SDK error includes a numeric `code` on Android
    // (DEVELOPER_ERROR=10, SIGN_IN_CANCELLED=12501, NETWORK_ERROR=7,
    // SIGN_IN_REQUIRED=4, INVALID_ACCOUNT=5). Capture all of it.
    const data = {
      platform: Platform.OS,
      code: err?.code,
      name: err?.name,
      message: err?.message,
      domain: err?.domain,
      userInfo: err?.userInfo,
      elapsedMs: Date.now() - startedAt,
    };
    console.warn("[googleAuth] GoogleSignin.signIn threw", data);
    Sentry.addBreadcrumb({
      category: "auth.google",
      message: "GoogleSignin.signIn threw",
      level: "error",
      data,
    });
    Sentry.captureException(err, {
      tags: { action: "google.signIn", platform: Platform.OS },
      contexts: { google: data },
    });
    throw err;
  }

  const data = {
    platform: Platform.OS,
    type: response?.type,
    hasData: !!response?.data,
    hasIdToken: !!response?.data?.idToken,
    idTokenLen: response?.data?.idToken?.length || 0,
    hasUser: !!response?.data?.user,
    userEmail: response?.data?.user?.email,
    elapsedMs: Date.now() - startedAt,
  };
  console.log("[googleAuth] GoogleSignin.signIn resolved", data);
  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "GoogleSignin.signIn resolved",
    level: "info",
    data,
  });

  if (response.type === "cancelled") {
    throw new Error("User cancelled Google sign-in");
  }
  const idToken = response.data?.idToken;
  if (!idToken) {
    Sentry.captureMessage("Google returned no ID token", {
      level: "error",
      tags: { action: "google.signIn.noToken", platform: Platform.OS },
      contexts: { google: data },
    });
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
