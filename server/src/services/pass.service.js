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
 * Issue an event pass and email the QR code.
 *
 * Two modes, by `type`:
 *   - "ticket" with a `ticketId`: one pass PER TICKET. A buyer can hold several
 *     tickets for one event, each its own pass. Idempotent on the ticket. The QR
 *     is emailed to `recipientEmail` (for gifted tickets) or the owner's email.
 *   - "rsvp" (free events): one pass per (event, user). RSVPing twice reuses the
 *     existing code and does NOT re-send.
 *
 * Safe to call fire-and-forget — it never throws to the caller; failures are
 * logged so a flaky mailer can't break an RSVP or a ticket purchase.
 *
 * @param {object} args
 * @param {string} args.userId              pass owner / attendee
 * @param {string} args.eventId
 * @param {"rsvp"|"ticket"} args.type
 * @param {string} [args.ticketId]          required for per-ticket passes
 * @param {string} [args.recipientEmail]    where to send the QR (defaults to owner email)
 * @param {string} [args.recipientName]     display name for the email greeting
 * @returns {Promise<void>}
 */
export async function issueEventPass({
  userId,
  eventId,
  type,
  ticketId = null,
  recipientEmail = null,
  recipientName = null,
}) {
  try {
    let pass = null;
    let shouldEmail = false;
    const perTicket = type === "ticket" && ticketId;

    if (perTicket) {
      pass = await Attendance.findOne({ ticket: ticketId });
      if (!pass) {
        try {
          pass = await Attendance.create({
            event: eventId,
            user: userId,
            type: "ticket",
            ticket: ticketId,
            recipientEmail: recipientEmail || undefined,
            code: generatePassCode(),
          });
          shouldEmail = true;
        } catch (err) {
          // Concurrent issue created it first — fetch the winner, no email.
          if (err?.code === 11000) pass = await Attendance.findOne({ ticket: ticketId });
          else throw err;
        }
      }
    } else {
      // RSVP pass — one per (event, user).
      pass = await Attendance.findOne({ event: eventId, user: userId, type: "rsvp" });
      if (!pass) {
        try {
          pass = await Attendance.create({
            event: eventId,
            user: userId,
            type: "rsvp",
            code: generatePassCode(),
          });
          shouldEmail = true;
        } catch (err) {
          if (err?.code === 11000)
            pass = await Attendance.findOne({ event: eventId, user: userId, type: "rsvp" });
          else throw err;
        }
      }
    }

    if (!pass || !shouldEmail) return;

    // Email is best-effort and must not block or fail the caller's flow. Send to
    // the ticket recipient when given (gifting), else the pass owner's email.
    const [user, event] = await Promise.all([
      User.findById(userId).select("email username").lean(),
      Event.findById(eventId).select("title date location address").lean(),
    ]);
    const toEmail = recipientEmail || pass.recipientEmail || user?.email;
    if (!toEmail || !event) return;

    const qrBuffer = await passQrBuffer(pass.code);
    await sendEventPassEmail(toEmail, {
      username: recipientName || user?.username || "there",
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
