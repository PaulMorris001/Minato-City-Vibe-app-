/**
 * Fixed height of the vendor navbar in app/(vendor)/_layout.tsx on iOS
 * (paddingTop 50 + 40pt action row + paddingBottom 14 + hairline). The navbar
 * overlays the native tab host there — a flex sibling would shrink the host
 * and suppress the iOS 26 Liquid Glass tab bar — so each vendor tab screen
 * pads its top by this amount. On Android the navbar sits in normal flow and
 * no padding is needed.
 */
export const VENDOR_NAVBAR_HEIGHT = 105;
