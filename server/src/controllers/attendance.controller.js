import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import {
  issueEventPass,
  computeAttendanceStatus,
} from "../services/pass.service.js";
import { parsePassCode, passQrDataUrl } from "../utils/qrcode.js";
import { buildEventSignups } from "../services/eventSignups.service.js";

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

    const event = await Event.findById(eventId).select(
      "createdBy title location city additionalLocations"
    );
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
      // Which venue this pass was issued for, so staff on the door of a
      // multi-venue event can see a Lagos pass turning up in Abuja. Surfaced,
      // not enforced: one organizer scans every door, and turning a paying
      // guest away over a mis-tapped radio button isn't ours to decide.
      locationIndex: pass.locationIndex ?? null,
      locationName: pass.locationName || "",
      locationCity: pass.locationCity || "",
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
      // Which door this pass is for, on a multi-venue event.
      locationIndex: p.locationIndex ?? null,
      locationName: p.locationName || "",
      locationCity: p.locationCity || "",
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
 * people-shaped — it's what the "Who's coming" screen renders. For a
 * multi-venue event it also breaks the headcount down per venue, so the
 * organizer knows who to expect at which door.
 *
 * Open to the creator and co-hosts, matching the gate the event screen already
 * uses to show attendance at all. The admin console reads the same answer
 * through its own endpoint — see buildEventSignups.
 */
export const getEventSignups = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId).select(
      "createdBy cohosts rsvpUsers invitedUsers date title location address city state country additionalLocations"
    );
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isCreator = event.createdBy.toString() === userId;
    const isCohost = (event.cohosts || []).some((c) => c.toString() === userId);
    if (!isCreator && !isCohost) {
      return res
        .status(403)
        .json({ message: "Only the organizer can view who signed up." });
    }

    res.json(await buildEventSignups(event));
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
      .populate("event", "title date location address additionalLocations image isPaid")
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
        // Where THIS pass gets the holder in, for a multi-venue event. The
        // snapshot, not a live lookup — it's what they were told when they
        // picked, and the event's venue list can have moved on since.
        locationIndex: p.locationIndex ?? null,
        locationName: p.locationName || "",
        locationCity: p.locationCity || "",
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
      .select("title date location address additionalLocations image")
      .lean();

    res.json({
      pass: {
        id: pass._id,
        type: pass.type,
        status: computeAttendanceStatus(pass, event?.date),
        attendedAt: pass.attendedAt || null,
        event,
        locationIndex: pass.locationIndex ?? null,
        locationName: pass.locationName || "",
        locationCity: pass.locationCity || "",
        qr: await passQrDataUrl(pass.code),
      },
    });
  } catch (error) {
    console.error("getMyPassForEvent error:", error);
    res.status(500).json({ message: "Failed to load pass", details: error.message });
  }
};
