/**
 * Upload Routes
 * Handles file upload endpoints
 */

import express from "express";
import { uploadSingle, uploadMultiple } from "../middleware/upload.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { uploadImage, uploadMultipleImages, uploadBase64Image } from "../services/image.service.js";

const router = express.Router();

/**
 * POST /api/upload/image
 * Upload a single image file
 * Expects multipart/form-data with field name "image"
 */
router.post("/image", authenticate, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { folder = "nightvibe" } = req.body;
    const result = await uploadImage(req.file, folder);

    res.status(200).json({
      message: "Image uploaded successfully",
      url: result.url,
      publicId: result.publicId,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ message: "Error uploading image", error: error.message });
  }
});

/**
 * POST /api/upload/images
 * Upload multiple images
 * Expects multipart/form-data with field name "images"
 */
router.post("/images", authenticate, uploadMultiple, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const { folder = "nightvibe" } = req.body;
    const results = await uploadMultipleImages(req.files, folder);

    res.status(200).json({
      message: "Images uploaded successfully",
      images: results,
    });
  } catch (error) {
    console.error("Images upload error:", error);
    res.status(500).json({ message: "Error uploading images", error: error.message });
  }
});

/**
 * POST /api/upload/base64
 * Upload a base64 encoded image
 * Expects JSON body with { base64: "data:image/...", folder: "..." }
 */
router.post("/base64", authenticate, async (req, res) => {
  try {
    const { base64, folder = "nightvibe" } = req.body;

    if (!base64) {
      return res.status(400).json({ message: "No base64 data provided" });
    }

    const result = await uploadBase64Image(base64, folder);

    res.status(200).json({
      message: "Image uploaded successfully",
      url: result.url,
      publicId: result.publicId,
    });
  } catch (error) {
    console.error("Base64 upload error:", error);
    res.status(500).json({ message: "Error uploading image", error: error.message });
  }
});

export default router;
