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
  getGuidesByCity
} from "../controllers/guide.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/topics", getTopics);
router.get("/guides/all", getGuides);

// Protected user routes
router.get("/guides/my-guides", authenticate, getUserGuides);
router.get("/guides/purchased", authenticate, getPurchasedGuides);

// Public city guides - using /city/ prefix to avoid ANY conflict with /guide/
router.get("/guides/city/:cityId", getGuidesByCity);


// Protected guide CRU(D) operations
router.post("/guides", authenticate, createGuide);
router.get("/guides/:id", authenticate, getGuideById);
router.put("/guides/:id", authenticate, updateGuide);
router.delete("/guides/:id", authenticate, deleteGuide);
router.post("/guides/:id/purchase", authenticate, purchaseGuide);

export default router;
