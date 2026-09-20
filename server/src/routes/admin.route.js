import express from "express";
import { authenticateAdmin } from "../middleware/admin.middleware.js";
import {
  getAnnouncements,
  getAnnouncementGroups,
  previewAudience,
  sendAnnouncement,
} from "../controllers/announcement.controller.js";
import { adminLoginLimiter } from "../middleware/rateLimit.middleware.js";
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
  getGuideTopicsAdmin,
  createGuideTopic,
  deleteGuideTopic,
  getEvents,
  getEventSignupsAdmin,
  toggleEventActive,
  deleteEvent,
  getRaffleEntries,
  getRaffleCampaigns,
  createRaffleCampaign,
  updateRaffleCampaign,
  endRaffleCampaign,
  deleteRaffleEntry,
  deleteRaffleCampaign,
  drawRaffleWinners,
  setRaffleWinner,
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
  getEventCancellations,
  approveEventCancellation,
  rejectEventCancellation,
} from "../controllers/admin.controller.js";
import {
  getPayouts,
  approvePayout,
  rejectPayout,
} from "../controllers/payoutAdmin.controller.js";
import {
  getDiscountCodes,
  createDiscountCode,
  toggleDiscountCode,
  deleteDiscountCode,
} from "../controllers/discountAdmin.controller.js";
import { getCouponTransactions } from "../controllers/couponAdmin.controller.js";

const router = express.Router();

router.post("/admin/login", adminLoginLimiter, adminLogin);

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

// Guide Topics
router.get("/admin/guide-topics", authenticateAdmin, getGuideTopicsAdmin);
router.post("/admin/guide-topics", authenticateAdmin, createGuideTopic);
router.delete("/admin/guide-topics/:id", authenticateAdmin, deleteGuideTopic);

// Events
router.get("/admin/events", authenticateAdmin, getEvents);
router.get("/admin/events/:id/signups", authenticateAdmin, getEventSignupsAdmin);
router.patch("/admin/events/:id/toggle", authenticateAdmin, toggleEventActive);
router.delete("/admin/events/:id", authenticateAdmin, deleteEvent);

// Birthday Raffle — campaigns (register above the :id winner route)
router.get("/admin/raffle/campaigns", authenticateAdmin, getRaffleCampaigns);
router.post("/admin/raffle/campaigns", authenticateAdmin, createRaffleCampaign);
router.patch("/admin/raffle/campaigns/:id", authenticateAdmin, updateRaffleCampaign);
router.post("/admin/raffle/campaigns/:id/end", authenticateAdmin, endRaffleCampaign);
router.delete("/admin/raffle/campaigns/:id", authenticateAdmin, deleteRaffleCampaign);
router.delete("/admin/raffle/entries/:id", authenticateAdmin, deleteRaffleEntry);
// The merit ranking (highest verified RSVPs) the published official rules promise entrants.
router.post("/admin/raffle/campaigns/:id/draw", authenticateAdmin, drawRaffleWinners);
// Birthday Raffle — entries + winner selection
router.get("/admin/raffle/entries", authenticateAdmin, getRaffleEntries);
router.patch("/admin/raffle/:id/winner", authenticateAdmin, setRaffleWinner);

// OurCityVibe credit — read-only ledger of every award/spend/refund/expiry
router.get("/admin/coupons", authenticateAdmin, getCouponTransactions);

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

// Event cancellation review — approving is what runs the refunds.
router.get("/admin/event-cancellations", authenticateAdmin, getEventCancellations);
router.patch("/admin/event-cancellations/:id/approve", authenticateAdmin, approveEventCancellation);
router.patch("/admin/event-cancellations/:id/reject", authenticateAdmin, rejectEventCancellation);

// Broadcasts to the user base. Fans out through notifyUser so recipients get
// an in-app record too, not just a push.
router.get("/admin/announcements", authenticateAdmin, getAnnouncements);
router.get("/admin/announcement-groups", authenticateAdmin, getAnnouncementGroups);
// No side effects — lets the console show the real reach before it sends.
router.post("/admin/announcements/preview", authenticateAdmin, previewAudience);
router.post("/admin/announcements", authenticateAdmin, sendAnnouncement);

// Event discount codes (admin-created; creators can only toggle theirs)
router.get("/admin/discount-codes", authenticateAdmin, getDiscountCodes);
router.post("/admin/discount-codes", authenticateAdmin, createDiscountCode);
router.patch("/admin/discount-codes/:id/toggle", authenticateAdmin, toggleDiscountCode);
router.delete("/admin/discount-codes/:id", authenticateAdmin, deleteDiscountCode);

// Reports (Apple Guideline 1.2 moderation queue)
router.get("/admin/reports", authenticateAdmin, getReports);
router.get("/admin/reports/:id/target", authenticateAdmin, getReportTarget);
router.patch("/admin/reports/:id", authenticateAdmin, resolveReport);

export default router;
