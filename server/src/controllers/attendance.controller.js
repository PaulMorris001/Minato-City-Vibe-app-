import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import {
  issueEventPass,
  computeAttendanceStatus,
} from "../services/pass.service.js";
import { parsePassCode, passQrDataUrl } from "../utils/qrcode.js";

/**
 * POST /api/events/:eventId/check-in   { code }
 *
 * Organizer scans an attendee's QR. Validates the pass belongs to this event,
 * then marks the holder attended. Only the event creator can check people in.
 */
export const checkInAttendee = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { code: rawCode } = req.body;
    const userId = req.user.id;

    const code = parsePassCode(rawCode);
    if (!code) {
      return res.status(400).json({ message: "That's not a valid OurCityvibe pass code." });
    }

    const event = await Event.findById(eventId).select("createdBy title");
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Only the organizer may check attendees in.
    if (event.createdBy.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Only the event organizer can scan attendees in." });
    }

    const pass = await Attendance.findOne({ code }).populate(
      "user",
      "username profilePicture email"
    );
    if (!pass) {
      return res.status(404).json({ message: "Pass not found. This QR isn't recognized." });
    }

    // Guard against scanning a valid pass at the wrong event.
    if (pass.event.toString() !== eventId) {
      return res
        .status(400)
        .json({ message: "This pass is for a different event." });
    }

    const attendee = {
      id: pass.user?._id,
      username: pass.user?.username,
      profilePicture: pass.user?.profilePicture || "",
      type: pass.type,
    };

    if (pass.status === "attended") {
      return res.status(200).json({
        alreadyCheckedIn: true,
        message: `${attendee.username || "This guest"} was already checked in.`,
        attendedAt: pass.attendedAt,
        attendee,
      });
    }

    pass.status = "attended";
    pass.attendedAt = new Date();
    pass.checkedInBy = userId;
    await pass.save();

    return res.status(200).json({
      alreadyCheckedIn: false,
      message: `${attendee.username || "Guest"} checked in!`,
      attendedAt: pass.attendedAt,
      attendee,
    });
  } catch (error) {
    console.error("checkInAttendee error:", error);
    res.status(500).json({ message: "Failed to check in attendee", details: error.message });
  }
};

/**
 * GET /api/events/:eventId/attendance
 *
 * Organizer-only roster + counts for the door. Returns each pass with the
 * holder and whether they've been scanned in.
 */
export const getEventAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId).select("createdBy date");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Only the event organizer can view attendance." });
    }

    const passes = await Attendance.find({ event: eventId })
      .populate("user", "username profilePicture")
      .sort({ status: -1, attendedAt: -1, createdAt: 1 })
      .lean();

    const attendees = passes.map((p) => ({
      id: p._id,
      user: p.user,
      type: p.type,
      status: p.status,
      attendedAt: p.attendedAt || null,
    }));

    const attendedCount = attendees.filter((a) => a.status === "attended").length;

    res.json({
      total: attendees.length,
      attendedCount,
      attendees,
    });
  } catch (error) {
    console.error("getEventAttendance error:", error);
    res.status(500).json({ message: "Failed to load attendance", details: error.message });
  }
};

/**
 * GET /api/my-passes
 *
 * The signed-in user's passes across all events, each with the QR (for showing
 * in-app) and a computed status: "incoming" | "attended" | "missed".
 */
export const getMyPasses = async (req, res) => {
  try {
    const userId = req.user.id;
    const passes = await Attendance.find({ user: userId })
      .populate("event", "title date location address image isPaid")
      // Tier name so ticket passes can show "VIP" etc. at the door.
      .populate("ticket", "tierName")
      .sort({ createdAt: -1 })
      .lean();

    // Drop passes whose event was deleted.
    const valid = passes.filter((p) => p.event);

    const result = await Promise.all(
      valid.map(async (p) => ({
        id: p._id,
        type: p.type,
        status: computeAttendanceStatus(p, p.event?.date),
        attendedAt: p.attendedAt || null,
        event: p.event,
        tierName: p.ticket?.tierName || null,
        qr: await passQrDataUrl(p.code),
      }))
    );

    res.json({ passes: result });
  } catch (error) {
    console.error("getMyPasses error:", error);
    res.status(500).json({ message: "Failed to load passes", details: error.message });
  }
};

/**
 * GET /api/my-passes/:eventId
 *
 * The signed-in user's pass for one event (with QR). Lazily issues a pass if
 * the user is a confirmed attendee but somehow doesn't have one yet (e.g. they
 * RSVPed before the pass feature shipped).
 */
export const getMyPassForEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    let pass = await Attendance.findOne({ event: eventId, user: userId }).lean();

    if (!pass) {
      // Backfill for attendees who predate the pass feature.
      const event = await Event.findById(eventId).select("rsvpUsers isPaid");
      const isAttendee =
        event &&
        event.rsvpUsers?.some((id) => id.toString() === userId);
      if (isAttendee) {
        await issueEventPass({
          userId,
          eventId,
          type: event.isPaid ? "ticket" : "rsvp",
        });
        pass = await Attendance.findOne({ event: eventId, user: userId }).lean();
      }
    }

    if (!pass) {
      return res
        .status(404)
        .json({ message: "No pass found for this event." });
    }

    const event = await Event.findById(eventId)
      .select("title date location address image")
      .lean();

    res.json({
      pass: {
        id: pass._id,
        type: pass.type,
        status: computeAttendanceStatus(pass, event?.date),
        attendedAt: pass.attendedAt || null,
        event,
        qr: await passQrDataUrl(pass.code),
      },
    });
  } catch (error) {
    console.error("getMyPassForEvent error:", error);
    res.status(500).json({ message: "Failed to load pass", details: error.message });
  }
};
