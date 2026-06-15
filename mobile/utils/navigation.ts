import { router } from "expo-router";

/**
 * Go back if there's a screen to return to; otherwise replace to a fallback
 * route (the home tab by default). Centralized so deep links and push-
 * notification cold starts — which have no back stack — never leave the user
 * stranded with a dead back button. Use this instead of a bare router.back().
 */
export function goBack(fallback: string = "/(tabs)/home") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}

/** Always send the user to the home tab, regardless of the back stack. */
export function goHome() {
  router.replace("/(tabs)/home");
}
