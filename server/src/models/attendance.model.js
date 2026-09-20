import mongoose from "mongoose";
import crypto from "crypto";

/**
 * An event "pass" — a unified attendance record issued to a user when they RSVP
 * (free events) or buy a ticket (paid events). It carries the QR `code` that is
 * emailed to the user; the organizer scans it in-app to mark the holder as
 * attended.
 *
 * Passes come in two shapes:
 *   - RSVP passes (free events): one per (event, user) — a user who RSVPs twice
 *     reuses the same QR.
 *   - Ticket passes (paid events): one per TICKET, so a buyer can hold several
 *     tickets for one event (bought for themselves and/or gifted to others), each
 *     with its own QR emailed to that ticket's recipient.
 */
const attendanceSchema = mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "event",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // How the pass was issued.
    type: { type: String, enum: ["rsvp", "ticket"], required: true },

    // Link to the ticket, when this pass came from a paid purchase. Unique per
    // ticket (partial index below) so each ticket gets exactly one pass.
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "ticket" },

    // Email the QR was sent to. For gifted tickets this is the recipient's
    // address (not the buyer's). Falls back to the pass owner's account email.
    recipientEmail: { type: String },

    // The opaque token embedded in the QR. High-entropy + unique, so it can't be
    // guessed or forged; the scanner sends it back and we look the pass up.
    code: { type: String, unique: true, required: true },

    // Which STOP of a programme this pass admits to (see utils/subEvents.js).
    // `null` is the main event — and it is also what every pass issued before
    // sub-events existed carries, so old records read correctly with no
    // backfill. The title is snapshotted for the same reason locationName is:
    // the organizer can rename a stop afterwards.
    subEvent: { type: mongoose.Schema.Types.ObjectId, default: null },
    subEventTitle: { type: String },
    // Snapshotted alongside the title, same reasoning as locationName/City: a
    // stop's own date can be edited after passes are issued (updateEvent
    // replaces the whole subEvents array), and an already-issued pass must
    // keep saying the time its holder was actually told, not drift with it.
    subEventDate: { type: Date },

    // Which venue of a multi-venue event the holder is attending. An index into
    // allVenues(event) — 0 is the event's own location, 1..n its
    // additionalLocations — with the name/city SNAPSHOT beside it, because the
    // organizer can reorder or rewrite that list afterwards. All three are
    // absent on a single-venue event and on passes issued before the picker
    // shipped; see resolveVenueChoice() in utils/eventLocations.js.
    locationIndex: { type: Number },
    locationName: { type: String },
    locationCity: { type: String },

    // Attendance lifecycle. "issued" until scanned, then "attended".
    status: { type: String, enum: ["issued", "attended"], default: "issued" },
    attendedAt: { type: Date },
    // The organizer/admin who scanned the holder in.
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { timestamps: true }
);

// RSVP passes: one per (event, user, subEvent) — a guest RSVPs to each stop of a
// programme separately and holds a pass for each. Partial index so ticket passes
// (which can legitimately repeat per (event, user) when someone buys several)
// are exempt. A missing `subEvent` indexes as null, so an event with no
// programme still allows exactly one RSVP pass per user, as it always did.
attendanceSchema.index(
  { event: 1, user: 1, subEvent: 1 },
  { unique: true, partialFilterExpression: { type: "rsvp" } }
);
// Ticket passes: one pass per ticket.
attendanceSchema.index(
  { ticket: 1 },
  { unique: true, partialFilterExpression: { ticket: { $exists: true } } }
);
// NOTE: two superseded indexes must be dropped in any existing database (run
// `Attendance.syncIndexes()` or drop them manually), or they keep enforcing
// rules this schema no longer intends:
//   - the original non-partial unique { event, user } — blocks multiple ticket
//     passes per (event, user);
//   - the partial unique { event, user } added with it — blocks a second RSVP
//     pass, so a guest could only ever join ONE stop of a programme.

/** Generate a fresh, unguessable QR code token. */
export function generatePassCode() {
  return crypto.randomBytes(24).toString("hex");
}

export default mongoose.model("attendance", attendanceSchema);
