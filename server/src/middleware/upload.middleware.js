/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads using multer
 */

import multer from "multer";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to only accept images
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed."), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Export different upload configurations
export const uploadSingle = upload.single("image");
export const uploadMultiple = upload.array("images", 10); // Max 10 images
export const uploadFields = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "businessPicture", maxCount: 1 },
  { name: "eventImage", maxCount: 1 },
]);

export default upload;
