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
 * Called by the mobile after a ticket/guide purchase to notify the seller.
 * Body: { type: "ticket" | "guide", id: eventId | guideId }
 */
export const notifySold = async (req, res) => {
  try {
    const { type, id } = req.body;

    if (type === "ticket") {
      const event = await Event.findById(id);
      if (!event) return res.status(404).json({ message: "Event not found" });

      await Notification.create({
        user: event.createdBy,
        type: "ticket_sold",
        title: "Ticket Sold!",
        body: `Someone purchased a ticket for "${event.title}"`,
        data: { eventId: id },
      });
    } else if (type === "guide") {
      const guide = await Guide.findById(id);
      if (!guide) return res.status(404).json({ message: "Guide not found" });

      await Notification.create({
        user: guide.createdBy,
        type: "guide_sold",
        title: "Guide Sold!",
        body: `Someone purchased your guide "${guide.title}"`,
        data: { guideId: id },
      });
    }

    res.json({ message: "Notification sent" });
  } catch (error) {
    console.error("Notify sold error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
