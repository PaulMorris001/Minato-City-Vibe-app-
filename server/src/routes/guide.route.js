import express from "express";
import {
  createGuide,
  getGuides,
  getUserGuides,
  getGuideById,
  updateGuide,
  deleteGuide,
  purchaseGuide,
  getPurchasedGuides,
  getTopics,
  getGuidesByCity,
} from "../controllers/guide.controller.js";
import { authenticate, optionalAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes - NO authentication required
router.get("/guides/topics", getTopics);
router.get("/guides/all", optionalAuth, getGuides);
router.get("/guide/by-city", authenticate, getGuidesByCity);

// Protected user routes - MUST come before /guides/:id to avoid route conflicts
router.get("/guides/my-guides", authenticate, getUserGuides);
router.get("/guides/purchased", authenticate, getPurchasedGuides);

// Protected guide CRU(D) operations
router.post("/guides", authenticate, createGuide);
router.get("/guides/:id", authenticate, getGuideById);
router.put("/guides/:id", authenticate, updateGuide);
router.delete("/guides/:id", authenticate, deleteGuide);
router.post("/guides/:id/purchase", authenticate, purchaseGuide);

export default router;
