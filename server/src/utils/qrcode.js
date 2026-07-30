import QRCode from "qrcode";

// Prefix that marks a QR as a OurCityvibe attendance pass, so the in-app scanner
// can tell it apart from event/guide deep-link QRs.
export const PASS_QR_PREFIX = "cityvibe-pass:";

// OurCityvibe brand purple on white. High error-correction ("H") so the code still
// scans if the email client compresses or slightly crops the image.
const QR_OPTIONS = {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 320,
  color: { dark: "#7c3aed", light: "#ffffff" },
};

/** The exact string encoded in a pass QR for a given code. */
export function passQrPayload(code) {
  return `${PASS_QR_PREFIX}${code}`;
}

/** Strip the pass prefix from a scanned value, returning the bare code (or null). */
export function parsePassCode(scanned) {
  if (typeof scanned !== "string") return null;
  const value = scanned.trim();
  if (value.startsWith(PASS_QR_PREFIX)) {
    return value.slice(PASS_QR_PREFIX.length).trim() || null;
  }
  // Also accept a bare code (in case the scanner already stripped the prefix).
  if (/^[a-f0-9]{32,}$/i.test(value)) return value;
  return null;
}

/** PNG Buffer of the pass QR — used as an inline email attachment. */
export function passQrBuffer(code) {
  return QRCode.toBuffer(passQrPayload(code), QR_OPTIONS);
}

/** Data-URL (base64 PNG) of the pass QR — used to render the QR in-app. */
export function passQrDataUrl(code) {
  return QRCode.toDataURL(passQrPayload(code), QR_OPTIONS);
}

/**
 * Data-URL (base64 PNG) of a QR encoding a plain https link.
 *
 * Used for shareable event codes. The payload is deliberately the *same*
 * universal link we hand out as text (https://api.ourcityvibe.com/event/<token>)
 * rather than a `mobile://` scheme or a bespoke prefix, because that one string
 * satisfies every scanner:
 *   - iOS/Android camera → Universal Link / App Link opens the app if installed
 *   - no app installed    → the deep-link landing page in the browser
 *   - our in-app scanner  → app/scan.tsx already matches /event/<id> links
 * A custom scheme would only work from inside our own scanner.
 *
 * Rendered a touch larger than the pass QR: event codes get printed on flyers
 * and screenshotted, so they're scanned from further away.
 */
export function linkQrDataUrl(url) {
  return QRCode.toDataURL(String(url), { ...QR_OPTIONS, width: 512 });
}
