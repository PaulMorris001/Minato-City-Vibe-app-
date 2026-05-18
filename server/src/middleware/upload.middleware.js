/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads using multer
 */

import multer from "multer";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to only accept images. iOS phones default to HEIC/HEIF, so we
// accept those alongside the web-standard formats; Cloudinary handles the
// conversion on the way in. We also normalize mimetype case + the bogus
// `image/jpg` variant some clients send.
const ALLOWED_MIME_TYPES = new Set([
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

const fileFilter = (req, file, cb) => {
  const normalized = (file.mimetype || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(normalized)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported image format (${file.mimetype || "unknown"}). JPEG, PNG, GIF, WebP, and HEIC are supported.`
    );
    err.code = "UNSUPPORTED_FILE_TYPE";
    cb(err, false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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
        message = "That image is too large. Pick something under 10 MB.";
      }
      return res.status(status).json({ message, code: err.code });
    });
  };
}

// Export different upload configurations
export const uploadSingle = jsonifyUploadErrors(upload.single("image"));
export const uploadMultiple = jsonifyUploadErrors(upload.array("images", 10));
export const uploadFields = jsonifyUploadErrors(
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "businessPicture", maxCount: 1 },
    { name: "eventImage", maxCount: 1 },
  ])
);

export default upload;
