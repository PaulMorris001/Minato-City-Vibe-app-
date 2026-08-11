import { Linking, Platform, Share } from "react-native";

export type ShareQrResult =
  | { ok: true; mode: "image" | "link" }
  | { ok: false; error: "write_failed" | "failed" };

/**
 * expo-sharing is a NATIVE module, so it only exists in binaries built after it
 * was added to package.json — it can't arrive via an OTA JS update. Load it
 * lazily and treat "missing" as a fallback path rather than a crash, matching
 * how utils/calendar.ts handles expo-calendar.
 */
function loadSharing(): typeof import("expo-sharing") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-sharing");
  } catch {
    return null;
  }
}

/**
 * expo-file-system is native too, and its entry point calls
 * `requireNativeModule("ExpoFileSystem")` at module scope — which THROWS on a
 * binary that predates it. A static `import` of it therefore takes down every
 * screen that (transitively) imports this file, not just the QR sheet. Load it
 * lazily for the same reason expo-sharing is loaded lazily above.
 */
function loadFileSystem(): typeof import("expo-file-system") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-file-system");
  } catch {
    return null;
  }
}

/** Filesystem-safe stem for the exported file, so "Save to Files" names it usefully. */
function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "event";
}

/**
 * Share an event's QR code as an actual PNG.
 *
 * The QR arrives from the API as a base64 data URL. Handing that string (or the
 * event link) to the OS share sheet is what made "Save to Files" write a text
 * file instead of the code — the sheet can only export what it's given. So we
 * materialise the PNG in the cache directory first and share the *file*.
 *
 * Three tiers, best available wins:
 *   1. expo-sharing — a real file share on both platforms. Needs a binary built
 *      after expo-sharing was added.
 *   2. RN Share with a `file://` url — iOS only (Android's Share ignores `url`),
 *      but it works on today's binaries, so iOS is fixed over the air.
 *   3. Plain text with the link — last resort, the old behaviour.
 *
 * Returns which mode was used so the caller can tell the user when the image
 * itself couldn't be attached.
 */
/**
 * Open the QR as a real PNG in the system browser, where the user can
 * long-press → "Save Image" (iOS) / "Download image" (Android).
 *
 * This is the download path that needs NO native module: `Linking` ships with
 * React Native itself, and the server renders the PNG at a plain https URL
 * (`<share link>/qr.png`), so it works on binaries built long before any
 * file-system or sharing module existed — i.e. over the air, no new build.
 *
 * @param url the event's share link, e.g. https://api.ourcityvibe.com/event/lagos-beach-party
 */
export async function openQrForSaving(url: string): Promise<boolean> {
  try {
    // Tolerate a trailing slash so we never produce `…/event/x//qr.png`.
    await Linking.openURL(`${url.replace(/\/+$/, "")}/qr.png`);
    return true;
  } catch {
    return false;
  }
}

export async function shareEventQr({
  dataUrl,
  title,
  url,
}: {
  /** `data:image/png;base64,…` as returned by GET /events/:id/qr */
  dataUrl: string | null;
  title: string;
  url: string;
}): Promise<ShareQrResult> {
  const message = `Check out this event on OurCityvibe: ${title}\n${url}`;

  const shareLinkOnly = async (): Promise<ShareQrResult> => {
    try {
      await Share.share({ message, title });
      return { ok: true, mode: "link" };
    } catch {
      return { ok: false, error: "failed" };
    }
  };

  const base64 = dataUrl?.includes(",") ? dataUrl.split(",")[1] : null;
  if (!base64) return shareLinkOnly();

  // Write the PNG somewhere the share sheet can read it from.
  const FS = loadFileSystem();
  if (!FS) return shareLinkOnly();

  let fileUri: string;
  try {
    const file = new FS.File(FS.Paths.cache, `ourcityvibe-${slugify(title)}-qr.png`);
    // overwrite: re-sharing the same event would otherwise throw on the file
    // left behind by the previous share.
    file.create({ overwrite: true });
    file.write(base64, { encoding: "base64" });
    fileUri = file.uri;
  } catch {
    // Couldn't stage the image — still let them send the link.
    return shareLinkOnly();
  }

  const Sharing = loadSharing();
  if (Sharing) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: title,
        });
        return { ok: true, mode: "image" };
      }
    } catch {
      // User dismissed, or the provider failed — fall through.
      return { ok: false, error: "failed" };
    }
  }

  // RN's Share only honours `url` on iOS; on Android it's dropped silently,
  // which is exactly the text-instead-of-image bug we're fixing.
  if (Platform.OS === "ios") {
    try {
      await Share.share({ url: fileUri, title });
      return { ok: true, mode: "image" };
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  return shareLinkOnly();
}
