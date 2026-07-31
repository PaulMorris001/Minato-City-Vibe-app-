import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
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
 * GET /api/events/:eventId/signups
 *
 * The organizer's guest list: one row per person who signed up, whether they
 * RSVP'd to a free event or paid for a ticket. Unlike /attendance (which lists
 * passes, so a buyer of three tickets appears three times) this is
 * people-shaped — it's what the "Who's coming" screen renders.
 *
 * Open to the creator and co-hosts, matching the gate the event screen already
 * uses to show attendance at all.
 */
export const getEventSignups = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId).select(
      "createdBy cohosts rsvpUsers invitedUsers date title"
    );
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isCreator = event.createdBy.toString() === userId;
    const isCohost = (event.cohosts || []).some((c) => c.toString() === userId);
    if (!isCreator && !isCohost) {
      return res
        .status(403)
        .json({ message: "Only the organizer can view who signed up." });
    }

    // RSVP side: people who confirmed, plus anyone already counted as attending
    // (joined via link or accepted an invite).
    const rsvpIds = [
      ...new Set(
        [...(event.rsvpUsers || []), ...(event.invitedUsers || [])].map(String)
      ),
    ];

    const [tickets, passes] = await Promise.all([
      Ticket.find({ event: eventId, isValid: true })
        .select("user tierName purchaseDate")
        .lean(),
      Attendance.find({ event: eventId })
        .select("user status attendedAt createdAt")
        .lean(),
    ]);

    // Ticket rows collapse to one entry per holder.
    const ticketsByUser = new Map();
    for (const t of tickets) {
      if (!t.user) continue;
      const key = String(t.user);
      const row = ticketsByUser.get(key) || { count: 0, tiers: [], firstAt: null };
      row.count += 1;
      if (t.tierName && !row.tiers.includes(t.tierName)) row.tiers.push(t.tierName);
      if (t.purchaseDate && (!row.firstAt || t.purchaseDate < row.firstAt)) {
        row.firstAt = t.purchaseDate;
      }
      ticketsByUser.set(key, row);
    }

    // Pass state gives us check-in status and, for RSVPs, a "signed up" time.
    const passByUser = new Map();
    for (const p of passes) {
      if (!p.user) continue;
      const key = String(p.user);
      const existing = passByUser.get(key);
      const attended = p.status === "attended";
      if (!existing) {
        passByUser.set(key, {
          checkedIn: attended,
          attendedAt: p.attendedAt || null,
          createdAt: p.createdAt || null,
        });
      } else {
        if (attended && !existing.checkedIn) {
          existing.checkedIn = true;
          existing.attendedAt = p.attendedAt || existing.attendedAt;
        }
        if (p.createdAt && (!existing.createdAt || p.createdAt < existing.createdAt)) {
          existing.createdAt = p.createdAt;
        }
      }
    }

    const allIds = [...new Set([...rsvpIds, ...ticketsByUser.keys()])];
    const users = await User.find({ _id: { $in: allIds } })
      .select("username profilePicture isGuest")
      .lean();

    const attendees = users.map((u) => {
      const key = String(u._id);
      const ticket = ticketsByUser.get(key);
      const pass = passByUser.get(key);
      return {
        userId: key,
        username: u.username,
        profilePicture: u.profilePicture || "",
        // Guest accounts are created for ticket recipients who never installed
        // the app — the client shouldn't link to an empty profile.
        isGuest: !!u.isGuest,
        type: ticket ? "ticket" : "rsvp",
        ticketCount: ticket?.count || 0,
        tiers: ticket?.tiers || [],
        checkedIn: !!pass?.checkedIn,
        attendedAt: pass?.attendedAt || null,
        joinedAt: ticket?.firstAt || pass?.createdAt || null,
      };
    });

    // Most recent signups first; anyone without a timestamp (legacy RSVPs with
    // no pass) sorts to the end alphabetically.
    attendees.sort((a, b) => {
      if (a.joinedAt && b.joinedAt) return new Date(b.joinedAt) - new Date(a.joinedAt);
      if (a.joinedAt) return -1;
      if (b.joinedAt) return 1;
      return (a.username || "").localeCompare(b.username || "");
    });

    res.json({
      total: attendees.length,
      rsvpCount: attendees.filter((a) => a.type === "rsvp").length,
      ticketCount: attendees.filter((a) => a.type === "ticket").length,
      ticketsIssued: tickets.length,
      attendedCount: attendees.filter((a) => a.checkedIn).length,
      attendees,
    });
  } catch (error) {
    console.error("getEventSignups error:", error);
    res.status(500).json({ message: "Failed to load signups", details: error.message });
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
