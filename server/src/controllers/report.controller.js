import mongoose from "mongoose";
import Report from "../models/report.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import User from "../models/user.model.js";

const VALID_TYPES = ["user", "event", "guide"];
const VALID_REASONS = ["spam", "harassment", "hate", "sexual", "violence", "other"];

export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, details } = req.body;

    if (!VALID_TYPES.includes(targetType)) {
      return res.status(400).json({ message: "Invalid targetType" });
    }
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ message: "Invalid reason" });
    }
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: "Invalid targetId" });
    }

    // Resolve the owner of the reported content
    let targetUser;
    if (targetType === "user") {
      const u = await User.findById(targetId).select("_id");
      if (!u) return res.status(404).json({ message: "User not found" });
      targetUser = u._id;
    } else if (targetType === "event") {
      const e = await Event.findById(targetId).select("createdBy");
      if (!e) return res.status(404).json({ message: "Event not found" });
      targetUser = e.createdBy;
    } else if (targetType === "guide") {
      const g = await Guide.findById(targetId).select("author");
      if (!g) return res.status(404).json({ message: "Guide not found" });
      targetUser = g.author;
    }

    if (String(targetUser) === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot report your own content" });
    }

    // Dedupe: one open report per (reporter, targetType, targetId)
    const existing = await Report.findOne({
      reporter: req.user.id,
      targetType,
      targetId,
      status: "open",
    });
    if (existing) {
      return res.status(200).json({
        message: "Report already received. Our team will review within 24 hours.",
        report: existing,
      });
    }

    const report = await Report.create({
      reporter: req.user.id,
      targetType,
      targetId,
      targetUser,
      reason,
      details: typeof details === "string" ? details.slice(0, 1000) : "",
    });

    return res.status(201).json({
      message: "Thanks — we'll review this within 24 hours.",
      report,
    });
  } catch (err) {
    console.error("createReport error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
