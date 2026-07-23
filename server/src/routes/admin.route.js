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
  getAnalyticsSummary,
  getAnalyticsEvents,
  getVerifications,
  approveVerification,
  rejectVerification,
  getReports,
  resolveReport,
  getReportTarget,
  getPendingPaidEvents,
  approvePaidEvent,
  rejectPaidEvent,
  getPendingEventEdits,
  approveEventEdit,
  rejectEventEdit,
} from "../controllers/admin.controller.js";
import {
  getPayouts,
  approvePayout,
  rejectPayout,
} from "../controllers/payoutAdmin.controller.js";

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

// Analytics
router.get("/admin/analytics/summary", authenticateAdmin, getAnalyticsSummary);
router.get("/admin/analytics/events", authenticateAdmin, getAnalyticsEvents);

// Verifications
router.get("/admin/verifications", authenticateAdmin, getVerifications);
router.patch("/admin/verifications/:id/approve", authenticateAdmin, approveVerification);
router.patch("/admin/verifications/:id/reject", authenticateAdmin, rejectVerification);

// Vendor payout approval queue — review and release held funds
router.get("/admin/payouts", authenticateAdmin, getPayouts);
router.post("/admin/payouts/:id/approve", authenticateAdmin, approvePayout);
router.post("/admin/payouts/:id/reject", authenticateAdmin, rejectPayout);

// Paid event approval queue (trust system)
router.get("/admin/paid-events", authenticateAdmin, getPendingPaidEvents);
router.patch("/admin/paid-events/:id/approve", authenticateAdmin, approvePaidEvent);
router.patch("/admin/paid-events/:id/reject", authenticateAdmin, rejectPaidEvent);

// Creator event-edit approval queue
router.get("/admin/event-edits", authenticateAdmin, getPendingEventEdits);
router.patch("/admin/event-edits/:id/approve", authenticateAdmin, approveEventEdit);
router.patch("/admin/event-edits/:id/reject", authenticateAdmin, rejectEventEdit);

// Reports (Apple Guideline 1.2 moderation queue)
router.get("/admin/reports", authenticateAdmin, getReports);
router.get("/admin/reports/:id/target", authenticateAdmin, getReportTarget);
router.patch("/admin/reports/:id", authenticateAdmin, resolveReport);

export default router;
