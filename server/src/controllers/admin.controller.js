import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { City, VendorType, Vendor } from "../models/vendor.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import AnalyticsLog from "../models/analytics.model.js";
import VerificationRequest from "../models/verification.model.js";
import Notification from "../models/notification.model.js";
import { sendPushNotification } from "../services/notification.service.js";

export async function adminLogin(req, res) {
  const { username, password } = req.body;

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return res.status(500).json({ message: "Admin credentials not configured" });
  }

  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = jwt.sign({ isAdmin: true, username }, config.jwt.secret, {
    expiresIn: "24h",
  });

  res.json({ token });
}

export async function getStats(req, res) {
  try {
    const [totalUsers, totalVendors, totalEvents, totalGuides] = await Promise.all([
      User.countDocuments(),
      Vendor.countDocuments(),
      Event.countDocuments(),
      Guide.countDocuments(),
    ]);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("username email isVendor createdAt profilePicture");

    res.json({ totalUsers, totalVendors, totalEvents, totalGuides, recentUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUsers(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search
      ? {
          $or: [
            { username: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-password -resetPasswordOTP -resetPasswordToken"),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    await Promise.all([
      User.findByIdAndDelete(id),
      Vendor.deleteOne({ user: id }),
    ]);
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Vendors ────────────────────────────────────────────────────────────────

export async function getVendors(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [vendors, total] = await Promise.all([
      Vendor.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("city", "name state")
        .populate("vendorType", "name icon")
        .populate("user", "username email"),
      Vendor.countDocuments(query),
    ]);

    res.json({ vendors, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleVendorVerified(req, res) {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    vendor.verified = !vendor.verified;
    await vendor.save();

    // Sync verified status to linked user if exists
    if (vendor.user) {
      User.findByIdAndUpdate(vendor.user, { verified: vendor.verified }).catch(() => {});
    }

    res.json({ verified: vendor.verified });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteVendor(req, res) {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    if (vendor?.user) {
      User.findByIdAndUpdate(vendor.user, { isVendor: false }).catch(() => {});
    }
    res.json({ message: "Vendor deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Cities ─────────────────────────────────────────────────────────────────

export async function getCitiesAdmin(req, res) {
  try {
    const cities = await City.find().sort({ name: 1 });
    res.json(cities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createCity(req, res) {
  try {
    const { name, state } = req.body;
    if (!name || !state) {
      return res.status(400).json({ message: "Name and state are required" });
    }
    const city = await new City({ name: name.trim(), state: state.trim() }).save();
    res.status(201).json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteCity(req, res) {
  try {
    const { id } = req.params;
    await City.findByIdAndDelete(id);
    res.json({ message: "City deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Vendor Types ───────────────────────────────────────────────────────────

export async function getVendorTypesAdmin(req, res) {
  try {
    const vendorTypes = await VendorType.find().sort({ name: 1 });
    res.json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createVendorType(req, res) {
  try {
    const { name, icon } = req.body;
    if (!name || !icon) {
      return res.status(400).json({ message: "Name and icon are required" });
    }
    const vendorType = await new VendorType({ name: name.trim(), icon: icon.trim() }).save();
    res.status(201).json(vendorType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteVendorType(req, res) {
  try {
    const { id } = req.params;
    await VendorType.findByIdAndDelete(id);
    res.json({ message: "Vendor type deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Events ─────────────────────────────────────────────────────────────────

export async function getEvents(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { title: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "username email"),
      Event.countDocuments(query),
    ]);

    res.json({ events, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleEventActive(req, res) {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    event.isActive = !event.isActive;
    await event.save();
    res.json({ isActive: event.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteEvent(req, res) {
  try {
    const { id } = req.params;
    await Event.findByIdAndDelete(id);
    res.json({ message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Guides ─────────────────────────────────────────────────────────────────

export async function getGuides(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { title: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [guides, total] = await Promise.all([
      Guide.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("author", "username email"),
      Guide.countDocuments(query),
    ]);

    res.json({ guides, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleGuideActive(req, res) {
  try {
    const { id } = req.params;
    const guide = await Guide.findById(id);
    if (!guide) return res.status(404).json({ message: "Guide not found" });
    guide.isActive = !guide.isActive;
    await guide.save();
    res.json({ isActive: guide.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteGuide(req, res) {
  try {
    const { id } = req.params;
    await Guide.findByIdAndDelete(id);
    res.json({ message: "Guide deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Analytics ──────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(req, res) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [totalEvents, eventBreakdown, dailyTotals, topUsers] = await Promise.all([
      AnalyticsLog.countDocuments(),

      // Count by event type
      AnalyticsLog.aggregate([
        { $group: { _id: "$event", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Daily totals for last 7 days
      AnalyticsLog.aggregate([
        { $match: { timestamp: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$timestamp" },
              month: { $month: "$timestamp" },
              day: { $dayOfMonth: "$timestamp" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),

      // Top active users
      AnalyticsLog.aggregate([
        { $match: { userId: { $ne: null } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmpty: true } },
        {
          $project: {
            count: 1,
            username: "$user.username",
            email: "$user.email",
          },
        },
      ]),
    ]);

    // Fill missing days with 0
    const dailyMap = {};
    dailyTotals.forEach(({ _id, count }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, "0")}-${String(_id.day).padStart(2, "0")}`;
      dailyMap[key] = count;
    });
    const dailySeries = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dailySeries.push({ date: key, count: dailyMap[key] ?? 0 });
    }

    res.json({ totalEvents, eventBreakdown, dailySeries, topUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Verifications ──────────────────────────────────────────────────────────

export async function getVerifications(req, res) {
  try {
    const { status = "", page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      VerificationRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "username email profilePicture isVendor"),
      VerificationRequest.countDocuments(query),
    ]);

    res.json({ requests, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function approveVerification(req, res) {
  try {
    const { id } = req.params;
    const { reviewedBy = "admin" } = req.body ?? {};

    const request = await VerificationRequest.findById(id).populate("user", "_id fcmToken");
    if (!request) return res.status(404).json({ message: "Verification request not found" });

    request.status = "approved";
    request.reviewedAt = new Date();
    request.reviewedBy = reviewedBy;
    await request.save();

    // Set user.verified = true
    await User.findByIdAndUpdate(request.user._id, { verified: true });

    // Sync to linked Vendor doc if exists
    Vendor.findOneAndUpdate({ user: request.user._id }, { verified: true }).catch(() => {});

    // In-app notification
    await Notification.create({
      user: request.user._id,
      type: "verification_approved",
      title: "Business Verified!",
      body: "Your business has been verified. You now have a verification badge on your profile.",
      data: {},
    });

    // Push notification
    if (request.user.fcmToken) {
      sendPushNotification(
        request.user.fcmToken,
        "Business Verified!",
        "Your business has been verified. You now have a verification badge on your profile.",
        { type: "verification_approved" }
      ).catch(() => {});
    }

    res.json({ status: "approved" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function rejectVerification(req, res) {
  try {
    const { id } = req.params;
    const { reviewNotes = "", reviewedBy = "admin" } = req.body;

    const request = await VerificationRequest.findById(id).populate("user", "_id fcmToken");
    if (!request) return res.status(404).json({ message: "Verification request not found" });

    request.status = "rejected";
    request.reviewNotes = reviewNotes;
    request.reviewedAt = new Date();
    request.reviewedBy = reviewedBy;
    await request.save();

    const notifBody = reviewNotes
      ? `Your verification request was not approved. Reason: ${reviewNotes}. You may resubmit.`
      : "Your verification request was not approved. You may resubmit with updated documents.";

    // In-app notification
    await Notification.create({
      user: request.user._id,
      type: "verification_rejected",
      title: "Verification Not Approved",
      body: notifBody,
      data: {},
    });

    // Push notification
    if (request.user.fcmToken) {
      sendPushNotification(
        request.user.fcmToken,
        "Verification Not Approved",
        notifBody,
        { type: "verification_rejected" }
      ).catch(() => {});
    }

    res.json({ status: "rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getAnalyticsEvents(req, res) {
  try {
    const { event = "", page = 1, limit = 20 } = req.query;
    const query = event ? { event } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AnalyticsLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "username email"),
      AnalyticsLog.countDocuments(query),
    ]);

    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
