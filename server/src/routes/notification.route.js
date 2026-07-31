import express from "express";
import {
  savePushToken,
  deletePushToken,
  getNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  markRead,
  markAllRead,
  notifySold,
} from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.put("/notifications/token", authenticate, savePushToken);
router.delete("/notifications/token", authenticate, deletePushToken);

// Channel preferences (email reminders). Must be declared before the
// "/notifications/:id/read" style routes are matched for other verbs.
router.get("/notifications/preferences", authenticate, getNotificationPreferences);
router.put("/notifications/preferences", authenticate, updateNotificationPreferences);

router.get("/notifications", authenticate, getNotifications);
router.put("/notifications/read-all", authenticate, markAllRead);
router.put("/notifications/:id/read", authenticate, markRead);
router.post("/notifications/sold", authenticate, notifySold);

export default router;
