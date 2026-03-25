import express from "express";
import { authenticateAdmin } from "../middleware/admin.middleware.js";
import {
  adminLogin,
  getStats,
  getUsers,
  deleteUser,
  getVendors,
  toggleVendorVerified,
  deleteVendor,
  getCitiesAdmin,
  createCity,
  deleteCity,
  getVendorTypesAdmin,
  createVendorType,
  deleteVendorType,
  getEvents,
  toggleEventActive,
  deleteEvent,
  getGuides,
  toggleGuideActive,
  deleteGuide,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.post("/admin/login", adminLogin);

// All routes below require admin authentication
router.get("/admin/stats", authenticateAdmin, getStats);

// Users
router.get("/admin/users", authenticateAdmin, getUsers);
router.delete("/admin/users/:id", authenticateAdmin, deleteUser);

// Vendors (from Vendor collection)
router.get("/admin/vendors", authenticateAdmin, getVendors);
router.patch("/admin/vendors/:id/verify", authenticateAdmin, toggleVendorVerified);
router.delete("/admin/vendors/:id", authenticateAdmin, deleteVendor);

// Cities
router.get("/admin/cities", authenticateAdmin, getCitiesAdmin);
router.post("/admin/cities", authenticateAdmin, createCity);
router.delete("/admin/cities/:id", authenticateAdmin, deleteCity);

// Vendor Types
router.get("/admin/vendor-types", authenticateAdmin, getVendorTypesAdmin);
router.post("/admin/vendor-types", authenticateAdmin, createVendorType);
router.delete("/admin/vendor-types/:id", authenticateAdmin, deleteVendorType);

// Events
router.get("/admin/events", authenticateAdmin, getEvents);
router.patch("/admin/events/:id/toggle", authenticateAdmin, toggleEventActive);
router.delete("/admin/events/:id", authenticateAdmin, deleteEvent);

// Guides
router.get("/admin/guides", authenticateAdmin, getGuides);
router.patch("/admin/guides/:id/toggle", authenticateAdmin, toggleGuideActive);
router.delete("/admin/guides/:id", authenticateAdmin, deleteGuide);

export default router;
