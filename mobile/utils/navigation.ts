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

/**
 * Switch the user to an account-type root (client tabs or vendor dashboard) and
 * wipe the back stack so the hardware back button can't return to the previous
 * account type. We first dismiss any pushed screens (e.g. Settings), then
 * replace into the target root. `dismissAll` throws when there's nothing to
 * dismiss, so it's guarded.
 *
 * This is the high-level fallback used everywhere. The Settings switch also does
 * a React Navigation `reset()` (which fully clears sibling groups like a
 * lingering vendor layout) and only falls back to this if reset is unavailable.
 */
export function resetToAccountRoot(type: "client" | "vendor") {
  const target = type === "vendor" ? "/(vendor)/dashboard" : "/(tabs)/home";
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // no dismissable screens — fine
  }
  router.replace(target as any);
}
