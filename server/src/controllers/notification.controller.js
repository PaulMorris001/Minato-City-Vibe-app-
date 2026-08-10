import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";

/**
 * Save or update the Expo push token for the authenticated user.
 */
export const savePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token is required" });

    // A device has exactly one FCM token. If other accounts were previously
    // logged in on this device and still hold this token, detach it from them
    // so a single push isn't delivered once per stale account.
    await User.updateMany(
      { _id: { $ne: req.user.id }, fcmToken: token },
      { fcmToken: null }
    );

    await User.findByIdAndUpdate(req.user.id, { fcmToken: token });
    res.status(200).json({ message: "Push token saved" });
  } catch (error) {
    console.error("Save push token error:", error);
    res.status(500).json({ message: "Failed to save push token" });
  }
};

/**
 * Clear the push token on logout.
 */
export const deletePushToken = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { fcmToken: null });
    res.status(200).json({ message: "Push token removed" });
  } catch (error) {
    console.error("Delete push token error:", error);
    res.status(500).json({ message: "Failed to remove push token" });
  }
};

/**
 * Read the email/push channel preferences for the authenticated user.
 * Absent sub-fields fall back to the schema defaults (opt-out model).
 */
export const getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("notificationPrefs").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      preferences: {
        eventReminderEmails: user.notificationPrefs?.eventReminderEmails !== false,
      },
    });
  } catch (error) {
    console.error("Get notification preferences error:", error);
    res.status(500).json({ message: "Failed to load notification preferences" });
  }
};

/**
 * Update the channel preferences. Only the keys present in the body change, so
 * the client can toggle one switch without echoing the whole object back.
 */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const { eventReminderEmails } = req.body;
    const update = {};
    if (typeof eventReminderEmails === "boolean") {
      update["notificationPrefs.eventReminderEmails"] = eventReminderEmails;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No supported preference supplied" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true }
    ).select("notificationPrefs");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Preferences updated",
      preferences: {
        eventReminderEmails: user.notificationPrefs?.eventReminderEmails !== false,
      },
    });
  } catch (error) {
    console.error("Update notification preferences error:", error);
    res.status(500).json({ message: "Failed to update notification preferences" });
  }
};

/**
 * Get all notifications for the authenticated user (newest first).
 */
export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ notifications });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Failed to load notifications" });
  }
};

/**
 * Mark a single notification as read.
 */
export const markRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true }
    );
    res.json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark all notifications as read.
 */
export const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ message: "All marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DEPRECATED — no-op. Sale notifications are written server-side now.
 *
 * This used to be called by the BUYER's client after checkout to notify the
 * seller, which made a seller's record of their own sale depend on the buyer's
 * app staying open long enough to fire it. Web checkout never called it at all.
 * It also read `guide.createdBy`, a field that doesn't exist on the Guide schema
 * (it's `author`), so every guide branch wrote `{ user: undefined }`, failed
 * validation, and had the error swallowed by the catch below — guide sellers
 * never received a single in-app sale notification.
 *
 * Both are fixed in services/payments/fulfillment.js, which notifies from the
 * server the moment a payment is verified.
 *
 * Returns 200 rather than 410: app binaries already in the wild still call this
 * and only `.catch(() => {})` around it, so a 200 guarantees no error surfaces
 * to a buyer. Delete the route once the warning below stops appearing in logs.
 */
export const notifySold = async (req, res) => {
  console.warn(
    `[notifySold] Deprecated endpoint called by user ${req.user?.id} ` +
      `(type=${req.body?.type}). Sale notifications are sent by fulfillment.js; ` +
      `this client build is out of date.`
  );
  res.json({ message: "deprecated — sale notifications are sent server-side" });
};
