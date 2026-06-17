import QRCode from "qrcode";

// Prefix that marks a QR as a CityVibe attendance pass, so the in-app scanner
// can tell it apart from event/guide deep-link QRs.
export const PASS_QR_PREFIX = "cityvibe-pass:";

// CityVibe brand purple on white. High error-correction ("H") so the code still
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
