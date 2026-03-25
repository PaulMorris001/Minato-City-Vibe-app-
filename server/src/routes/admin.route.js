import express from "express";
import { authenticateAdmin } from "../middleware/admin.middleware.js";
import { debugVendors } from "../controllers/vendors.controller.js";
import {
  adminLogin,
  getStats,
  getUsers,
  deleteUser,
  toggleVendorVerified,
  getEvents,
  toggleEventActive,
  deleteEvent,
  getGuides,
  toggleGuideActive,
  deleteGuide,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.post("/admin/login", adminLogin);
router.get("/admin/debug/vendors", debugVendors); // temp: remove after diagnosis

// All routes below require admin authentication
router.get("/admin/stats", authenticateAdmin, getStats);

router.get("/admin/users", authenticateAdmin, getUsers);
router.delete("/admin/users/:id", authenticateAdmin, deleteUser);
router.patch("/admin/users/:id/verify", authenticateAdmin, toggleVendorVerified);

router.get("/admin/events", authenticateAdmin, getEvents);
router.patch("/admin/events/:id/toggle", authenticateAdmin, toggleEventActive);
router.delete("/admin/events/:id", authenticateAdmin, deleteEvent);

router.get("/admin/guides", authenticateAdmin, getGuides);
router.patch("/admin/guides/:id/toggle", authenticateAdmin, toggleGuideActive);
router.delete("/admin/guides/:id", authenticateAdmin, deleteGuide);

export default router;
