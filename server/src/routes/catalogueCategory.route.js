import express from "express";
import {
  getCategoriesByVendorId,
  getVendorCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/catalogueCategory.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public route (no authentication required) — clients browsing a vendor
router.get("/vendors/:vendorId/categories", getCategoriesByVendorId);

// Protected routes. Auth is applied per-route — NOT via `router.use(authenticate)`
// (see service.route.js for the rationale: router-level middleware would 401
// requests bound for other routers mounted at "/api/").
router.get("/vendor/categories", authenticate, getVendorCategories);
router.post("/vendor/categories", authenticate, createCategory);
router.put("/vendor/categories/:id", authenticate, updateCategory);
router.delete("/vendor/categories/:id", authenticate, deleteCategory);

export default router;
