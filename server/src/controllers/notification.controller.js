import User from "../models/user.model.js";

/**
 * Save or update the Expo push token for the authenticated user.
 * Called from the mobile app on every launch after permissions are granted.
 */
export const savePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token is required" });

    await User.findByIdAndUpdate(req.user.id, { expoPushToken: token });
    res.status(200).json({ message: "Push token saved" });
  } catch (error) {
    console.error("Save push token error:", error);
    res.status(500).json({ message: "Failed to save push token" });
  }
};

/**
 * Clear the push token (called on logout so the device stops receiving notifications).
 */
export const deletePushToken = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { expoPushToken: null });
    res.status(200).json({ message: "Push token removed" });
  } catch (error) {
    console.error("Delete push token error:", error);
    res.status(500).json({ message: "Failed to remove push token" });
  }
};
