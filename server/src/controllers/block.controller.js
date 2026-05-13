import mongoose from "mongoose";
import User from "../models/user.model.js";
import Follow from "../models/follow.model.js";
import Report from "../models/report.model.js";

export const blockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const target = await User.findById(userId).select("_id username");
    if (!target) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { blockedUsers: userId },
    });

    // Sever follow relationships in both directions
    await Follow.deleteMany({
      $or: [
        { follower: req.user.id, following: userId },
        { follower: userId, following: req.user.id },
      ],
    });

    // Notify the developer via the admin report queue
    const existing = await Report.findOne({
      reporter: req.user.id,
      targetType: "user",
      targetId: userId,
      status: "open",
    });
    if (!existing) {
      await Report.create({
        reporter: req.user.id,
        targetType: "user",
        targetId: userId,
        targetUser: userId,
        reason: "blocked",
        details: "User was blocked via in-app Block action.",
      });
    }

    return res.json({ message: "User blocked", userId });
  } catch (err) {
    console.error("blockUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: userId },
    });
    return res.json({ message: "User unblocked", userId });
  } catch (err) {
    console.error("unblockUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getBlockedUsers = async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .select("blockedUsers")
      .populate("blockedUsers", "username profilePicture");
    return res.json({ blockedUsers: me?.blockedUsers || [] });
  } catch (err) {
    console.error("getBlockedUsers error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
