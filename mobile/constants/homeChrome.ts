/**
 * Home navbar geometry.
 *
 * Two files have to agree on it: app/(tabs)/_layout.tsx renders the navbar, and
 * app/(tabs)/home.tsx pads its scroll content out from under it (on iOS the
 * navbar is an absolute overlay so the native tab bar can render — see
 * navbarOverlay). It lived as a magic 106 in home.tsx and a hardcoded 50 in the
 * layout, which drifted: 50 sits *inside* the 59pt Dynamic Island inset, so the
 * logo and action pills were clipped on modern iPhones.
 */

/** 40pt action pills + the navbar's 16pt paddingBottom. */
export const NAVBAR_ROW_HEIGHT = 56;

/**
 * Top padding for the navbar. Driven by the safe-area inset so notched and
 * Dynamic Island devices clear their cutout, with a floor that keeps flat-top
 * phones (and Android) where they already were rather than moving them up.
 */
export const navbarTopPad = (insetTop: number) => Math.max(insetTop, 38) + 12;
