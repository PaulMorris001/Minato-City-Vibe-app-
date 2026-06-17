import Attendance, { generatePassCode } from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import { passQrBuffer } from "../utils/qrcode.js";
import { sendEventPassEmail } from "./email.service.js";

/** Format an event date for the pass email, defensively. */
function formatEventDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Issue (or upgrade) an event pass for a user and email them the QR code.
 *
 * Idempotent: one pass per (event, user). RSVPing twice reuses the existing
 * code and does NOT re-send the email. Buying a ticket after RSVPing upgrades
 * the pass type to "ticket" and re-sends (now as a ticket).
 *
 * Safe to call fire-and-forget — it never throws to the caller; failures are
 * logged so a flaky mailer can't break an RSVP or a ticket purchase.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.eventId
 * @param {"rsvp"|"ticket"} args.type
 * @param {string} [args.ticketId]
 * @returns {Promise<void>}
 */
export async function issueEventPass({ userId, eventId, type, ticketId = null }) {
  try {
    let pass = await Attendance.findOne({ event: eventId, user: userId });
    let shouldEmail = false;

    if (!pass) {
      try {
        pass = await Attendance.create({
          event: eventId,
          user: userId,
          type,
          ticket: ticketId || undefined,
          code: generatePassCode(),
        });
        shouldEmail = true;
      } catch (err) {
        // Concurrent issue created it first — fetch the winner, no email.
        if (err?.code === 11000) {
          pass = await Attendance.findOne({ event: eventId, user: userId });
        } else {
          throw err;
        }
      }
    } else if (type === "ticket" && pass.type !== "ticket") {
      // Upgrade an existing RSVP pass to a ticket and re-send as a ticket.
      pass.type = "ticket";
      if (ticketId) pass.ticket = ticketId;
      await pass.save();
      shouldEmail = true;
    }

    if (!pass || !shouldEmail) return;

    // Email is best-effort and must not block or fail the caller's flow.
    const [user, event] = await Promise.all([
      User.findById(userId).select("email username").lean(),
      Event.findById(eventId).select("title date location address").lean(),
    ]);
    if (!user?.email || !event) return;

    const qrBuffer = await passQrBuffer(pass.code);
    await sendEventPassEmail(user.email, {
      username: user.username,
      eventTitle: event.title,
      eventDateText: formatEventDate(event.date),
      eventLocation: event.address || event.location || "",
      qrBuffer,
      type: pass.type,
    });
  } catch (err) {
    console.error(
      `[pass.service] issueEventPass failed (user=${userId} event=${eventId} type=${type}):`,
      err?.message ?? err
    );
  }
}

/**
 * Compute a user-facing attendance status for a pass.
 *   - "attended": they were scanned in.
 *   - "incoming": event hasn't happened yet.
 *   - "missed":   event date passed and they were never scanned in.
 */
export function computeAttendanceStatus(pass, eventDate) {
  if (pass?.status === "attended") return "attended";
  const date = eventDate ? new Date(eventDate).getTime() : null;
  if (date == null) return "incoming";
  // Give a day of grace after the start so a late-evening event isn't flagged
  // "missed" the instant its start time passes.
  const graceMs = 24 * 60 * 60 * 1000;
  return Date.now() <= date + graceMs ? "incoming" : "missed";
}
