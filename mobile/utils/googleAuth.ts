import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as WebBrowser from "expo-web-browser";
import * as Sentry from "@sentry/react-native";

import { BASE_URL } from "@/constants/constants";

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

// ─── Web-based Google Sign-In (OTA hotfix) ──────────────────────────────────
//
// The native GoogleSignin flow is broken in the shipped binary on both
// platforms (see auth.controller.js → googleWebStart for the full diagnosis).
// This function bypasses the native SDK entirely by driving the OAuth flow
// through the system browser against our server, then catching the
// `mobile://auth/google?token=…` callback. The whole round-trip works from
// the existing binary because:
//   - `mobile://` is already a registered URL scheme on both iOS and Android
//   - `expo-web-browser` is already bundled
//   - the server endpoints we hit are new but a deploy ships them
// so it's a fully OTA-shippable replacement.

export interface GoogleWebSignInResult {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    profilePicture?: string;
    isVendor: boolean;
    authProvider: string;
  };
}

// Parse the query string off the callback URL. URL parsing in RN is a bit
// inconsistent (`new URL` on iOS handles custom schemes; older Android JSC
// builds choke), so do it manually.
function parseCallbackQuery(url: string): Record<string, string> {
  const q = url.indexOf("?");
  if (q < 0) return {};
  const out: Record<string, string> = {};
  for (const pair of url.slice(q + 1).split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export const signInWithGoogleWeb = async (): Promise<GoogleWebSignInResult> => {
  const startedAt = Date.now();
  // BASE_URL ends with /api in production; in dev it also ends with /api.
  // Server routes are mounted under /api, and we registered them as
  // /auth/google/web/start — so the full path is BASE_URL + that.
  const startUrl = `${BASE_URL}/auth/google/web/start`;
  const returnUrl = "mobile://auth/google";

  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "signInWithGoogleWeb: start",
    level: "info",
    data: { platform: Platform.OS, startUrl, returnUrl },
  });
  console.log("[googleAuth.web] start", { platform: Platform.OS, startUrl, returnUrl });

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    // `dismissButtonStyle: "cancel"` keeps the iOS sheet behaving like other
    // OAuth sheets (Stripe Connect uses the same pattern in this app).
    result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
  } catch (err: any) {
    console.warn("[googleAuth.web] openAuthSessionAsync threw", err?.message);
    Sentry.captureException(err, {
      tags: { action: "google.web.openAuth", platform: Platform.OS },
    });
    throw err;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("[googleAuth.web] openAuthSessionAsync resolved", {
    type: result.type,
    hasUrl: result.type === "success" && !!result.url,
    elapsedMs,
  });
  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "openAuthSessionAsync resolved",
    level: "info",
    data: { type: result.type, elapsedMs },
  });

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("User cancelled Google sign-in");
  }
  if (result.type !== "success" || !result.url) {
    throw new Error(`Auth session ended unexpectedly (type=${result.type})`);
  }

  const params = parseCallbackQuery(result.url);
  if (params.error) {
    const msg =
      params.error === "account_suspended"
        ? "This account has been suspended for violating our content policy."
        : params.error === "invalid_state"
        ? "Sign-in session expired. Please try again."
        : `Google sign-in failed: ${params.error}`;
    Sentry.captureMessage("Google web callback returned error", {
      level: "error",
      tags: { action: "google.web.callbackError", platform: Platform.OS },
      contexts: { google: { error: params.error } },
    });
    throw new Error(msg);
  }

  if (!params.token || !params.user) {
    Sentry.captureMessage("Google web callback missing token/user", {
      level: "error",
      tags: { action: "google.web.malformedCallback", platform: Platform.OS },
      contexts: { google: { params: Object.keys(params) } },
    });
    throw new Error("Sign-in succeeded but the response was malformed.");
  }

  let user: GoogleWebSignInResult["user"];
  try {
    user = JSON.parse(params.user);
  } catch (parseErr: any) {
    Sentry.captureException(parseErr, {
      tags: { action: "google.web.userParse", platform: Platform.OS },
    });
    throw new Error("Sign-in response could not be parsed.");
  }

  console.log("[googleAuth.web] success", {
    userId: user.id,
    isVendor: user.isVendor,
    elapsedMs: Date.now() - startedAt,
  });
  Sentry.addBreadcrumb({
    category: "auth.google",
    message: "signInWithGoogleWeb: success",
    level: "info",
    data: { userId: user.id, isVendor: user.isVendor },
  });

  return { token: params.token, user };
};
