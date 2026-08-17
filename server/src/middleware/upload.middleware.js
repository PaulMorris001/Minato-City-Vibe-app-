/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads using multer
 */

import multer from "multer";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to accept images and short videos. iOS phones default to
// HEIC/HEIF for photos and QuickTime (.mov) for video, so we accept those
// alongside the web-standard formats; Cloudinary handles the conversion on the
// way in. We also normalize mimetype case + the bogus `image/jpg` variant some
// clients send.
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-matroska",
]);

// Photos stay on the old 10 MB budget; video needs room for a minute of phone
// footage — 4K/60 on a recent iPhone runs ~350 MB/min, but the client
// re-encodes at quality 0.8 before upload, which lands a 60s clip well under
// this. multer can only enforce ONE byte ceiling, so it gets the larger of the
// two and the image-specific limit is applied after the fact — `fileFilter`
// runs before any bytes are read, so it can't know the size yet.
//
// Keep MAX_VIDEO_BYTES in sync with mobile/utils/imageUpload.ts, which rejects
// oversized picks up front so the user isn't made to wait for an upload that
// was always going to 413.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// Every media collection in the app (event galleries, guide sections, vendor
// products, catalogue categories) caps at 10 items, so one request never needs
// to carry more than that.
export const MAX_MEDIA_PER_REQUEST = 10;

export const isVideoMimeType = (mimetype) =>
  ALLOWED_VIDEO_MIME_TYPES.has((mimetype || "").toLowerCase());

/**
 * Reject any file that's within multer's shared ceiling but over the limit for
 * its own kind. Returns an error message, or null when the file is fine.
 */
export function mediaSizeError(file) {
  if (!file) return null;
  const isVideo = isVideoMimeType(file.mimetype);
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= limit) return null;
  return isVideo
    ? `That video is too large. Pick something under ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`
    : `That image is too large. Pick something under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`;
}

const fileFilter = (req, file, cb) => {
  const normalized = (file.mimetype || "").toLowerCase();
  if (ALLOWED_IMAGE_MIME_TYPES.has(normalized) || ALLOWED_VIDEO_MIME_TYPES.has(normalized)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported file format (${file.mimetype || "unknown"}). JPEG, PNG, GIF, WebP and HEIC images, and MP4, MOV and WebM video are supported.`
    );
    err.code = "UNSUPPORTED_FILE_TYPE";
    cb(err, false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_VIDEO_BYTES,
  },
  fileFilter: fileFilter,
});

/**
 * Wrap a multer middleware so any error (file-filter rejection, size limit,
 * malformed multipart, etc.) returns a JSON response instead of bubbling to
 * Express's default HTML error page — which the mobile client tries to parse
 * as JSON and fails on.
 */
function jsonifyUploadErrors(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (!err) return next();
      // multer.MulterError surfaces field-level problems (size, count, …)
      const isMulter = err.name === "MulterError";
      const status =
        err.code === "UNSUPPORTED_FILE_TYPE"
          ? 415
          : isMulter && err.code === "LIMIT_FILE_SIZE"
            ? 413
            : 400;
      let message = err.message || "Upload failed";
      if (isMulter && err.code === "LIMIT_FILE_SIZE") {
        message = `That file is too large. Images must be under ${Math.round(
          MAX_IMAGE_BYTES / 1024 / 1024
        )} MB and videos under ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`;
      }
      if (isMulter && err.code === "LIMIT_FILE_COUNT") {
        message = `You can upload up to ${MAX_MEDIA_PER_REQUEST} files at a time.`;
      }
      return res.status(status).json({ message, code: err.code });
    });
  };
}

// Export different upload configurations
export const uploadSingle = jsonifyUploadErrors(upload.single("image"));
export const uploadMultiple = jsonifyUploadErrors(
  upload.array("images", MAX_MEDIA_PER_REQUEST)
);
export const uploadFields = jsonifyUploadErrors(
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "businessPicture", maxCount: 1 },
    { name: "eventImage", maxCount: 1 },
  ])
);

export default upload;
