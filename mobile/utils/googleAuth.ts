import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as WebBrowser from "expo-web-browser";

import { BASE_URL } from "@/constants/constants";
import { remoteLog } from "@/utils/remoteLog";

// Web client ID — used as the idToken audience so the SERVER can verify it
// (server's GOOGLE_CLIENT_ID must equal this value).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
// iOS client ID — required for the native Sign in sheet on iOS.
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";

export interface GoogleSignInResult {
  data: { idToken: string; accessToken?: string };
}

// Show only enough of the client id to confirm which one is in play without
// leaking the full credential into log lines.
const idPreview = (s: string) =>
  s ? `${s.slice(0, 12)}…${s.slice(-20)}` : "EMPTY";

/**
 * Configure native Google Sign-In. Safe to call multiple times. Must run
 * before `signInWithGoogle`.
 *
 * Logging policy: this is a low-importance setup call. We log the input
 * shape to Render (helpful for diagnosing OAuth issues), but a configure
 * failure is not Sentry-worthy on its own — the user only sees something
 * if they then try to sign in.
 */
export const configureGoogleSignIn = () => {
  const info = {
    platform: Platform.OS,
    webClientIdPresent: !!WEB_CLIENT_ID,
    webClientIdPreview: idPreview(WEB_CLIENT_ID),
    iosClientIdPresent: !!IOS_CLIENT_ID,
    iosClientIdPreview: idPreview(IOS_CLIENT_ID),
  };
  remoteLog("info", "google.configure", info);

  try {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID || undefined,
      offlineAccess: false,
      scopes: ["profile", "email"],
    });
  } catch (err: any) {
    // Don't escalate to Sentry — caller will retry on next sign-in tap, and
    // any actual user-facing failure is reported there.
    remoteLog("warn", "google.configure threw", { ...info, message: err?.message }, err);
    throw err;
  }
};

/**
 * Trigger the native Google account sheet and return the idToken for the
 * backend to verify. Throws on cancellation (caller treats a "cancel" message
 * as a silent dismissal).
 *
 * NOTE: the shipped binary's native config is broken on both platforms; in
 * practice `signInWithGoogleWeb` below is what the app calls. This function
 * is kept around for the eventual binary rebuild that fixes the placeholder
 * iOS URL scheme and the missing Android OAuth client.
 */
export const signInWithGoogle = async (): Promise<GoogleSignInResult> => {
  const startedAt = Date.now();
  remoteLog("info", "google.native.start", {
    platform: Platform.OS,
    webClientIdPresent: !!WEB_CLIENT_ID,
    iosClientIdPresent: !!IOS_CLIENT_ID,
  });

  // No-op on iOS; on Android ensures Play Services are available.
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (err: any) {
    // Play Services unavailable is an environment problem, not our bug.
    remoteLog(
      "warn",
      "google.native.hasPlayServices failed",
      { platform: Platform.OS, code: err?.code, message: err?.message },
      err
    );
    throw err;
  }

  let response: any;
  try {
    response = await GoogleSignin.signIn();
  } catch (err: any) {
    // The native SDK error includes a numeric `code` on Android
    // (DEVELOPER_ERROR=10, SIGN_IN_CANCELLED=12501, NETWORK_ERROR=7,
    // SIGN_IN_REQUIRED=4, INVALID_ACCOUNT=5). Log to Render — the caller
    // decides whether the user-facing failure is Sentry-worthy.
    remoteLog(
      "warn",
      "google.native.signIn threw",
      {
        platform: Platform.OS,
        code: err?.code,
        name: err?.name,
        message: err?.message,
        elapsedMs: Date.now() - startedAt,
      },
      err
    );
    throw err;
  }

  remoteLog("info", "google.native.signIn resolved", {
    platform: Platform.OS,
    type: response?.type,
    hasIdToken: !!response?.data?.idToken,
    idTokenLen: response?.data?.idToken?.length || 0,
    elapsedMs: Date.now() - startedAt,
  });

  if (response.type === "cancelled") {
    throw new Error("User cancelled Google sign-in");
  }
  const idToken = response.data?.idToken;
  if (!idToken) {
    remoteLog("error", "google.native.signIn returned no ID token", {
      platform: Platform.OS,
      type: response?.type,
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

// Where the server bounces the in-app browser to at the end of OAuth.
//
// Why a custom scheme and not HTTPS:
//   - On iOS ASWebAuthenticationSession can detect any URL prefix match, so
//     either would work.
//   - On Android `openAuthSessionAsync` relies on the OS's Linking/intent
//     system to receive the callback. An HTTPS URL that isn't auto-verified
//     as an Android App Link just stays in Chrome Custom Tabs forever — the
//     browser never closes. The `mobile://` scheme IS in the app's intent
//     filter (app.config.js), so Android routes the URL back into the app
//     and WebBrowser's listener fires.
//
// Side effect: on Android the OS also hands the URL to expo-router. We catch
// it with a redirect stub at `app/auth/google.tsx` so it doesn't render the
// "Unmatched Route" screen.
const RETURN_URL = "mobile://auth/google";

export const signInWithGoogleWeb = async (): Promise<GoogleWebSignInResult> => {
  const startedAt = Date.now();
  // BASE_URL ends with /api in production; in dev it also ends with /api.
  // Server routes are mounted under /api, and we registered them as
  // /auth/google/web/start — so the full path is BASE_URL + that.
  const startUrl = `${BASE_URL}/auth/google/web/start`;
  const returnUrl = RETURN_URL;

  remoteLog("info", "google.web.start", {
    platform: Platform.OS,
    startUrl,
    returnUrl,
  });

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
  } catch (err: any) {
    // WebBrowser failing to even present is unusual — re-throw and let the
    // caller decide whether to escalate. Logged for visibility on Render.
    remoteLog(
      "error",
      "google.web.openAuthSessionAsync threw",
      { platform: Platform.OS, message: err?.message },
      err
    );
    throw err;
  }

  remoteLog("info", "google.web.openAuthSessionAsync resolved", {
    platform: Platform.OS,
    type: result.type,
    hasUrl: result.type === "success" && !!(result as any).url,
    elapsedMs: Date.now() - startedAt,
  });

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("User cancelled Google sign-in");
  }
  if (result.type !== "success" || !result.url) {
    throw new Error(`Auth session ended unexpectedly (type=${result.type})`);
  }

  const params = parseCallbackQuery(result.url);
  if (params.error) {
    // Server-known failure mode (suspended account, expired state). User-
    // visible but expected — Render is the right destination, not Sentry.
    remoteLog("warn", "google.web.callback returned error", {
      platform: Platform.OS,
      error: params.error,
    });
    const msg =
      params.error === "account_suspended"
        ? "This account has been suspended for violating our content policy."
        : params.error === "invalid_state"
        ? "Sign-in session expired. Please try again."
        : `Google sign-in failed: ${params.error}`;
    throw new Error(msg);
  }

  if (!params.token || !params.user) {
    // Indicates a real bug in our server or a malformed redirect — error level
    // so it stands out in Render. Caller will Sentry-capture the thrown error
    // since the user sees a failure they can't recover from.
    remoteLog("error", "google.web.callback missing token/user", {
      platform: Platform.OS,
      paramsPresent: Object.keys(params),
    });
    throw new Error("Sign-in succeeded but the response was malformed.");
  }

  let user: GoogleWebSignInResult["user"];
  try {
    user = JSON.parse(params.user);
  } catch (parseErr: any) {
    remoteLog(
      "error",
      "google.web.user JSON.parse failed",
      { platform: Platform.OS, message: parseErr?.message },
      parseErr
    );
    throw new Error("Sign-in response could not be parsed.");
  }

  remoteLog("info", "google.web.success", {
    platform: Platform.OS,
    userId: user.id,
    isVendor: user.isVendor,
    elapsedMs: Date.now() - startedAt,
  });

  return { token: params.token, user };
};
