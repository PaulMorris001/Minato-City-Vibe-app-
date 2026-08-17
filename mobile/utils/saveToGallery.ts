import { isVideoUrl } from "@/utils/media";
import { slugify } from "@/utils/qrShare";
import { showError, showSuccess } from "@/utils/toast";

/**
 * Saving media into the device's photo library.
 *
 * Two sources feed this: remote Cloudinary URLs (chat photos and videos, event
 * and guide galleries) and the base64 data URLs the API returns for QR codes.
 * Both end up in the same place — a file staged in the cache directory, handed
 * to MediaLibrary, then deleted.
 *
 * expo-media-library and expo-file-system are NATIVE modules, so they only
 * exist in binaries built after they were added to package.json — they can't
 * arrive via an OTA JS update, and expo-file-system's entry point THROWS at
 * module scope on an older binary. Both are loaded lazily for the same reason
 * utils/qrShare.ts does it: a static import would take down every screen that
 * transitively imports this file, not just the save button.
 */

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "unsupported" | "failed" };

/**
 * The file type we stage into. `downloadFileAsync` is declared on the base
 * class and returns that base rather than the richer `FileSystem.File`, so
 * naming its return type is what lets one variable hold both a downloaded file
 * and a `new File(...)` we wrote ourselves.
 */
type StagedFile = Awaited<
  ReturnType<typeof import("expo-file-system").File.downloadFileAsync>
>;

function loadMediaLibrary(): typeof import("expo-media-library") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-media-library");
  } catch {
    return null;
  }
}

function loadFileSystem(): typeof import("expo-file-system") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-file-system");
  } catch {
    return null;
  }
}

/**
 * Ask for add-only access. `writeOnly` matters on iOS: it shows the far less
 * alarming "Add to Photos" prompt instead of asking to read the whole library,
 * which we never do.
 */
async function ensureWritePermission(
  MediaLibrary: typeof import("expo-media-library")
): Promise<boolean> {
  try {
    const current = await MediaLibrary.getPermissionsAsync(true);
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await MediaLibrary.requestPermissionsAsync(true);
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * The extension the staged file needs. The photo library decides whether an
 * asset is a photo or a video from the file itself, so a video written as
 * `.jpg` imports as a broken still.
 */
function extensionFor(url: string): string {
  const [path] = url.split(/[?#]/);
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  if (match) return match[1].toLowerCase();
  return isVideoUrl(url) ? "mp4" : "jpg";
}

/** Download a remote photo or video and add it to the user's library. */
export async function saveRemoteMediaToGallery(
  url: string,
  hint: string
): Promise<SaveResult> {
  const MediaLibrary = loadMediaLibrary();
  const FS = loadFileSystem();
  if (!MediaLibrary || !FS) return { ok: false, reason: "unsupported" };

  if (!(await ensureWritePermission(MediaLibrary))) {
    return { ok: false, reason: "permission" };
  }

  let file: StagedFile | null = null;
  try {
    const target = new FS.File(
      FS.Paths.cache,
      `ourcityvibe-${slugify(hint)}.${extensionFor(url)}`
    );
    // idempotent: saving the same photo twice would otherwise throw on the
    // file left behind by the first save.
    file = await FS.File.downloadFileAsync(url, target, { idempotent: true });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    try {
      file?.delete();
    } catch {
      // Best-effort cleanup — the OS clears the cache directory anyway.
    }
  }
}

/**
 * Add a base64 image to the library. QR codes arrive from the API as
 * `data:image/png;base64,…`, never as a fetchable URL.
 */
export async function saveBase64ImageToGallery(
  dataUrl: string | null | undefined,
  hint: string
): Promise<SaveResult> {
  const base64 = dataUrl?.includes(",") ? dataUrl.split(",")[1] : null;
  if (!base64) return { ok: false, reason: "failed" };

  const MediaLibrary = loadMediaLibrary();
  const FS = loadFileSystem();
  if (!MediaLibrary || !FS) return { ok: false, reason: "unsupported" };

  if (!(await ensureWritePermission(MediaLibrary))) {
    return { ok: false, reason: "permission" };
  }

  let file: StagedFile | null = null;
  try {
    file = new FS.File(FS.Paths.cache, `ourcityvibe-${slugify(hint)}-qr.png`);
    file.create({ overwrite: true });
    file.write(base64, { encoding: "base64" });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    try {
      file?.delete();
    } catch {
      // Best-effort cleanup.
    }
  }
}

/**
 * Run a save and toast the outcome. Every call site wants the same four
 * messages, so they live here rather than being retyped at each button.
 */
export async function saveWithFeedback(
  run: () => Promise<SaveResult>,
  successMessage: string
): Promise<boolean> {
  const result = await run();
  if (result.ok) {
    showSuccess(successMessage, "Saved");
    return true;
  }
  if (result.reason === "permission") {
    showError(
      "Allow OurCityvibe to add photos in Settings, then try again.",
      "Photo access needed"
    );
  } else if (result.reason === "unsupported") {
    showError("Update the app to save media to your device.", "Not available");
  } else {
    showError("Couldn't save that. Check your connection and try again.");
  }
  return false;
}
