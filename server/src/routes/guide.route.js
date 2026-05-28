import express from "express";
import {
  createGuide,
  getGuides,
  getTopGuides,
  getUserGuides,
  getUserPublicGuides,
  getGuideById,
  updateGuide,
  deleteGuide,
  purchaseGuide,
  getPurchasedGuides,
  getTopics,
  getGuidesByCity,
  getGuideLocations,
  toggleSaveGuide,
  getSavedGuides,
} from "../controllers/guide.controller.js";
import { authenticate, optionalAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes - NO authentication required
router.get("/guides/topics", getTopics);
router.get("/guides/all", optionalAuth, getGuides);
router.get("/guides/top", optionalAuth, getTopGuides);
router.get("/guide/by-city", authenticate, getGuidesByCity);
router.get("/guide/locations", optionalAuth, getGuideLocations);

// Protected user routes - MUST come before /guides/:id to avoid route conflicts
router.get("/guides/my-guides", authenticate, getUserGuides);
router.get("/users/:userId/guides", authenticate, getUserPublicGuides);
router.get("/guides/purchased", authenticate, getPurchasedGuides);
router.get("/guides/saved", authenticate, getSavedGuides);

// Protected guide CRU(D) operations
router.post("/guides", authenticate, createGuide);
router.get("/guides/:id", optionalAuth, getGuideById);
router.put("/guides/:id", authenticate, updateGuide);
router.delete("/guides/:id", authenticate, deleteGuide);
router.post("/guides/:id/purchase", authenticate, purchaseGuide);
router.post("/guides/:id/save", authenticate, toggleSaveGuide);

export default router;
