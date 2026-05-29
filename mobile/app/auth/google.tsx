import React from "react";
import { Redirect } from "expo-router";

/**
 * Stub route for the OAuth callback URL `mobile://auth/google?token=…&user=…`.
 *
 * On Android, when our server bounces the in-app browser to that
 * custom-scheme URL, the OS dispatches it through TWO listeners in parallel:
 *   1. `WebBrowser.openAuthSessionAsync` (in `signInWithGoogleWeb`) — captures
 *      the URL, parses token + user out of the query string, and resolves so
 *      `SocialAuthButtons.handleGoogleSignIn` can call `finishAuth` →
 *      `router.replace("/(tabs)/home")` (or the vendor role picker).
 *   2. expo-router's built-in linking — tries to match `/auth/google` against
 *      the file-based route tree. Without this file it would render the
 *      "Unmatched Route" screen for as long as the user looks at the app.
 *
 * On iOS this file is never rendered (ASWebAuthenticationSession intercepts
 * the callback URL before iOS routes it).
 *
 * We render only a `<Redirect>` — expo-router treats it as an immediate
 * navigation, so nothing visible paints. Routing to "/" takes the user
 * through `app/index.tsx`'s auth check: token-in-SecureStore → home,
 * no token → login. Whichever path `signInWithGoogleWeb` produced
 * (success or thrown error) is already reflected in storage by the time
 * this stub mounts, so the user lands in the right place without a flash
 * of an intermediate screen.
 *
 * IMPORTANT: don't return a loading view here — that would be visible while
 * `finishAuth` is still running, and on the slow path the user would see a
 * spinner on top of their previous screen until they tap back.
 */
export default function GoogleAuthCallback() {
  return <Redirect href="/" />;
}
