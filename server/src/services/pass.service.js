import Attendance, { generatePassCode } from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import { passQrBuffer } from "../utils/qrcode.js";
import { sendEventPassEmail } from "./email.service.js";
import { allVenues, venueLabel, venueSummary } from "../utils/eventLocations.js";
import { findStop, stopLabel } from "../utils/subEvents.js";

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
 * @param {object} [args.venueChoice]       `{ locationIndex, locationName, locationCity }`
 *   from resolveVenueChoice(), for a multi-venue event. Re-RSVPing with a
 *   different venue MOVES an existing RSVP pass (same QR, new door) — the code
 *   is the entitlement and does not need reissuing to change where it is used.
 * @param {string|null} [args.subEvent]      which stop of a programme this pass
 *   admits to — null is the main event, which is also what a pass predating this
 *   feature carries. Part of the RSVP dedup key: a guest holds one pass PER STOP.
 * @param {string} [args.subEventTitle]      snapshot, same reasoning as tierName.
 * @param {Date} [args.subEventDate]          snapshot of the stop's own start —
 *   an edit to the stop afterward must not retroactively change what an
 *   already-issued pass says.
 * @returns {Promise<void>}
 */
export async function issueEventPass({
  userId,
  eventId,
  type,
  ticketId = null,
  recipientEmail = null,
  recipientName = null,
  venueChoice = null,
  subEvent = null,
  subEventTitle = undefined,
  subEventDate = undefined,
  sendEmail = true,
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
            ...(venueChoice || {}),
            subEvent,
            subEventTitle,
            subEventDate,
          });
          shouldEmail = true;
        } catch (err) {
          // Concurrent issue created it first — fetch the winner, no email.
          if (err?.code === 11000) pass = await Attendance.findOne({ ticket: ticketId });
          else throw err;
        }
      }
    } else {
      // RSVP pass — one per (event, user, subEvent): a guest holds a separate
      // pass for EACH stop of a programme they join. `subEvent: null` (the
      // main event) is also what querying a pre-programme pass matches — Mongo
      // treats an absent field as null for equality, so old data needs no backfill.
      pass = await Attendance.findOne({ event: eventId, user: userId, type: "rsvp", subEvent });
      if (!pass) {
        try {
          pass = await Attendance.create({
            event: eventId,
            user: userId,
            type: "rsvp",
            code: generatePassCode(),
            ...(venueChoice || {}),
            subEvent,
            subEventTitle,
            subEventDate,
          });
          shouldEmail = true;
        } catch (err) {
          if (err?.code === 11000)
            pass = await Attendance.findOne({ event: eventId, user: userId, type: "rsvp", subEvent });
          else throw err;
        }
      } else if (venueChoice && pass.locationIndex !== venueChoice.locationIndex) {
        // Switching venue on a pass they already hold. Only ever from an
        // explicit new pick, so a client that sends nothing can't blank it.
        Object.assign(pass, venueChoice);
        await pass.save();
      }
    }

    // `sendEmail: false` still records the pass — it is the entitlement, and the
    // QR must be valid — it only skips delivery. Used when repairing an order
    // long after the fact, where mailing a pass for a finished event would
    // confuse the holder more than help them.
    if (!pass || !shouldEmail || !sendEmail) return;

    // Email is best-effort and must not block or fail the caller's flow. Send to
    // the ticket recipient when given (gifting), else the pass owner's email.
    const [user, event] = await Promise.all([
      User.findById(userId).select("email username").lean(),
      Event.findById(eventId).select("title date location address city additionalLocations subEvents").lean(),
    ]);
    const toEmail = recipientEmail || pass.recipientEmail || user?.email;
    if (!toEmail || !event) return;

    // A pass that named a venue must say where THAT holder is going; listing
    // every venue of a multi-city event sends them to the wrong door. Read off
    // the live venue rather than the pass's snapshot because this email goes out
    // moments after the pick, and the live copy carries the street address.
    const pickedVenue =
      pass.locationIndex != null ? allVenues(event)[pass.locationIndex] : null;
    // Same idea, one level deeper: a pass for ONE STOP of a programme must say
    // that stop's own time and place, not the umbrella's — a guest going only to
    // the 9pm after-party should not be emailed the 9am start time. Title/date
    // come off the pass's OWN snapshot (an edit to the stop afterward must not
    // retroactively change what an already-issued pass says); the place is
    // still resolved live, same reasoning as pickedVenue above.
    const stop = pass.subEvent != null ? findStop(event, pass.subEvent) : null;

    const qrBuffer = await passQrBuffer(pass.code);
    await sendEventPassEmail(toEmail, {
      username: recipientName || user?.username || "there",
      eventTitle: stop ? `${event.title} — ${pass.subEventTitle || stop.title}` : event.title,
      eventDateText: formatEventDate(pass.subEventDate || (stop ? stop.date : event.date)),
      eventLocation: stop ? stopLabel(stop) : pickedVenue ? venueLabel(pickedVenue) : venueSummary(event),
      qrBuffer,
      // Printed under the QR in the PDF so door staff can key it in when a
      // screen won't scan.
      code: pass.code,
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
